import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { GeneratorConnection } from "./connection-form";
export default async function GeneratorConnectPage() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect("/?notice=generator-sign-in");
  const { data, error } = await client.rpc("is_song_administrator");
  return <main><header><Link className="brand" href="/">Evolution Media</Link><nav className="generation-nav" aria-label="Your music"><Link href="/#find-music">Find songs</Link><Link href="/generate">Music generator</Link><Link href="/playlists">My playlists</Link></nav></header>
    <section className="intro"><span className="eyebrow">One-time server setup</span><h1>Your permanent<br />music connection.</h1>
      <p>Create full-length music from this site, with your recordings saved privately to your account.</p></section>
    {error || data !== true ? <section className="panel"><p>Sign in with the administrator account to connect the generator.</p><Link href="/">Return home</Link></section>
      : <><section className="panel"><h2>Connect once, create whenever you’re ready</h2>
        <p>Your Lambda server picks up work from the website over HTTPS. A custom domain or Cloudflare account is not required.</p>
        <p><a href="https://github.com/HDLife444/evolutionmedia-generator/blob/main/docs/permanent-server.md" target="_blank" rel="noreferrer">Open the permanent server setup instructions</a></p>
        <p>Custom generation remains private to your administrator account while you test.</p>
      </section><GeneratorConnection /></>}
    <footer><Link href="/generate">Back to the generator</Link></footer>
  </main>;
}
