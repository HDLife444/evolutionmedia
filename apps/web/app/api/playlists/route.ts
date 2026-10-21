import { sameOriginRequest, smallJson } from "@/utils/generation";
import { playlistName, playlistSummary } from "@/utils/playlists";
import { playlistDatabaseFailure, playlistFailure, playlistFields, playlistReply, playlistUser } from "@/utils/playlist-server";

export async function GET() {
  const auth = await playlistUser();
  if (auth.error) return auth.error;
  try {
    const { data, error } = await auth.client.from("playlists").select(playlistFields + ",playlist_items(count)")
      .eq("owner_id", auth.owner).order("updated_at", { ascending: false }).order("id").limit(50);
    if (error) return playlistDatabaseFailure(error);
    return playlistReply({ playlists: (data ?? []).map(row => playlistSummary(row as unknown as Record<string, unknown>)) });
  } catch { return playlistFailure("We couldn’t load your playlists just now. Please try again.", 503); }
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return playlistFailure("Please create playlists from the Evolution Media site.", 403);
  const auth = await playlistUser();
  if (auth.error) return auth.error;
  let name: string | null;
  try { name = playlistName(await smallJson(request, 2048)); }
  catch { return playlistFailure("Enter a playlist name in up to 80 characters.", 400); }
  if (!name) return playlistFailure("Enter a playlist name in up to 80 characters.", 400);
  try {
    const { data, error } = await auth.client.from("playlists").insert({ owner_id: auth.owner, name }).select(playlistFields).single();
    if (error) return playlistDatabaseFailure(error);
    return playlistReply({ playlist: playlistSummary(data as unknown as Record<string, unknown>) }, 201);
  } catch { return playlistFailure("We couldn’t create this playlist. Please try again.", 503); }
}
