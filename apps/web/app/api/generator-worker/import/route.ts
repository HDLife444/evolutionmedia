import { smallJson, validGenerationId, GENERATION_GENRES, GENERATION_KINDS } from "@/utils/generation";
import { generationFailure } from "@/utils/generation-server";
import { musicRpcRow, musicWorkerReply, workerIdentity } from "@/utils/music-cloud";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const auth = await workerIdentity(request);
  if (auth.error) return auth.error;
  try {
    const input = await smallJson(request) as Record<string, unknown>;
    if (!validGenerationId(input.id) || input.owner_id !== auth.worker.owner_id || typeof input.moment !== "string"
      || !input.moment.trim() || Array.from(input.moment).length > 500 || !GENERATION_GENRES.includes(input.genre as never)
      || !GENERATION_KINDS.includes(input.kind as never) || !Number.isInteger(input.duration) || Number(input.duration) < 10 || Number(input.duration) > 600
      || typeof input.created_at !== "number" || !Number.isFinite(input.created_at) || input.created_at <= 0 || input.created_at > Date.now() / 1000 + 60) {
      return generationFailure("Invalid existing recording.", 400);
    }
    const { data, error } = await auth.service.rpc("reserve_legacy_recording", { p_worker: auth.worker.id,
      p_input: { id: input.id, owner_id: auth.worker.owner_id, moment: input.moment.trim(), genre: input.genre, kind: input.kind, duration: input.duration, created_at: input.created_at } });
    const row = musicRpcRow(data);
    if (error || !row?.id) return generationFailure("The existing recording could not be reserved.", 409);
    return musicWorkerReply({ id: row.id, status: row.status, lease_id: row.lease_id });
  } catch { return generationFailure("Invalid existing recording.", 400); }
}
