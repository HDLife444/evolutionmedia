export const GENERATION_GENRES = ["soul", "gospel", "rnb", "pop", "jazz", "ambient", "cinematic", "electronic", "rock", "hip-hop", "classical", "country"] as const;
export const GENERATION_KINDS = ["vocal", "instrumental", "soundscape"] as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const validGenerationId = (value: unknown): value is string => typeof value === "string" && uuid.test(value);
export type GenerationInput = { id: string; moment: string; genre: typeof GENERATION_GENRES[number]; kind: typeof GENERATION_KINDS[number]; duration: 30 | 60 | 90 | 120 };
export type WorkerConnection = { url: string; key: string };
export function validGenerationInput(value: unknown): value is GenerationInput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return validGenerationId(v.id) && typeof v.moment === "string" && v.moment.trim().length > 0
    && Array.from(v.moment).length <= 500 && GENERATION_GENRES.includes(v.genre as GenerationInput["genre"])
    && GENERATION_KINDS.includes(v.kind as GenerationInput["kind"]) && [30,60,90,120].includes(v.duration as number);
}
export function parseWorkerConnection(value: unknown): WorkerConnection | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.url !== "string" || typeof v.key !== "string" || !/^[A-Za-z0-9_-]{32,128}$/.test(v.key)) return null;
  try {
    const url = new URL(v.url);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash || url.pathname !== "/") return null;
    // Prototype connections only target HTTPS Cloudflare tunnels. Reject private
    // IPs, metadata services, arbitrary hosts, paths, and redirect-based SSRF.
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com$/.test(url.hostname)) return null;
    return { url: url.origin, key: v.key };
  } catch { return null; }
}
export const sameOriginRequest = (request: Request) => request.headers.get("origin") === new URL(request.url).origin;
export async function smallJson(request: Request, maxBytes = 8192): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error("Expected JSON");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Empty body");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maxBytes) { await reader.cancel(); throw new Error("Input too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export function publicJob(value: unknown, expectedId?: string) {
  if (!value || typeof value !== "object") throw new Error("Invalid job");
  const v = value as Record<string, unknown>;
  if (!validGenerationId(v.id) || (expectedId && v.id !== expectedId)
    || !["queued","running","completed","failed"].includes(String(v.status))) throw new Error("Invalid job");
  // Return only the owner-scoped presentation fields, never server paths/keys.
  return { id: v.id, status: v.status, moment: typeof v.moment === "string" ? v.moment : "",
    kind: typeof v.kind === "string" ? v.kind : "instrumental", genre: typeof v.genre === "string" ? v.genre : "",
    duration: typeof v.duration === "number" ? v.duration : 30,
    created_at: typeof v.created_at === "string" ? v.created_at : typeof v.created_at === "number" && Number.isFinite(v.created_at) ? new Date(v.created_at * 1000).toISOString() : "",
    lyrics: typeof v.lyrics === "string" ? v.lyrics : undefined,
    progress: typeof v.progress === "string" ? v.progress : undefined,
    error: v.status === "failed" ? "This attempt did not finish. You can create another track when you’re ready." : undefined,
  };
}
