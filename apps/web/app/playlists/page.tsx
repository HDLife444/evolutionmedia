import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { PlaylistLibrary } from "./playlist-library";

export default async function PlaylistsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/?notice=playlist-sign-in");

  return <main className="playlist-page">
    <header><Link className="brand" href="/">Evolution Media</Link>
      <nav className="generation-nav" aria-label="Music navigation"><Link href="/#find-music">Find songs</Link><Link href="/generate">Create a song</Link></nav>
    </header>
    <section className="intro generation-intro"><span className="eyebrow">Your private collection</span>
      <h1>Music for every<br />chapter.</h1>
      <p>Build playlists from songs you discover and tracks you create. Keep your favorites together and listen in order.</p>
    </section>
    <PlaylistLibrary />
    <footer>Evolution Media · Your playlists stay private to your account.</footer>
  </main>;
}
