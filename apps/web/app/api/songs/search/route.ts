import { createClient } from "@/utils/supabase/server";
import { smallJson } from "@/utils/generation";
import { MAX_CATALOG_SEARCH_SONGS, searchCatalogWords, validCatalogQuery } from "@/utils/catalog-search";
import type { PublicSong } from "@/utils/moment-search";

export const runtime = "nodejs";
export const maxDuration = 15;
const headers = { "Cache-Control": "private, no-store" };
const failure = (error: string, status: number) => Response.json({ error }, { status, headers });

export async function POST(request: Request) {
  let query: unknown;
  try { query = (await smallJson(request, 4096) as { query?: unknown })?.query; }
  catch { return failure("Enter a title or a few words in up to 500 characters.", 400); }
  if (!validCatalogQuery(query)) return failure("Enter a title or a few words in up to 500 characters.", 400);
  try {
    const supabase = await createClient();
    // Session-scoped access and an explicit collective filter apply even when
    // an administrator is signed in. No listener query is logged or persisted.
    const { data, error } = await supabase.from("songs")
      .select("id,title,description,lyrics,visibility,genre,mood,metadata,song_assets!inner(asset_type)")
      .eq("visibility", "collective").eq("song_assets.asset_type", "audio")
      .order("id").limit(MAX_CATALOG_SEARCH_SONGS + 1)
      .abortSignal(AbortSignal.timeout(10_000));
    if (error) return failure("The song library is temporarily unavailable. Please try again shortly.", 503);
    if ((data?.length ?? 0) > MAX_CATALOG_SEARCH_SONGS) {
      return failure("Song search is being updated for the growing library. Please try again later.", 503);
    }
    return Response.json({ songs: searchCatalogWords(query, (data ?? []) as PublicSong[]) }, { headers });
  } catch {
    return failure("We couldn’t search the song library just now. Please try again shortly.", 503);
  }
}
