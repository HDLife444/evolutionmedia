export type PlaylistSource = "catalog" | "generated";
export type PlaylistSummary = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
};
export type PlaylistItem = {
  id: string;
  source: PlaylistSource;
  trackId: string;
  title: string;
  addedAt: string;
};
export type PlaylistDetails = {
  playlist: Omit<PlaylistSummary, "itemCount">;
  items: PlaylistItem[];
};

export const PLAYLISTS_CHANGED = "evolution-media-playlists-changed";

export function notifyPlaylistsChanged() {
  window.dispatchEvent(new Event(PLAYLISTS_CHANGED));
}

export async function playlistRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const result = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error ?? "Your playlists couldn’t be reached. Please try again.");
  if (response.status !== 204 && !result) throw new Error("The playlist response was incomplete. Please try again.");
  return result as T;
}
