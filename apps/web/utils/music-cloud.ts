import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "./supabase/server";
import { generationFailure, privateHeaders } from "./generation-server";
import { publicJob, validGenerationId } from "./generation";

export const MUSIC_BUCKET = "generated-music";
export const CLOUD_AUDIO_LIMIT = 8 * 1024 * 1024;
// PostgREST can represent a composite RPC result as a single-row array.
export const musicRpcRow = (value: unknown): Record<string, unknown> | null => {
  const row = Array.isArray(value) ? (value.length === 1 ? value[0] : null) : value;
  return row && typeof row === "object" && !Array.isArray(row) ? row as Record<string, unknown> : null;
};
export const MUSIC_FIELDS = "id,status,moment,genre,kind,duration,created_at,updated_at,lyrics,audio_path,actual_duration,origin,worker_id,lease_id";
export function cloudMusicConfigured() { return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()); }
export function musicService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key || key.startsWith("sb_publishable_")) throw new Error("Persistent music server setup is incomplete");
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(20_000) }) } });
}
export const musicPath = (owner: string, id: string) => {
  if (!validGenerationId(owner) || !validGenerationId(id)) throw new Error("Invalid recording identity");
  return `${owner}/${id}/track.mp3`;
};
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export const newWorkerToken = () => "emw_" + randomBytes(48).toString("base64url");
export const musicSetupMissing = (error?: { code?: string } | null) => !!error && ["PGRST202", "PGRST205", "42P01", "42883"].includes(error.code ?? "");
export function musicDatabaseFailure(error: { code?: string }) {
  if (musicSetupMissing(error)) return generationFailure("Persistent music-server setup is not finished yet.", 503);
  if (error.code === "54000") return generationFailure("The music server is busy or the recent generation limit was reached. Please wait before starting another track.", 429);
  if (error.code === "23505") return generationFailure("This track identifier is already in use. Start a new request.", 409);
  if (error.code === "55000") return generationFailure("The music server is offline or a recording is still in progress. Please check its status.", 409);
  if (["23514", "22023", "22P02"].includes(error.code ?? "")) return generationFailure("Check your moment, genre, and output type.", 400);
  return generationFailure("The music service couldn’t complete the request. Please try again shortly.", 503);
}
export async function cloudServerStatus(owner: string) {
  const { data, error } = await musicService().from("music_workers").select("id,last_seen,ready")
    .eq("owner_id", owner).is("revoked_at", null).maybeSingle();
  if (error) throw new Error(musicSetupMissing(error) ? "Persistent music-server setup is not finished yet." : "The music server status is unavailable.");
  const online = Boolean(data?.ready && data.last_seen && Date.now() - Date.parse(data.last_seen) < 90_000);
  return { enrolled: Boolean(data), ready: online, lastSeen: data?.last_seen ?? null };
}
export async function cloudRecording(owner: string, id: string) {
  const client = await createClient();
  const { data, error } = await client.from("music_recordings").select(MUSIC_FIELDS).eq("owner_id", owner).eq("id", id).maybeSingle();
  if (error) throw new Error("The recording could not be loaded");
  return data;
}
export async function cloudJobs(owner: string) {
  const client = await createClient();
  const { data, error } = await client.from("music_recordings").select(MUSIC_FIELDS)
    .eq("owner_id", owner).neq("status", "importing").order("created_at", { ascending: false }).limit(20);
  if (error) throw new Error("The recordings could not be loaded");
  return (data ?? []).map(row => publicJob(row));
}
export async function workerIdentity(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!/^Bearer emw_[A-Za-z0-9_-]{64}$/.test(authorization)) return { error: generationFailure("Worker authentication required.", 401) };
  try {
    const service = musicService();
    const { data, error } = await service.from("music_workers").select("id,owner_id")
      .eq("secret_hash", tokenHash(authorization.slice(7))).is("revoked_at", null).maybeSingle();
    if (error) return { error: generationFailure("The music server connection is not ready.", 503) };
    if (!data) return { error: generationFailure("Worker authentication required.", 401) };
    return { service, worker: data };
  } catch { return { error: generationFailure("Persistent music-server setup is not finished yet.", 503) }; }
}
export async function claimedRecording(service: ReturnType<typeof musicService>, worker: { id: string; owner_id: string }, id: unknown, lease: unknown) {
  if (!validGenerationId(id) || !validGenerationId(lease)) return null;
  const { data, error } = await service.from("music_recordings").select("id,owner_id,worker_id,lease_id,status,origin")
    .eq("id", id).eq("owner_id", worker.owner_id).eq("worker_id", worker.id).eq("lease_id", lease).maybeSingle();
  if (error || !data || !["running", "importing"].includes(data.status)) return null;
  return data;
}
export const musicWorkerReply = (data: unknown) => Response.json(data, { headers: privateHeaders });
