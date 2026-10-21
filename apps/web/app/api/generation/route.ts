import { generationAdministrator, generationFailure, privateHeaders, workerConnection, workerJson } from "@/utils/generation-server";
import { publicJob, sameOriginRequest, smallJson, validGenerationInput } from "@/utils/generation";
import { createClient } from "@/utils/supabase/server";
import { cloudJobs, cloudMusicConfigured, cloudServerStatus, musicDatabaseFailure } from "@/utils/music-cloud";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  const auth = await generationAdministrator();
  if (auth.error) return auth.error;
  if (cloudMusicConfigured()) {
    try {
      const [status, jobs] = await Promise.all([cloudServerStatus(auth.owner), cloudJobs(auth.owner)]);
      return Response.json({ ready: status.ready, canDelete: true, connectionMode: "persistent", jobs,
        message: status.ready ? undefined : status.enrolled ? "Your music server is offline. Your saved recordings are still available." : "Register your music server to begin creating full-length tracks." }, { headers: privateHeaders });
    } catch { return Response.json({ ready: false, canDelete: false, jobs: [], message: "Persistent music-server setup is not finished yet. Complete its setup to create full-length tracks." }, { headers: privateHeaders }); }
  }
  const connection = await workerConnection(auth.owner);
  if (!connection) return Response.json({ ready: false, message: "Set up your persistent music server to create full-length tracks.", jobs: [] }, { headers: privateHeaders });
  try {
    const [health, list] = await Promise.all([
      workerJson(connection, "/v1/health"), workerJson(connection, `/v1/jobs?owner_id=${encodeURIComponent(auth.owner)}`),
    ]);
    if (!health.ok || !list.ok) return Response.json({ ready: false, message: "Your music server couldn’t be reached. Check that it’s running, or reconnect it.", jobs: [] }, { headers: privateHeaders });
    const jobs = (Array.isArray(list.data) ? list.data : list.data.jobs ?? []).slice(0,20).map((job: unknown) => publicJob(job));
    return Response.json({ ready: false, canDelete: health.data.capabilities?.delete_jobs === true, connectionMode: "legacy",
      message: "Your earlier test tracks are available. Activate the persistent music server to create full-length recordings.", jobs }, { headers: privateHeaders });
  } catch { return Response.json({ ready: false, message: "Your music server is offline or restarting. Reconnect when it’s ready.", jobs: [] }, { headers: privateHeaders }); }
}
export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return generationFailure("Please submit from the Evolution Media site.", 403);
  const auth = await generationAdministrator();
  if (auth.error) return auth.error;
  let input: unknown;
  try { input = await smallJson(request); } catch { return generationFailure("Check your moment and generation choices.", 400); }
  if (!validGenerationInput(input)) return generationFailure("Choose a genre and output type and describe your moment in up to 500 characters. New recordings are four minutes long.", 400);
  if (!cloudMusicConfigured()) return generationFailure("Activate the persistent music server before creating full-length recordings.", 503);
  try {
    const client = await createClient();
    const { data, error } = await client.rpc("enqueue_music_recording", { p_id: input.id, p_moment: input.moment.trim(), p_genre: input.genre, p_kind: input.kind });
    if (error) return musicDatabaseFailure(error);
    return Response.json({ job: publicJob(data, input.id) }, { headers: privateHeaders });
  } catch { return generationFailure("The server’s reply was interrupted. Check status or retry this same request; it will not create a duplicate track.", 503); }
}
