import { createHmac, randomBytes } from "node:crypto";
import { createClient } from "@/utils/supabase/server";
import { createMomentSearcher, MAX_SEARCH_SONGS, validateMoment, type PublicSong } from "@/utils/moment-search";
import { embedTexts, EmbeddingProviderError } from "@/utils/text-embeddings";
import { createMomentLimits } from "@/utils/moment-limits";

export const runtime = "nodejs";
export const maxDuration = 60;
const search = createMomentSearcher((texts, key) => embedTexts(texts, key, (input, init) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(20_000) })));
const limits = createMomentLimits();
const visitorSalt = randomBytes(32);
const headers = { "Cache-Control": "private, no-store" };
const failure = (error: string, status: number) => Response.json({ error }, { status, headers });

async function readInput(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing input");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 4096) { await reader.cancel(); throw new Error("Input too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) return failure("Send a description of your moment.", 400);
  let query: unknown;
  try { query = (await readInput(request) as { query?: unknown })?.query; }
  catch { return failure("Describe your moment in up to 500 characters.", 400); }
  if (!validateMoment(query)) return failure("Describe your moment in up to 500 characters.", 400);
  // Vercel supplies the client-address header. HMAC is scoped to this process.
  const address = process.env.VERCEL ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown" : "local";
  const visitor = createHmac("sha256", visitorSalt).update(address).digest("hex");
  const release = limits.enter(visitor);
  if (!release) return Response.json({ error: "A few moments are being matched. Please try again in a minute." }, {
    status: 429, headers: { ...headers, "Retry-After": "60" },
  });
  try {
    const supabase = await createClient();
    // Explicitly collective even when an administrator or private-song owner
    // is signed in. RLS still applies; never use a service-role credential.
    const { data, error } = await supabase.from("songs")
      .select("id,title,description,lyrics,visibility,genre,mood,metadata,song_assets!inner(asset_type)")
      .eq("visibility", "collective").eq("song_assets.asset_type", "audio")
      .order("id").limit(MAX_SEARCH_SONGS + 1);
    if (error) return failure("The library is temporarily unavailable. Please try again shortly.", 503);
    if (!data?.length) return Response.json({ songs: [] }, { headers });
    if (data.length > MAX_SEARCH_SONGS) return failure("Moment search is being updated for the growing library. Please browse the songs below.", 503);
    const key = process.env.SOUND_VECTOR_EMBEDDING_API_KEY?.trim();
    if (!key) return failure("Moment search is being connected. You can still explore and play the songs below.", 503);
    const songs = await search(query, data as PublicSong[], key);
    return Response.json({ songs }, { headers });
  } catch (error) {
    if (error instanceof EmbeddingProviderError) {
      const code = error.quotaExhausted ? "matching_quota" : [401, 403].includes(error.status) ? "matching_credentials" : "matching_provider";
      return Response.json({
        error: "Moment search is temporarily unavailable. You can still explore and play the songs below.", code, providerStatus: error.status,
      }, { status: 503, headers });
    }
    // Never log a listener's words, provider bodies, or keys.
    return Response.json({ error: "We couldn’t match this moment just now. Please try again shortly, or explore the songs below.",
      code: error instanceof Error && error.message === "Embedding provider returned an unexpected model or result count."
        ? "matching_model" : error instanceof Error && error.message === "Embedding provider returned an invalid vector."
        ? "matching_vectors" : "matching_internal",
    }, { status: 503, headers });
  } finally { release(); }
}
