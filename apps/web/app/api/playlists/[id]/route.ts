import { sameOriginRequest, smallJson, validGenerationId } from "@/utils/generation";
import { playlistItem, playlistName, playlistSummary } from "@/utils/playlists";
import { playlistDatabaseFailure, playlistFailure, playlistFields, playlistItemFields, playlistReply, playlistUser } from "@/utils/playlist-server";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  if (!validGenerationId(id)) return playlistFailure("Playlist not found.", 404);
  const auth = await playlistUser();
  if (auth.error) return auth.error;
  try {
    const { data: playlist, error } = await auth.client.from("playlists").select(playlistFields).eq("id", id).eq("owner_id", auth.owner).maybeSingle();
    if (error) return playlistDatabaseFailure(error);
    if (!playlist) return playlistFailure("Playlist not found.", 404);
    const { data: items, error: itemError } = await auth.client.from("playlist_items").select(playlistItemFields)
      .eq("playlist_id", id).eq("owner_id", auth.owner).order("created_at").order("id").limit(200);
    if (itemError) return playlistDatabaseFailure(itemError);
    return playlistReply({ playlist: playlistSummary(playlist as unknown as Record<string, unknown>), items: (items ?? []).map(item => playlistItem(item as unknown as Record<string, unknown>)) });
  } catch { return playlistFailure("We couldn’t load this playlist. Please try again.", 503); }
}

export async function PATCH(request: Request, context: Context) {
  if (!sameOriginRequest(request)) return playlistFailure("Please edit playlists from the Evolution Media site.", 403);
  const { id } = await context.params;
  if (!validGenerationId(id)) return playlistFailure("Playlist not found.", 404);
  const auth = await playlistUser();
  if (auth.error) return auth.error;
  let name: string | null;
  try { name = playlistName(await smallJson(request, 2048)); }
  catch { return playlistFailure("Enter a playlist name in up to 80 characters.", 400); }
  if (!name) return playlistFailure("Enter a playlist name in up to 80 characters.", 400);
  try {
    const { data, error } = await auth.client.from("playlists").update({ name }).eq("id", id).eq("owner_id", auth.owner).select(playlistFields).maybeSingle();
    if (error) return playlistDatabaseFailure(error);
    if (!data) return playlistFailure("Playlist not found.", 404);
    return playlistReply({ playlist: playlistSummary(data as unknown as Record<string, unknown>) });
  } catch { return playlistFailure("We couldn’t rename this playlist. Please try again.", 503); }
}

export async function DELETE(request: Request, context: Context) {
  if (!sameOriginRequest(request)) return playlistFailure("Please delete playlists from the Evolution Media site.", 403);
  const { id } = await context.params;
  if (!validGenerationId(id)) return playlistFailure("Playlist not found.", 404);
  const auth = await playlistUser();
  if (auth.error) return auth.error;
  try {
    const { error } = await auth.client.from("playlists").delete().eq("id", id).eq("owner_id", auth.owner);
    if (error) return playlistDatabaseFailure(error);
    return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
  } catch { return playlistFailure("We couldn’t delete this playlist. Please try again.", 503); }
}
