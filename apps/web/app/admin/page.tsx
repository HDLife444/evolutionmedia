import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import type { UploadJob } from "@/utils/ingestion";
import { UploadPortal } from "./upload-portal";
import { TextSearch } from "./text-search";

export const maxDuration = 60;

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const { data: administrator, error: roleError } = await supabase.rpc("is_song_administrator");
  if (!roleError && administrator !== true) return <main><header><Link className="brand" href="/">Evolution Media</Link></header><section className="panel"><h1>Administrator access</h1><p>This account does not have administrator access. Sign in with the account assigned for song uploads.</p><Link href="/">Back to your library</Link></section></main>;

  let jobs: UploadJob[] = [];
  let unavailable = Boolean(roleError);
  if (!unavailable) {
    const { data, error } = await supabase.from("song_ingestion_jobs")
      .select("song_id,status,storage_path,file_size,mime_type,sha256,songs(title)")
      .order("created_at", { ascending: false }).limit(50);
    unavailable = Boolean(error);
    jobs = (data ?? []).map(row => ({
      ...row, title: (row.songs as unknown as { title: string } | null)?.title ?? "Song",
    }));
  }

  return <main>
    <header><Link className="brand" href="/">Evolution Media</Link><span className="eyebrow">Administrator</span></header>
    <section className="intro"><span className="eyebrow">Foundational collection</span>
      <h1>Give your library<br />its first voice.</h1>
      <p>Upload one song, preserve its story, and prepare it for Sound Vector.</p>
    </section>
    {notice === "song-saved" && <p role="status" className="notice">Changes saved. Select Index song to update its search results.</p>}
    {unavailable ? <p role="alert" className="panel">Administrator access is unavailable. The upload portal may still need activation.</p>
      : <><UploadPortal jobs={jobs} /><TextSearch /></>}
    <footer><Link href="/">Back to your library</Link></footer>
  </main>;
}
