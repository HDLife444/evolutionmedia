import { smallJson } from "@/utils/generation";
import { generationFailure } from "@/utils/generation-server";
import { claimedRecording, MUSIC_BUCKET, musicPath, musicWorkerReply, workerIdentity } from "@/utils/music-cloud";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const auth = await workerIdentity(request);
  if (auth.error) return auth.error;
  try {
    const input = await smallJson(request) as Record<string, unknown>;
    const job = await claimedRecording(auth.service, auth.worker, input.job_id, input.lease_id);
    if (!job) return generationFailure("This recording lease is no longer active.", 409);
    const path = musicPath(auth.worker.owner_id, job.id);
    const { data, error } = await auth.service.storage.from(MUSIC_BUCKET).createSignedUploadUrl(path, { upsert: true });
    if (error || !data?.signedUrl) return generationFailure("Private recording storage is unavailable.", 503);
    return musicWorkerReply({ upload_url: data.signedUrl, storage_origin: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin,
      storage_path: path });
  } catch { return generationFailure("The upload could not be prepared.", 503); }
}
