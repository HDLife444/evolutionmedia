import { generationAdministrator, generationFailure, privateHeaders, workerConnection, workerJson } from "@/utils/generation-server";
import { publicJob, validGenerationId } from "@/utils/generation";
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
