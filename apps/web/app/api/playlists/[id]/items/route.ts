import { sameOriginRequest, smallJson, validGenerationId } from "@/utils/generation";
import { workerConnection, workerJson } from "@/utils/generation-server";
import { playlistItem, playlistTrack, type PlaylistTrackInput } from "@/utils/playlists";
import { playlistDatabaseFailure, playlistFailure, playlistItemFields, playlistReply, playlistUser } from "@/utils/playlist-server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOriginRequest(request)) return playlistFailure("Please save tracks from the Evolution Media site.", 403);
  const { id } = await params;
  if (!validGenerationId(id)) return playlistFailure("Playlist not found.", 404);
  const auth = await playlistUser();
  if (auth.error) return auth.error;
  let input: PlaylistTrackInput | null;
  try { input = playlistTrack(await smallJson(request, 2048)); }
  catch { return playlistFailure("Choose a track and playlist to save it.", 400); }
  if (!input) return playlistFailure("Choose a track and playlist to save it.", 400);
  try {
    const { data: parent, error: parentError } = await auth.client.from("playlists").select("id").eq("id", id).eq("owner_id", auth.owner).maybeSingle();
    if (parentError) return playlistDatabaseFailure(parentError);
    if (!parent) return playlistFailure("Playlist not found.", 404);
    let title = input.title;
    if (input.source === "catalog") {
      const { data: song, error } = await auth.client.from("songs").select("id,title").eq("id", input.trackId).maybeSingle();
      if (error) return playlistDatabaseFailure(error);
      if (!song) return playlistFailure("This song is not available to your account.", 404);
      title = Array.from(String(song.title)).slice(0, 160).join("");
    } else {
      const connection = await workerConnection(auth.owner);
      if (!connection) return playlistFailure("Connect your music server before saving a generated track.", 503);
      const result = await workerJson(connection, `/v1/jobs/${input.trackId}?owner_id=${encodeURIComponent(auth.owner)}`);
      if (!result.ok) return playlistFailure(result.status === 404 ? "This generated track is not available to your account." : "We couldn’t check this generated track. Please try again.", result.status === 404 ? 404 : 503);
      if (result.data?.id !== input.trackId || result.data?.status !== "completed") return playlistFailure("Wait for the generated track to finish before saving it.", 409);
    }
    const sourceField = input.source === "catalog" ? "song_id" : "generation_id";
    const existingQuery = () => auth.client.from("playlist_items").select(playlistItemFields)
      .eq("playlist_id", id).eq("owner_id", auth.owner).eq("source", input.source).eq(sourceField, input.trackId).maybeSingle();
    const { data: existing, error: existingError } = await existingQuery();
    if (existingError) return playlistDatabaseFailure(existingError);
    if (existing) return playlistReply({ item: playlistItem(existing as unknown as Record<string, unknown>) });
    const { data, error } = await auth.client.from("playlist_items").insert({ playlist_id: id, owner_id: auth.owner,
      source: input.source, song_id: input.source === "catalog" ? input.trackId : null,
      generation_id: input.source === "generated" ? input.trackId : null, title }).select(playlistItemFields).single();
    if (error?.code === "23505") {
      const retry = await existingQuery();
      if (!retry.error && retry.data) return playlistReply({ item: playlistItem(retry.data as unknown as Record<string, unknown>) });
    }
    if (error) return playlistDatabaseFailure(error);
    return playlistReply({ item: playlistItem(data as unknown as Record<string, unknown>) }, 201);
  } catch { return playlistFailure("We couldn’t save this track to your playlist. Please try again.", 503); }
}
