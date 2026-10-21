import { generationAdministrator, generationFailure, privateHeaders, workerConnection, workerFetch, workerJson } from "@/utils/generation-server";
import { publicJob, sameOriginRequest, validGenerationId } from "@/utils/generation";
import { removeGeneratedPlaylistReferences } from "@/utils/playlist-server";
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!validGenerationId(id)) return generationFailure("Track not found.", 404);
  const auth = await generationAdministrator();
  if (auth.error) return auth.error;
  const connection = await workerConnection(auth.owner);
  if (!connection) return generationFailure("Reconnect your music server to check this track.", 503);
  try {
    const result = await workerJson(connection, `/v1/jobs/${id}?owner_id=${encodeURIComponent(auth.owner)}`);
    if (!result.ok) return generationFailure(result.status === 404 ? "Track not found on this music server." : "Couldn’t check this track just now.", result.status === 404 ? 404 : 503);
    return Response.json({ job: publicJob(result.data.job ?? result.data, id) }, { headers: privateHeaders });
  } catch { return generationFailure("Couldn’t check this track. Try again when the music server is online.", 503); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOriginRequest(request)) return generationFailure("Please delete tracks from the Evolution Media site.", 403);
  const { id } = await params;
  if (!validGenerationId(id)) return generationFailure("Track not found.", 404);
  const auth = await generationAdministrator();
  if (auth.error) return auth.error;
  const connection = await workerConnection(auth.owner);
  if (!connection) return generationFailure("Reconnect your music server to delete this track.", 503);
  try {
    const response = await workerFetch(connection, `/v1/jobs/${id}?owner_id=${encodeURIComponent(auth.owner)}`, { method: "DELETE" });
    if (response.status === 409) return generationFailure("Wait for this track to finish before deleting it.", 409);
    if (response.status === 405) return generationFailure("Your music server needs an update before tracks can be deleted.", 503);
    if (!response.ok) return generationFailure(response.status === 404 ? "This track wasn’t found on your music server." : "The track could not be deleted. Please try again.", response.status === 404 ? 404 : 503);
    const playlistsUpdated = await removeGeneratedPlaylistReferences(auth.owner, id);
    return Response.json({ deleted: true, playlistsUpdated }, { headers: privateHeaders });
  } catch { return generationFailure("The deletion reply was interrupted. You can safely try deleting this track again.", 503); }
}
