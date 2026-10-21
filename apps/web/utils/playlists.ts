import { validGenerationId } from "./generation";

export type PlaylistTrackInput = { source: "catalog" | "generated"; trackId: string; title: string };
export type PlaylistItem = { id: string; source: "catalog" | "generated"; trackId: string; title: string; addedAt: string };
export type PlaylistSummary = { id: string; name: string; createdAt: string; updatedAt: string; itemCount: number };

export function playlistName(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fields = value as Record<string, unknown>;
  if (Object.keys(fields).some(key => key !== "name") || typeof fields.name !== "string") return null;
  const name = fields.name.trim();
  return name && Array.from(name).length <= 80 ? name : null;
}

export function playlistTrack(value: unknown): PlaylistTrackInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fields = value as Record<string, unknown>;
  if (Object.keys(fields).some(key => !["source", "trackId", "title"].includes(key))
    || !["catalog", "generated"].includes(String(fields.source)) || !validGenerationId(fields.trackId)
    || typeof fields.title !== "string") return null;
  const title = fields.title.trim();
  if (!title || Array.from(title).length > 160) return null;
  return { source: fields.source as PlaylistTrackInput["source"], trackId: fields.trackId.toLowerCase(), title };
}

export function playlistItem(row: Record<string, unknown>): PlaylistItem {
  const trackId = row.source === "catalog" ? row.song_id : row.generation_id;
  if (!validGenerationId(row.id) || !["catalog", "generated"].includes(String(row.source)) || !validGenerationId(trackId)
    || typeof row.title !== "string" || typeof row.created_at !== "string") throw new Error("Invalid playlist item");
  return { id: row.id, source: row.source as PlaylistItem["source"], trackId, title: row.title, addedAt: row.created_at };
}

export function playlistSummary(row: Record<string, unknown>): PlaylistSummary {
  if (!validGenerationId(row.id) || typeof row.name !== "string" || typeof row.created_at !== "string" || typeof row.updated_at !== "string") {
    throw new Error("Invalid playlist");
  }
  const count = (row.playlist_items as { count?: unknown }[] | undefined)?.[0]?.count;
  return { id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at,
    itemCount: typeof count === "number" && Number.isSafeInteger(count) && count >= 0 ? count : 0 };
}

export const playlistSetupMissing = (error: { code?: string } | null | undefined) => !!error && ["PGRST205", "42P01"].includes(error.code ?? "");
