import { generationAdministrator, generationFailure, privateHeaders } from "@/utils/generation-server";
import { sameOriginRequest } from "@/utils/generation";
import { musicRpcRow, cloudMusicConfigured, cloudServerStatus, musicDatabaseFailure, musicService, newWorkerToken, tokenHash } from "@/utils/music-cloud";
export const runtime = "nodejs";

export async function GET() {
  const auth = await generationAdministrator();
  if (auth.error) return auth.error;
  if (!cloudMusicConfigured()) return Response.json({ configured: false, enrolled: false, ready: false }, { headers: privateHeaders });
  try { return Response.json({ configured: true, ...await cloudServerStatus(auth.owner) }, { headers: privateHeaders }); }
  catch { return generationFailure("Persistent music-server setup is not finished yet. Apply its database migration first.", 503); }
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return generationFailure("Register the music server from the Evolution Media site.", 403);
  const auth = await generationAdministrator();
  if (auth.error) return auth.error;
  if (!cloudMusicConfigured()) return generationFailure("Add the private Supabase server key in Vercel before registering the music server.", 503);
  try {
    const siteUrl = new URL(process.env.EVOLUTION_SITE_URL ?? "https://evolutionmedia.vercel.app");
    if (siteUrl.protocol !== "https:" || siteUrl.username || siteUrl.password || siteUrl.pathname !== "/" || siteUrl.search || siteUrl.hash) {
      return generationFailure("The website address is not configured correctly.", 503);
    }
    const token = newWorkerToken();
    const { data, error } = await musicService().rpc("register_music_worker", { p_owner: auth.owner, p_secret_hash: tokenHash(token) });
    if (error) return musicDatabaseFailure(error);
    if (!musicRpcRow(data)?.id) return generationFailure("The server registration could not be completed.", 503);
    return new Response(JSON.stringify({ version: 1, site_url: siteUrl.origin,
      storage_origin: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin, worker_token: token, owner_id: auth.owner }), {
      headers: { ...privateHeaders, "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="evolutionmedia-worker.json"', "X-Content-Type-Options": "nosniff" },
    });
  } catch { return generationFailure("The server registration could not be completed. Please try again.", 503); }
}
