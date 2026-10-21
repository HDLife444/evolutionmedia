import { smallJson, validGenerationId } from "@/utils/generation";
import { generationFailure } from "@/utils/generation-server";
import { musicWorkerReply, workerIdentity } from "@/utils/music-cloud";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const auth = await workerIdentity(request);
  if (auth.error) return auth.error;
  try {
    const input = await smallJson(request) as { after?: unknown };
    if (input.after != null && !validGenerationId(input.after)) return generationFailure("Invalid cleanup cursor.", 400);
    let query = auth.service.from("music_recordings").select("id").eq("owner_id", auth.worker.owner_id)
      .eq("status", "deleted").order("id", { ascending: true }).limit(100);
    if (typeof input.after === "string") query = query.gt("id", input.after);
    const { data, error } = await query;
    if (error) return generationFailure("Recording cleanup is temporarily unavailable.", 503);
    return musicWorkerReply({ deleted_ids: (data ?? []).map(row => row.id) });
  } catch { return generationFailure("Invalid cleanup request.", 400); }
}
