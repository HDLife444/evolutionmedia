import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { GenerationStudio } from "../generation-studio";

export default async function GeneratePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/?notice=generator-sign-in");
  const { data: administrator, error } = await supabase.rpc("is_song_administrator");

  return <main className="generation-page">
    <header><Link className="brand" href="/">Evolution Media</Link>
      <nav className="generation-nav" aria-label="Generator navigation"><Link href="/">Home</Link><Link href="/admin">Admin</Link></nav>
    </header>
    <section className="intro generation-intro">
      <span className="eyebrow">Evolution Media Generator · Administrator preview</span>
      <h1>Music for<br />your next moment.</h1>
      <p>Describe how you want to feel, choose your sound, and create something new for the chapter ahead.</p>
    </section>
    {error ? <section className="panel"><h2>Generator access is temporarily unavailable</h2><p>We couldn’t verify administrator access. Please refresh or sign in again.</p><Link href="/">Return home</Link></section>
      : administrator !== true ? <section className="panel"><h2>Administrator preview</h2><p>Song creation is currently available to the administrator account while we test the generator.</p><Link href="/">Return home</Link></section>
      : <GenerationStudio />}
    <footer>Evolution Media · A new song for the life you’re creating.</footer>
  </main>;
}
