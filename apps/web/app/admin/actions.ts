"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { UUID_PATTERN, validateSubmission, type UploadJob } from "@/utils/ingestion";

async function administratorClient() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: administrator, error: roleError } = await supabase.rpc("is_song_administrator");
  return !roleError && administrator === true ? supabase : null;
}

function toUploadJob(data: Record<string, unknown>): UploadJob {
  return {
    song_id: String(data.song_id), status: data.status as UploadJob["status"],
    storage_path: String(data.storage_path), file_size: Number(data.file_size),
    mime_type: String(data.mime_type), sha256: String(data.sha256),
    title: String((data.submission as Record<string, unknown>)?.title ?? "Song"),
  };
}

export async function beginUpload(input: unknown): Promise<{ job?: UploadJob; error?: string }> {
  if (!validateSubmission(input)) return { error: "Check the song details, file, rights, and sharing consent." };
  const supabase = await administratorClient();
  if (!supabase) return { error: "Sign in with an authorized administrator account." };
  const { song_id, ...submission } = input;
  const { data, error } = await supabase.rpc("begin_song_ingestion", { p_song_id: song_id, p_submission: submission });
  if (error || !data) {
    console.error("Song registration failed:", error?.code);
    return { error: "We couldn’t register this upload. Please try again." };
  }
  return { job: toUploadJob(data) };
}

export async function finishUpload(songId: string): Promise<{ job?: UploadJob; error?: string }> {
  if (!UUID_PATTERN.test(songId)) return { error: "Invalid upload identifier." };
  const supabase = await administratorClient();
  if (!supabase) return { error: "Sign in with an authorized administrator account." };
  const { data, error } = await supabase.rpc("complete_song_ingestion", { p_song_id: songId });
  if (error || !data) {
    console.error("Song upload completion failed:", error?.code);
    return { error: "The audio upload could not be confirmed. Resume with the same file to try again." };
  }
  revalidatePath("/");
  revalidatePath("/admin");
  return { job: toUploadJob(data) };
}
