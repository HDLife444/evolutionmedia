"use client";
import { useCallback, useEffect, useState } from "react";

type ServerStatus = { configured: boolean; enrolled: boolean; ready: boolean; lastSeen?: string | null };
export function GeneratorConnection() {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const check = useCallback(async () => {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/generation/server", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The music server status could not be checked.");
      setStatus(data);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "The music server status could not be checked."); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void check(); }, [check]);

  async function register() {
    if (busy) return;
    if (status?.enrolled && !window.confirm("Replace your music server configuration? Wait for any recording to finish, then install the new file on your server.")) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/generation/server", { method: "POST", cache: "no-store" });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "The configuration could not be downloaded.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url; link.download = "evolutionmedia-worker.json";
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus(previous => ({ ...previous, configured: true, enrolled: true, ready: false }));
      setMessage("Configuration downloaded. Upload evolutionmedia-worker.json to your Lambda server and follow the installation instructions. Keep this file private.");
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "The configuration could not be downloaded."); }
    finally { setBusy(false); }
  }
  return <section className="panel queue">
    <h2>Persistent music server</h2>
    <p role="status">{status?.ready ? "Your music server is online and ready to create full-length recordings."
      : status?.enrolled ? "Server registered. Waiting for it to connect."
      : status?.configured ? "Register your music server to finish connecting it."
      : "Complete the one-time persistent server setup, then register your music server here."}</p>
    <p>This connection stays registered across sign-outs and browser changes. Your recordings are saved privately to your account.</p>
    <div className="generation-actions">
      <button type="button" disabled={busy || !status?.configured} onClick={() => void register()}>
        {busy ? "Working…" : status?.enrolled ? "Download replacement configuration" : "Download server configuration"}
      </button>
      <button type="button" className="secondary" disabled={busy} onClick={() => void check()}>Check server status</button>
    </div>
    {message && <p role="status" className="notice">{message}</p>}
  </section>;
}
