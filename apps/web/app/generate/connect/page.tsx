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
    <section className="intro"><span className="eyebrow">One-time server connection</span><h1>Connect your<br />music server.</h1>
      <p>Once connected, create and listen to tracks from this site.</p></section>
    {error || data !== true ? <section className="panel"><p>Sign in with the administrator account to connect the generator.</p><Link href="/">Return home</Link></section>
      : <><section className="panel"><h2>Start the Lambda service</h2>
        <p>Use the setup package in your private generator repository on the Lambda server. Its launch command prints a connection block.</p>
        <p><a href="https://github.com/HDLife444/evolutionmedia-generator/blob/main/docs/lambda-setup.md" target="_blank" rel="noreferrer">Open the Lambda setup instructions</a></p>
        <p>The connection is kept in a protected cookie for this administrator account and browser for 12 hours. Reconnect after restarting the tunnel or changing browsers.</p>
      </section><GeneratorConnection /></>}
    <footer><Link href="/generate">Back to the generator</Link></footer>
  </main>;
}
