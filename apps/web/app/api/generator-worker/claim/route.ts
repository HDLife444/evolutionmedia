import { generationFailure } from "@/utils/generation-server";
import { musicWorkerReply, workerIdentity } from "@/utils/music-cloud";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const auth = await workerIdentity(request);
  if (auth.error) return auth.error;
  try {
    const { data, error } = await auth.service.rpc("claim_music_recording", { p_worker: auth.worker.id });
    if (error) return generationFailure("The music queue is temporarily unavailable.", 503);
    if (!data?.id) return musicWorkerReply({ job: null });
    return musicWorkerReply({ job: { id: data.id, owner_id: data.owner_id, moment: data.moment, genre: data.genre, kind: data.kind,
      duration: data.duration, lease_id: data.lease_id } });
  } catch { return generationFailure("The music queue is temporarily unavailable.", 503); }
}
