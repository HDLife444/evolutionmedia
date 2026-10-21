import { generationAdministrator, generationFailure, privateHeaders, workerConnection, workerFetch } from "@/utils/generation-server";
import { validGenerationId } from "@/utils/generation";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!validGenerationId(id)) return generationFailure("Track not found.", 404);
  const auth = await generationAdministrator();
  if (auth.error) return auth.error;
  const connection = await workerConnection(auth.owner);
  if (!connection) return generationFailure("Reconnect your music server to listen.", 503);
  try {
    const response = await workerFetch(connection, `/v1/jobs/${id}/audio?owner_id=${encodeURIComponent(auth.owner)}`, { timeout: 20_000 });
    if (!response.ok) return generationFailure("This track’s audio is not available yet.", response.status === 404 ? 404 : 503);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 4_000_000) return generationFailure("This audio file couldn’t be played. Please try another track.", 503);
    const headers = { ...privateHeaders, "Content-Type": "audio/mpeg", "Accept-Ranges": "bytes",
      "Content-Disposition": `inline; filename="evolution-media-${id}.mp3"`, "X-Content-Type-Options": "nosniff" };
    const range = request.headers.get("range");
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      const start = match ? Number(match[1]) : -1;
      const end = match && match[2] ? Math.min(Number(match[2]), bytes.length - 1) : bytes.length - 1;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= bytes.length || end < start) {
        return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${bytes.length}` } });
      }
      return new Response(bytes.slice(start, end + 1), { status: 206, headers: { ...headers,
        "Content-Range": `bytes ${start}-${end}/${bytes.length}`, "Content-Length": String(end - start + 1) } });
    }
    return new Response(bytes, { headers: { ...headers, "Content-Length": String(bytes.length) } });
  } catch { return generationFailure("Audio couldn’t be loaded. Check your music server connection.", 503); }
}
