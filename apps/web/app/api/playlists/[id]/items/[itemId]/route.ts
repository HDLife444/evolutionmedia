import { sameOriginRequest, validGenerationId } from "@/utils/generation";
import { playlistDatabaseFailure, playlistFailure, playlistHeaders, playlistUser } from "@/utils/playlist-server";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  if (!sameOriginRequest(request)) return playlistFailure("Please remove tracks from the Evolution Media site.", 403);
  const { id, itemId } = await params;
  if (!validGenerationId(id) || !validGenerationId(itemId)) return playlistFailure("Playlist track not found.", 404);
  const auth = await playlistUser();
  if (auth.error) return auth.error;
  try {
    const { error } = await auth.client.from("playlist_items").delete().eq("id", itemId).eq("playlist_id", id).eq("owner_id", auth.owner);
    if (error) return playlistDatabaseFailure(error);
    return new Response(null, { status: 204, headers: playlistHeaders });
  } catch { return playlistFailure("We couldn’t remove this playlist track. Please try again.", 503); }
}
