import { createHash } from "node:crypto";
import { embedTexts, EMBEDDING_DIMENSIONS, songTextChunks, type TextChunk } from "./text-embeddings";

export const MAX_MOMENT_LENGTH = 500;
export const MAX_SEARCH_SONGS = 100;
const MIN_SIMILARITY = 0.28;
const MAX_CHUNKS = 256;
export type PublicSong = {
  id: string; title: string; description: string | null; lyrics: string | null;
  visibility: string; genre: string[] | null; mood: string[] | null;
  metadata: { development_goal?: unknown; emotional_progression?: unknown } | null;
};
export type MomentMatch = { id: string; title: string; description: string | null; focus: string };
export type SearchDocument = TextChunk & { songId: string };
type Index = { fingerprint: string; documents: SearchDocument[]; vectors: number[][]; expires: number };
type Embedder = (texts: string[], key: string) => Promise<number[][]>;

export function validateMoment(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && Array.from(value).length <= MAX_MOMENT_LENGTH;
}

export function publicDocuments(songs: PublicSong[]): SearchDocument[] {
  return songs.filter(song => song.visibility === "collective").flatMap(song => songTextChunks({
    title: song.title, lyrics: song.lyrics ?? "",
    description: [song.description, ...(song.genre ?? []), ...(song.mood ?? [])].filter(Boolean).join("\n"),
    development_goal: song.metadata?.development_goal,
    emotional_progression: song.metadata?.emotional_progression,
  }).map(chunk => ({ ...chunk, songId: song.id })));
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || !a.length) throw new Error("Incompatible embedding dimensions");
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}

export function rankMoments(songs: PublicSong[], documents: SearchDocument[], vectors: number[][], query: number[]): MomentMatch[] {
  if (documents.length !== vectors.length) throw new Error("Incomplete search index");
  const scores = new Map<string, Partial<Record<TextChunk["modality"], number>>>();
  documents.forEach((doc, i) => {
    const modalities = scores.get(doc.songId) ?? {};
    modalities[doc.modality] = Math.max(modalities[doc.modality] ?? -1, cosine(vectors[i], query));
    scores.set(doc.songId, modalities);
  });
  const weights = { development: 0.55, description: 0.30, lyrics: 0.15 };
  return songs.filter(song => song.visibility === "collective").map(song => {
    const modalities = scores.get(song.id) ?? {};
    let score = 0, weight = 0;
    for (const modality of Object.keys(weights) as TextChunk["modality"][]) {
      if (modalities[modality] !== undefined) { score += modalities[modality]! * weights[modality]; weight += weights[modality]; }
    }
    return { song, score: weight ? score / weight : 0 };
  }).filter(({ score }) => score >= MIN_SIMILARITY)
    .sort((a, b) => b.score - a.score || a.song.id.localeCompare(b.song.id))
    .slice(0, 3).map(({ song }) => ({
      id: song.id, title: song.title, description: song.description,
      focus: typeof song.metadata?.development_goal === "string" ? song.metadata.development_goal : "",
    }));
}

// Cache only vectors of public song text, never listener queries or results.
// Every request refetches the authorized catalog; changed text or visibility
// changes the fingerprint. The shared promise avoids duplicate cold indexing.
export function createMomentSearcher(embed: Embedder = embedTexts, now = Date.now) {
  let index: Index | undefined;
  let pending: { fingerprint: string; promise: Promise<Index> } | undefined;
  return async (query: string, songs: PublicSong[], key: string): Promise<MomentMatch[]> => {
    if (!validateMoment(query)) throw new Error("Invalid moment");
    const documents = publicDocuments(songs);
    if (!documents.length) return [];
    if (documents.length > MAX_CHUNKS) throw new Error("Public collection exceeds preview search capacity");
    const fingerprint = createHash("sha256").update(JSON.stringify(documents)).digest("hex");
    let current = index?.fingerprint === fingerprint && index.expires > now() ? index : undefined;
    if (!current) {
      if (!pending || pending.fingerprint !== fingerprint) {
        const promise = embed(documents.map(doc => doc.chunk_text), key).then(vectors => {
          if (vectors.length !== documents.length || vectors.some(vector => vector.length !== EMBEDDING_DIMENSIONS)) throw new Error("Incomplete public index");
          const built = { fingerprint, documents, vectors, expires: now() + 60 * 60 * 1000 };
          index = built;
          return built;
        });
        pending = { fingerprint, promise };
      }
      const attempt = pending;
      try { current = await attempt.promise; }
      finally { if (pending === attempt) pending = undefined; }
    }
    const [vector] = await embed([query.trim()], key);
    return rankMoments(songs, current.documents, current.vectors, vector);
  };
}
