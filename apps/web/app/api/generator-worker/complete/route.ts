import { smallJson } from "@/utils/generation";
import { generationFailure } from "@/utils/generation-server";
import { claimedRecording, CLOUD_AUDIO_LIMIT, MUSIC_BUCKET, musicPath, musicWorkerReply, workerIdentity } from "@/utils/music-cloud";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request) {
  const auth = await workerIdentity(request);
  if (auth.error) return auth.error;
  try {
    const input = await smallJson(request) as Record<string, unknown>;
    const job = await claimedRecording(auth.service, auth.worker, input.job_id, input.lease_id);
    if (!job) {
      // A lost completion reply must be safe to retry without generating again.
      const { data } = await auth.service.from("music_recordings").select("status,lease_id")
        .eq("id", input.job_id).eq("owner_id", auth.worker.owner_id).eq("worker_id", auth.worker.id).maybeSingle();
      if (data && data.lease_id === input.lease_id && data.status === "completed") return musicWorkerReply({ completed: true });
      return generationFailure("This recording lease is no longer active.", 409);
    }
    if (input.failed === true) {
      const { data, error } = await auth.service.rpc("finish_music_recording", { p_worker: auth.worker.id, p_job: job.id,
        p_lease: input.lease_id, p_result: {}, p_failed: true });
      if (error || data !== true) return generationFailure("The recording status could not be saved.", 409);
      return musicWorkerReply({ completed: false, failed: true });
    }
    const result = input.result as Record<string, unknown> | undefined;
    if (!result || typeof result !== "object" || typeof result.lyrics !== "string" || result.lyrics.length > 4096
      || typeof result.actual_duration !== "number" || !Number.isFinite(result.actual_duration)
      || result.actual_duration <= (job.origin === "cloud" ? 180 : 0) || result.actual_duration > (job.origin === "cloud" ? 245 : 605)) {
      return generationFailure("The recording did not meet the duration requirements.", 400);
    }
    const { data: audio, error: downloadError } = await auth.service.storage.from(MUSIC_BUCKET).download(musicPath(auth.worker.owner_id, job.id));
    if (downloadError || !audio || !audio.size || audio.size > CLOUD_AUDIO_LIMIT) return generationFailure("The recording upload could not be verified.", 409);
    const signature = new Uint8Array(await audio.slice(0, 3).arrayBuffer());
    if (!(signature[0] === 0x49 && signature[1] === 0x44 && signature[2] === 0x33)
      && !(signature[0] === 0xff && (signature[1] & 0xe0) === 0xe0)) return generationFailure("The recording format could not be verified.", 400);
    const metadata: Record<string, unknown> = { lyrics: result.lyrics, actual_duration: result.actual_duration };
    for (const field of ["caption", "engine", "model", "model_revision", "code_revision", "lyrics_model", "lyrics_model_revision", "expected_model_revision"]) {
      if (typeof result[field] === "string") metadata[field] = result[field].slice(0, 512);
    }
    if (Number.isSafeInteger(result.seed)) metadata.seed = result.seed;
    const { data, error } = await auth.service.rpc("finish_music_recording", { p_worker: auth.worker.id, p_job: job.id,
      p_lease: input.lease_id, p_result: metadata, p_failed: false });
    if (error || data !== true) return generationFailure("The recording status could not be saved.", 409);
    return musicWorkerReply({ completed: true });
  } catch { return generationFailure("The recording could not be finalized. It is safe to retry its upload.", 503); }
}
