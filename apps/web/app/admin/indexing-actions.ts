"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { UUID_PATTERN } from "@/utils/ingestion";
import { embedTexts, songTextChunks } from "@/utils/text-embeddings";

async function administrator() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.rpc("is_song_administrator");
  return !error && data === true ? supabase : null;
}

export async function indexSong(songId: string): Promise<{ error?: string; success?: boolean }> {
  if (!UUID_PATTERN.test(songId)) return { error: "Invalid song identifier." };
  const supabase = await administrator();
  if (!supabase) return { error: "Administrator access required." };
  const key = process.env.SOUND_VECTOR_EMBEDDING_API_KEY?.trim();
  if (!key) return { error: "Text indexing needs its embedding-provider connection configured." };
  const { data: job, error } = await supabase.rpc("claim_song_indexing", { p_song_id: songId })
    .single<{ lease_token: string; submission: Record<string, unknown> }>();
  if (error || !job) return { error: "This song is unavailable for indexing. If processing was interrupted, retry after three minutes." };
  try {
    const chunks = songTextChunks(job.submission);
    const vectors = await embedTexts(chunks.map(chunk => chunk.chunk_text), key);
    const { error: completionError } = await supabase.rpc("finish_song_indexing", {
      p_song_id: songId, p_lease_token: job.lease_token,
      p_embeddings: chunks.map((chunk, index) => ({ ...chunk, embedding: vectors[index] })),
    });
    if (completionError) throw new Error("Could not commit the indexed song.");
    revalidatePath("/admin");
    return { success: true };
  } catch {
    await supabase.rpc("fail_song_indexing", { p_song_id: songId, p_lease_token: job.lease_token });
    revalidatePath("/admin");
    return { error: "Indexing failed. Check the provider connection and billing, then retry." };
  }
}

export type SongMatch = { id: string; title: string; description: string | null; visibility: string; similarity: number };
export async function searchSongs(query: string): Promise<{ songs?: SongMatch[]; error?: string }> {
  if (typeof query !== "string" || !query.trim() || Array.from(query).length > 1000) return { error: "Enter a search of up to 1000 characters." };
  // Initial paid-query testing is restricted to trusted administrators.
  const supabase = await administrator();
  if (!supabase) return { error: "Administrator access required." };
  const key = process.env.SOUND_VECTOR_EMBEDDING_API_KEY?.trim();
  if (!key) return { error: "Search needs its embedding-provider connection configured." };
  try {
    const [vector] = await embedTexts([query.trim()], key);
    const { data, error } = await supabase.rpc("search_song_text", { p_query: vector, p_limit: 10 });
    if (error) throw new Error("Search failed.");
    return { songs: data as SongMatch[] };
  } catch { return { error: "Search is unavailable. Check the indexing setup and provider connection." }; }
}
