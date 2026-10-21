import { generationFailure } from "@/utils/generation-server";
import { musicRpcRow, musicWorkerReply, workerIdentity } from "@/utils/music-cloud";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const auth = await workerIdentity(request);
  if (auth.error) return auth.error;
  try {
    const { data, error } = await auth.service.rpc("claim_music_recording", { p_worker: auth.worker.id });
    if (error) return generationFailure("The music queue is temporarily unavailable.", 503);
    const row = musicRpcRow(data);
    if (!row?.id) return musicWorkerReply({ job: null });
    return musicWorkerReply({ job: { id: row.id, owner_id: row.owner_id, moment: row.moment, genre: row.genre, kind: row.kind,
      duration: row.duration, lease_id: row.lease_id } });
  } catch { return generationFailure("The music queue is temporarily unavailable.", 503); }
}
