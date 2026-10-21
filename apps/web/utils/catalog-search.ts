import type { MomentMatch, PublicSong } from "./moment-search";

export const MAX_CATALOG_QUERY_LENGTH = 500;
export const MAX_CATALOG_SEARCH_SONGS = 100;
const MAX_RESULTS = 10;
const words = new Intl.Segmenter(undefined, { granularity: "word" });

function normalized(value: string) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("und");
}

function tokens(value: string) {
  return [...new Set(Array.from(words.segment(normalized(value)))
    .filter(segment => segment.isWordLike).map(segment => segment.segment))];
}

export function validCatalogQuery(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
    && Array.from(value).length <= MAX_CATALOG_QUERY_LENGTH && tokens(value).length > 0;
}

// This is literal word search, not a substitute for semantic moment matching.
// Filter collective visibility again so callers cannot accidentally expose a
// private song while reusing this helper with an administrator's catalog.
export function searchCatalogWords(query: string, songs: PublicSong[]): MomentMatch[] {
  if (!validCatalogQuery(query)) throw new Error("Invalid catalog query");
  if (songs.length > MAX_CATALOG_SEARCH_SONGS) throw new Error("Catalog exceeds search capacity");
  const terms = tokens(query);
  return songs.filter(song => song.visibility === "collective").map(song => {
    const fields: [string, number][] = [
      [song.title, 8], [song.description ?? "", 4], [song.lyrics ?? "", 1],
      [typeof song.metadata?.development_goal === "string" ? song.metadata.development_goal : "", 4],
      [typeof song.metadata?.emotional_progression === "string" ? song.metadata.emotional_progression : "", 3],
      [(song.genre ?? []).filter(value => typeof value === "string").join(" "), 3],
      [(song.mood ?? []).filter(value => typeof value === "string").join(" "), 3],
    ];
    const indexed = fields.map(([text, weight]) => ({ terms: new Set(tokens(text)), weight }));
    if (!terms.every(term => indexed.some(field => field.terms.has(term)))) return null;
    const score = indexed.reduce((total, field) => total + terms.filter(term => field.terms.has(term)).length * field.weight, 0);
    return { song, score };
  }).filter((match): match is { song: PublicSong; score: number } => match !== null)
    .sort((a, b) => b.score - a.score || a.song.title.localeCompare(b.song.title) || a.song.id.localeCompare(b.song.id))
    .slice(0, MAX_RESULTS).map(({ song }) => ({
      id: song.id, title: song.title, description: song.description,
      focus: typeof song.metadata?.development_goal === "string" ? song.metadata.development_goal : "",
    }));
}
