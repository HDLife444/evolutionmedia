import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { UUID_PATTERN, type SongSubmission } from "@/utils/ingestion";
import { SongEditor } from "./song-editor";
import { SongPlayer } from "@/app/song-player";

export default async function EditSongPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const { data: administrator } = await supabase.rpc("is_song_administrator");
  if (administrator !== true) redirect("/admin");
  const { data: job } = await supabase.from("song_ingestion_jobs").select("submission,updated_at,status")
    .eq("song_id", id).eq("owner_id", user.id).maybeSingle();
  if (!job) notFound();
  return <main><header><Link className="brand" href="/">Evolution Media</Link><Link href="/admin">Admin</Link></header>
    <section className="intro"><h1>Edit song</h1><p>Update the song’s details and sharing permissions. After saving changes, index it again from Admin to update its search results.</p></section>
    {job.status === "awaiting_upload" ? <p>Finish uploading this song before editing.</p> : <>
      <SongPlayer songId={id} title={job.submission.title} />
      <SongEditor key={job.updated_at} submission={{ ...job.submission, song_id: id } as SongSubmission} updatedAt={job.updated_at} />
    </>}
    <footer><Link href="/admin">Back to Admin</Link></footer>
  </main>;
}
