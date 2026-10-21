import { createClient } from "./supabase/server";
import { playlistSetupMissing } from "./playlists";

export const playlistHeaders = { "Cache-Control": "private, no-store" };
export const playlistFailure = (error: string, status: number, code?: string) => Response.json({ error, ...(code ? { code } : {}) }, { status, headers: playlistHeaders });
export const playlistReply = (body: unknown, status = 200) => Response.json(body, { status, headers: playlistHeaders });
export const playlistFields = "id,name,created_at,updated_at";
export const playlistItemFields = "id,source,song_id,generation_id,title,created_at";

export async function playlistUser() {
  try {
    const client = await createClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error && error.name !== "AuthSessionMissingError" && (!error.status || error.status >= 500)) {
      return { error: playlistFailure("We couldn’t verify your session. Please try again.", 503) };
    }
    if (!user) return { error: playlistFailure("Sign in to create and manage your playlists.", 401) };
    return { client, owner: user.id };
  } catch { return { error: playlistFailure("We couldn’t verify your session. Please try again.", 503) }; }
}

export function playlistDatabaseFailure(error: { code?: string }) {
  if (playlistSetupMissing(error)) return playlistFailure("Playlist setup is not finished yet. Please try again after setup.", 503, "playlist_setup_required");
  if (error.code === "54000") return playlistFailure("The playlist limit has been reached. Remove a playlist or track before adding another.", 429);
  if (["23514", "22023", "22P02"].includes(error.code ?? "")) return playlistFailure("Check the playlist name or track details.", 400);
  if (["42501", "23503"].includes(error.code ?? "")) return playlistFailure("This playlist or track is not available.", 404);
  return playlistFailure("We couldn’t update your playlists just now. Please try again.", 503);
}

export async function removeGeneratedPlaylistReferences(owner: string, trackId: string): Promise<boolean> {
  try {
    const client = await createClient();
    const { error } = await client.from("playlist_items").delete()
      .eq("owner_id", owner).eq("source", "generated").eq("generation_id", trackId);
    return !error || playlistSetupMissing(error);
  } catch { return false; }
}
