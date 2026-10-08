import { createClient } from "@/utils/supabase/server";
import { signIn, signOut } from "./actions";
import Link from "next/link";

const notices: Record<string, string> = {
  "missing-credentials": "Enter your email and password.",
  "sign-in-failed": "We couldn’t sign you in. Check your credentials and try again.",
  "sign-out-failed": "We couldn’t sign you out. Please try again.",
};

export default async function Page({ searchParams }: {
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const params = await searchParams;
  const notice = typeof params.notice === "string" ? notices[params.notice] : undefined;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  const authUnavailable = authError && authError.name !== "AuthSessionMissingError";
  const { data: administrator } = user ? await supabase.rpc("is_song_administrator") : { data: false };

  return (
    <main>
      <header>
        <a href="/" className="brand">Evolution Media</a>
        <span className="eyebrow">Sound Vector</span>
      </header>
      <section className="intro">
        <span className="eyebrow">The Collective Music Intelligence Architecture</span>
        <h1>Music for who<br />you’re becoming.</h1>
        <p>A growing library of songs for personal development, built around meaning, emotion, and your next chapter.</p>
      </section>
      {notice && <p role="alert" className="notice">{notice}</p>}
      {authUnavailable && <p role="alert" className="notice">We couldn’t verify your session. Please try again shortly.</p>}
      {user ? <>
        <div className="section-heading">
          <h2>Your library</h2>
          {administrator === true && <Link className="admin-link" href="/admin">Upload songs</Link>}
          <form action={signOut}><button className="secondary" type="submit">Sign out</button></form>
        </div>
        <SongCatalog />
      </> : <section className="panel login">
        <h2>Welcome to your library</h2>
        <p>Sign in to browse collective songs and your own private collection.</p>
        <form action={signIn}>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
          <button type="submit">Sign in</button>
        </form>
      </section>}
      <footer>Evolution Media · Your music, your next chapter.</footer>
    </main>
  );
}

async function SongCatalog() {
  const supabase = await createClient();
  // The caller's session and database RLS scope this query. Never use a service
  // key to make the collective/private catalog readable from this page.
  const { data: songs, error } = await supabase.from("songs")
    .select("id,title,description,visibility,genre,mood")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return <p role="alert" className="panel">Your library is temporarily unavailable. Please try again shortly.</p>;
  }
  if (!songs?.length) {
    return <section className="panel"><h3>Your first chapter starts here.</h3><p>No songs are available yet. Your foundational collection will appear here as it’s added.</p></section>;
  }
  return <ul className="catalog">{songs.map(song => <li key={song.id} className="panel">
    <span className="eyebrow">{song.visibility === "private" ? "Private" : "Collective"}</span>
    <h3>{song.title}</h3>
    {song.description && <p>{song.description}</p>}
    {song.genre?.length > 0 && <p className="tags">{song.genre.join(" · ")}</p>}
  </li>)}</ul>;
}
