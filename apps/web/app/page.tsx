import { createClient } from "@/utils/supabase/server";
import { signIn, signOut } from "./actions";
import Link from "next/link";
import { MomentSearch } from "./moment-search";

const notices: Record<string, string> = {
  "generator-sign-in": "Sign in with your administrator account to test music generation.",
  "playlist-sign-in": "Sign in to create and listen to your private playlists.",
  "missing-credentials": "Enter your email and password.",
  "sign-in-failed": "We couldn’t sign you in. Check your credentials and try again.",
  "sign-in-invalid": "Your email or password wasn’t accepted. Use your Evolution Media website account details.",
  "sign-in-unconfirmed": "Confirm your email address before signing in. Check your inbox for the confirmation email.",
  "sign-in-rate-limited": "Too many sign-in attempts. Please wait a few minutes before trying again.",
  "sign-in-unavailable": "The sign-in service is temporarily unavailable. Please try again shortly.",
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
      {notice && user && <p role="alert" className="notice">{notice}</p>}
      {authUnavailable && <p role="alert" className="notice">We couldn’t verify your session. Please try again shortly.</p>}
      {user ? <nav className="account-choices" aria-label="Your music">
        <Link className="panel account-choice" href="#find-music"><span className="eyebrow">Discover</span><h2>Find existing songs</h2><p>Search the collection for music that speaks to your moment.</p><span className="account-choice-action">Find my music →</span></Link>
        <Link className="panel account-choice" href="/generate"><span className="eyebrow">Create</span><h2>Generate a custom song</h2><p>Describe how you want to feel and choose a sound of your own.</p><span className="account-choice-action">Create a track →</span></Link>
        <Link className="panel account-choice" href="/playlists"><span className="eyebrow">Keep your favorites</span><h2>Build a playlist</h2><p>Bring the songs you find and create into your private playlists.</p><span className="account-choice-action">My playlists →</span></Link>
      </nav> : <section className="panel generation-invitation"><span className="eyebrow">Evolution Media Generator · Administrator preview</span><h2>Create music for your moment</h2><p>Choose your genre and turn the state you want to feel into a new song, instrumental, or soundscape.</p><Link className="generation-download" href="/generate">Open the music generator</Link></section>}
      <MomentSearch canSave={Boolean(user)} />
      {user ? <>
        <div className="section-heading">
          <h2>Your account</h2>
          {administrator === true && <Link className="admin-link" href="/admin">Manage collection</Link>}
          <form action={signOut}><button className="secondary" type="submit">Sign out</button></form>
        </div>
      </> : <>
        <section className="panel login queue">
        <h2>Welcome to your library</h2>
        <p>Sign in to manage your songs.</p>
        {notice && <p role="alert" className="notice">{notice}</p>}
        <form action={signIn}>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
          <button type="submit">Sign in</button>
        </form>
      </section></>}
      <footer>Evolution Media · Your music, your next chapter.</footer>
    </main>
  );
}
