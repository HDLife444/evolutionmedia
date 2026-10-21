import { smallJson, validGenerationId } from "@/utils/generation";
import { generationFailure } from "@/utils/generation-server";
import { musicWorkerReply, workerIdentity } from "@/utils/music-cloud";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const auth = await workerIdentity(request);
  if (auth.error) return auth.error;
  try {
    const input = await smallJson(request) as { ready?: unknown; job_id?: unknown; lease_id?: unknown };
    if (typeof input.ready !== "boolean" || ((input.job_id !== undefined || input.lease_id !== undefined)
      && (!validGenerationId(input.job_id) || !validGenerationId(input.lease_id)))) return generationFailure("Invalid worker heartbeat.", 400);
    const { data, error } = await auth.service.rpc("heartbeat_music_worker", { p_worker: auth.worker.id, p_ready: input.ready,
      p_job: input.job_id ?? null, p_lease: input.lease_id ?? null });
    if (error) return generationFailure("The music server heartbeat is unavailable.", 503);
    if (data !== true) return generationFailure("This recording lease is no longer active.", 409);
    let busy = false;
    if (!input.ready && !input.job_id) {
      const running = await auth.service.from("music_recordings").select("id", { count: "exact", head: true })
        .eq("owner_id", auth.worker.owner_id).eq("status", "running").gt("lease_until", new Date().toISOString());
      if (running.error) return generationFailure("The current recording status could not be checked.", 503);
      busy = Boolean(running.count);
    }
    return musicWorkerReply({ ok: true, busy });
  } catch { return generationFailure("Invalid worker heartbeat.", 400); }
}
