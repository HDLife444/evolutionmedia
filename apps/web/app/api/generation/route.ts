import { generationAdministrator, generationFailure, privateHeaders, workerConnection, workerJson } from "@/utils/generation-server";
import { publicJob, sameOriginRequest, smallJson, validGenerationInput } from "@/utils/generation";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  const auth = await generationAdministrator();
  if (auth.error) return auth.error;
  const connection = await workerConnection(auth.owner);
  if (!connection) return Response.json({ ready: false, message: "Connect your Lambda music server to begin.", jobs: [] }, { headers: privateHeaders });
  try {
    const [health, list] = await Promise.all([
      workerJson(connection, "/v1/health"), workerJson(connection, `/v1/jobs?owner_id=${encodeURIComponent(auth.owner)}`),
    ]);
    if (!health.ok || !list.ok) return Response.json({ ready: false, message: "Your music server couldn’t be reached. Check that it’s running, or reconnect it.", jobs: [] }, { headers: privateHeaders });
    const jobs = (Array.isArray(list.data) ? list.data : list.data.jobs ?? []).slice(0,20).map((job: unknown) => publicJob(job));
    return Response.json({ ready: health.data.ready === true, canDelete: health.data.capabilities?.delete_jobs === true,
      message: health.data.ready === true ? undefined : "Your music server is warming up. Refresh in a moment.", jobs }, { headers: privateHeaders });
  } catch { return Response.json({ ready: false, message: "Your music server is offline or restarting. Reconnect when it’s ready.", jobs: [] }, { headers: privateHeaders }); }
}
export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return generationFailure("Please submit from the Evolution Media site.", 403);
  const auth = await generationAdministrator();
  if (auth.error) return auth.error;
  let input: unknown;
  try { input = await smallJson(request); } catch { return generationFailure("Check your moment and generation choices.", 400); }
  if (!validGenerationInput(input)) return generationFailure("Choose a genre, output type, and duration, and describe your moment in up to 500 characters.", 400);
  const connection = await workerConnection(auth.owner);
  if (!connection) return generationFailure("Connect your Lambda music server to begin.", 503);
  try {
    const result = await workerJson(connection, "/v1/jobs", { id: input.id, moment: input.moment, genre: input.genre, kind: input.kind, duration: input.duration, owner_id: auth.owner });
    if (!result.ok) return generationFailure(result.status === 429 ? "The music server is busy or you’ve reached the recent generation limit. Please wait a few minutes before starting another track."
      : result.status === 409 ? "This request already has different settings. Refresh before starting a new track."
      : "Your music server couldn’t accept the request. Please check its connection.", result.status === 429 ? 429 : result.status === 409 ? 409 : 503);
    return Response.json({ job: publicJob(result.data.job ?? result.data, input.id) }, { headers: privateHeaders });
  } catch { return generationFailure("The server’s reply was interrupted. Check status or retry this same request; it will not create a duplicate track.", 503); }
}
