import { cookies } from "next/headers";
import { createClient } from "./supabase/server";
import { parseWorkerConnection, type WorkerConnection } from "./generation";

export const CONNECTION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-evolution_generator" : "evolution_generator";
export const privateHeaders = { "Cache-Control": "private, no-store" };
export const generationFailure = (error: string, status: number) => Response.json({ error }, { status, headers: privateHeaders });
export async function generationAdministrator(): Promise<{ owner: string; error?: never } | { owner?: never; error: Response }> {
  try {
    const client = await createClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return { error: generationFailure("Sign in to test music generation.", 401) };
    const { data, error } = await client.rpc("is_song_administrator");
    if (error) return { error: generationFailure("We couldn’t verify administrator access. Please try again.", 503) };
    if (data !== true) return { error: generationFailure("Music generation is available to the administrator during this preview.", 403) };
    return { owner: user.id };
  } catch { return { error: generationFailure("We couldn’t verify your session. Please try again.", 503) }; }
}
export async function workerConnection(owner: string): Promise<WorkerConnection | null> {
  try {
    const value = (await cookies()).get(CONNECTION_COOKIE)?.value;
    if (!value || value.length > 2048) return null;
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (parsed.owner !== owner) return null;
    return parseWorkerConnection(parsed);
  } catch { return null; }
}
export async function workerFetch(connection: WorkerConnection, path: string, options?: { json?: unknown; timeout?: number; method?: "GET" | "POST" | "DELETE" }) {
  // Only server-generated fixed paths are accepted, never arbitrary client URLs.
  return fetch(connection.url + path, {
    method: options?.method ?? (options?.json === undefined ? "GET" : "POST"), redirect: "error", cache: "no-store",
    headers: { Authorization: `Bearer ${connection.key}`, ...(options?.json === undefined ? {} : { "Content-Type": "application/json" }) },
    body: options?.json === undefined ? undefined : JSON.stringify(options.json),
    signal: AbortSignal.timeout(options?.timeout ?? 10_000),
  });
}
export async function workerJson(connection: WorkerConnection, path: string, json?: unknown) {
  const response = await workerFetch(connection, path, { json });
  if (!response.ok) return { ok: false as const, status: response.status };
  const body = await response.text();
  if (Buffer.byteLength(body) > 512_000) throw new Error("Worker response too large");
  return { ok: true as const, data: JSON.parse(body) };
}
