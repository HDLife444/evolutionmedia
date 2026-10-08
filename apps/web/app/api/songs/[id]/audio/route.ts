import { createClient } from "@/utils/supabase/server";
import { UUID_PATTERN } from "@/utils/ingestion";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const headers = { "Cache-Control": "private, no-store" };
  if (!UUID_PATTERN.test(id)) return Response.json({ error: "Song not found." }, { status: 404, headers });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in to listen." }, { status: 401, headers });
  // Both the asset lookup and URL creation use the listener's session and RLS.
  const { data: asset } = await supabase.from("song_assets").select("storage_path")
    .eq("song_id", id).eq("asset_type", "audio").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!asset) return Response.json({ error: "Audio is unavailable for this song." }, { status: 404, headers });
  const { data, error } = await supabase.storage.from("song-assets").createSignedUrl(asset.storage_path, 60);
  if (error || !data) return Response.json({ error: "Audio access is unavailable. Please try again." }, { status: 403, headers });
  return Response.json({ url: data.signedUrl }, { headers });
}
