"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { notifyPlaylistsChanged, PLAYLISTS_CHANGED, playlistRequest, type PlaylistSource, type PlaylistSummary } from "@/utils/playlist-events";

export function AddToPlaylist({ source, trackId, title }: { source: PlaylistSource; trackId: string; title: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const saveLock = useRef(false);
  const sequence = useRef(0);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    async function load() {
      const request = ++sequence.current;
      setLoading(true); setError("");
      try {
        const result = await playlistRequest<{ playlists: PlaylistSummary[] }>("/api/playlists", { signal: controller.signal });
        if (controller.signal.aborted || request !== sequence.current) return;
        setPlaylists(result.playlists);
        setSelected(previous => result.playlists.some(playlist => playlist.id === previous) ? previous : result.playlists[0]?.id ?? "");
      } catch (reason) {
        if (!controller.signal.aborted && request === sequence.current) setError(reason instanceof Error ? reason.message : "Your playlists couldn’t load.");
      } finally {
        if (!controller.signal.aborted && request === sequence.current) setLoading(false);
      }
    }
    void load();
    const changed = () => { void load(); };
    window.addEventListener(PLAYLISTS_CHANGED, changed);
    return () => { controller.abort(); window.removeEventListener(PLAYLISTS_CHANGED, changed); };
  }, [open]);

  async function add() {
    if (!selected || saveLock.current) return;
    saveLock.current = true;
    setSaving(true); setError(""); setMessage("");
    try {
      const safeTitle = Array.from(title.trim()).slice(0, 160).join("") || (source === "generated" ? "My generated track" : "Song");
      await playlistRequest(`/api/playlists/${selected}/items`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, trackId, title: safeTitle }),
      });
      setMessage(`Added to “${playlists.find(playlist => playlist.id === selected)?.name ?? "your playlist"}”.`);
      notifyPlaylistsChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The track couldn’t be added. Please try again."); }
    finally { saveLock.current = false; setSaving(false); }
  }

  return <div className="playlist-add">
    <button type="button" className="secondary" aria-label={`Add ${title} to playlist`} aria-expanded={open} aria-controls={`${id}-chooser`}
      onClick={() => { setOpen(value => !value); setMessage(""); }}>Add to playlist</button>
    {open && <div className="playlist-add-chooser" id={`${id}-chooser`}>
      {loading && <p role="status">Loading your playlists…</p>}
      {!loading && !error && playlists.length === 0 && <p>Create your first playlist, then come back to add this track.</p>}
      {playlists.length > 0 && <>
        <label htmlFor={`${id}-playlist`}>Choose a playlist</label>
        <select id={`${id}-playlist`} value={selected} disabled={loading || saving} onChange={event => { setSelected(event.target.value); setMessage(""); }}>
          {playlists.map(playlist => <option key={playlist.id} value={playlist.id}>{playlist.name}</option>)}
        </select>
        <button type="button" disabled={loading || saving || !selected} onClick={() => void add()}>{saving ? "Adding…" : "Add track"}</button>
      </>}
      <Link href="/playlists">Create or manage playlists</Link>
      {error && <p role="alert" className="notice">{error}</p>}
      {message && <p role="status">{message}</p>}
    </div>}
  </div>;
}
