import { createClient } from "@/utils/supabase/server";
import { signIn, signOut } from "./actions";
import Link from "next/link";
import { MomentSearch } from "./moment-search";

const notices: Record<string, string> = {
  "generator-sign-in": "Sign in with your administrator account to test music generation.",
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
      <section className="panel generation-invitation"><span className="eyebrow">Evolution Media Generator · Administrator preview</span><h2>Create music for your moment</h2><p>Choose your genre and turn the state you want to feel into a new song, instrumental, or soundscape.</p><Link className="generation-download" href="/generate">Open the music generator</Link></section>
      <MomentSearch />
      {user ? <>
        <div className="section-heading">
          <h2>Your account</h2>
          <Link className="admin-link" href="/admin">Admin</Link>
          <form action={signOut}><button className="secondary" type="submit">Sign out</button></form>
        </div>
      </> : <>
        <section className="panel login queue">
        <h2>Welcome to your library</h2>
        <p>Sign in to manage your songs.</p>
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
