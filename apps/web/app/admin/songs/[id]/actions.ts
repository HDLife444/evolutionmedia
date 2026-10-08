"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { validateSubmission } from "@/utils/ingestion";

export async function saveSong(input: unknown, updatedAt: string): Promise<{ error?: string }> {
  if (!validateSubmission(input) || !Number.isFinite(Date.parse(updatedAt))) return { error: "Check the song details and sharing permissions." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: admin } = user ? await supabase.rpc("is_song_administrator") : { data: false };
  if (!user || admin !== true) return { error: "Sign in with an authorized administrator account." };
  const { song_id, file_size, mime_type, sha256, ...changes } = input;
  void file_size; void mime_type; void sha256;
  const { error } = await supabase.rpc("update_ingested_song", { p_song_id: song_id, p_updated_at: updatedAt, p_changes: changes });
  if (error) return { error: error.code === "40001" ? "This song changed in another session. Reload before saving."
    : error.code === "55000" ? "Indexing is still running. Wait for it to finish, then try again."
    : "Couldn’t save the song. The song editing migration may need activation." };
  revalidatePath("/"); revalidatePath("/admin"); revalidatePath(`/admin/songs/${song_id}`);
  return {};
}
