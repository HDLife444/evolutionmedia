"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
export function GeneratorConnection() {
  const router = useRouter();
  const [connection, setConnection] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/generation/connection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connection }), cache: "no-store" });
      const result = await response.json();
      if (!response.ok) setMessage(result.error ?? "We couldn’t connect. Try the latest server connection details.");
      else { setConnection(""); router.push("/generate"); router.refresh(); }
    } catch { setMessage("We couldn’t reach the site. Please try again."); }
    finally { setBusy(false); }
  }
  async function disconnect() {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/generation/connection", { method: "DELETE", cache: "no-store" });
      if (!response.ok) setMessage("We couldn’t disconnect. Please try again.");
      else { setConnection(""); setMessage("Server disconnected from this browser. This does not stop your Lambda GPU or its billing."); }
    } catch { setMessage("We couldn’t reach the site. Please try again."); }
    finally { setBusy(false); }
  }
  return <section className="panel queue"><h2>Paste your connection details</h2>
    <p>Paste the complete connection block here. It contains the server access key, so keep it here rather than posting it in chat.</p>
    <form className="upload-form" onSubmit={connect}><fieldset disabled={busy}>
      <label htmlFor="generator-connection">Lambda connection block</label>
      <textarea id="generator-connection" value={connection} onChange={event => setConnection(event.target.value)} rows={5} maxLength={4096} required autoComplete="off" spellCheck={false} />
      <button type="submit">{busy ? "Connecting…" : "Connect music server"}</button>
    </fieldset></form>
    {message && <p role="status" className="notice">{message}</p>}
    <button type="button" className="secondary" disabled={busy} onClick={disconnect}>Disconnect this browser</button>
  </section>;
}
