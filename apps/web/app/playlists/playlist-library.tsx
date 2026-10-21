"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { notifyPlaylistsChanged, PLAYLISTS_CHANGED, playlistRequest, type PlaylistDetails, type PlaylistItem, type PlaylistSummary } from "@/utils/playlist-events";

function PlaylistTracks({ items, busy, onRemove }: { items: PlaylistItem[]; busy: boolean; onRemove: (item: PlaylistItem) => void }) {
  const audio = useRef<HTMLAudioElement>(null);
  const playSequence = useRef(0);
  const [current, setCurrent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const currentIndex = items.findIndex(item => item.id === current);

  useEffect(() => () => { playSequence.current++; }, []);
  useEffect(() => {
    if (current && !items.some(item => item.id === current)) {
      playSequence.current++; audio.current?.pause();
      audio.current?.removeAttribute("src"); audio.current?.load();
      setCurrent(null); setLoading(false); setPlaying(false); setError("");
    }
  }, [current, items]);

  async function play(item: PlaylistItem) {
    const request = ++playSequence.current;
    audio.current?.pause(); audio.current?.removeAttribute("src"); audio.current?.load();
    setCurrent(item.id);
    setLoading(true); setError("");
    try {
      let url = `/api/generation/${item.trackId}/audio`;
      if (item.source === "catalog") {
        const result = await playlistRequest<{ url: string }>(`/api/songs/${item.trackId}/audio`);
        if (typeof result.url !== "string" || !result.url) throw new Error("This song’s audio is unavailable.");
        url = result.url;
      }
      if (request !== playSequence.current || !audio.current) return;
      audio.current.src = url;
      await audio.current.play();
    } catch (reason) {
      if (request === playSequence.current) setError(reason instanceof Error ? reason.message : "Playback couldn’t start. Please try again.");
    } finally { if (request === playSequence.current) setLoading(false); }
  }

  if (items.length === 0) return <div className="playlist-empty"><h3>Your next favorite belongs here</h3>
    <p>Find a song or create a custom track, then choose “Add to playlist”.</p>
    <div className="playlist-actions"><Link href="/#find-music">Find songs</Link><Link href="/generate">Create a song</Link></div>
  </div>;

  return <>
    <div className="playlist-player">
      <p className="playlist-now-playing">{currentIndex >= 0 ? <>Now selected: <strong>{items[currentIndex].title}</strong></> : "Play your playlist from the beginning, or choose a track below."}</p>
      <div className="playlist-actions">
        <button type="button" disabled={loading} onClick={() => {
          if (playing) audio.current?.pause();
          else if (currentIndex >= 0 && audio.current?.getAttribute("src")) {
            void audio.current.play().catch(() => setError("Playback couldn’t resume. Select the track below to try again."));
          } else void play(items[Math.max(0, currentIndex)]);
        }}>{loading ? "Loading…" : playing ? "Pause playlist" : currentIndex >= 0 ? "Resume playlist" : "Play playlist"}</button>
        <button type="button" className="secondary" disabled={loading || currentIndex <= 0} onClick={() => void play(items[currentIndex - 1])}>Previous</button>
        <button type="button" className="secondary" disabled={loading || currentIndex < 0 || currentIndex >= items.length - 1} onClick={() => void play(items[currentIndex + 1])}>Next</button>
      </div>
      <audio ref={audio} controls preload="none" aria-label="Playlist audio player"
        onPlay={() => { document.querySelectorAll("audio").forEach(other => { if (other !== audio.current) other.pause(); }); setPlaying(true); }}
        onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); if (currentIndex >= 0 && currentIndex + 1 < items.length) void play(items[currentIndex + 1]); }}
        onError={() => {
          if (!audio.current?.getAttribute("src")) return;
          setPlaying(false);
          setError("This track’s audio is unavailable. For a generated track, check your music server connection. You can remove unavailable tracks from this playlist.");
        }} />
      {error && <p role="alert" className="notice">{error}</p>}
    </div>
    <ol className="playlist-tracks">{items.map((item, index) => <li key={item.id} className={item.id === current ? "selected" : ""}>
      <div className="playlist-track-name"><span className="playlist-track-number" aria-hidden="true">{index + 1}</span>
        <div><h3>{item.title}</h3><small>{item.source === "generated" ? "Your custom track" : "From the collection"}</small></div>
      </div>
      <div className="playlist-actions"><button type="button" className="secondary" disabled={loading} onClick={() => void play(item)} aria-label={`Play ${item.title}`}>Play</button>
        <button type="button" className="secondary" disabled={busy} onClick={() => onRemove(item)} aria-label={`Remove ${item.title} from playlist`}>Remove</button></div>
    </li>)}</ol>
    {items.some(item => item.source === "generated") && <p className="playlist-note">Custom tracks play while your music server is connected. Deleting a custom track also removes its audio; saving it to a playlist doesn’t make a separate copy.</p>}
  </>;
}

export function PlaylistLibrary() {
  const formId = useId();
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [details, setDetails] = useState<PlaylistDetails | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [mutation, setMutation] = useState("");
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [detailVersion, setDetailVersion] = useState(0);
  const mutationLock = useRef(false);
  const loadSequence = useRef(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    const request = ++loadSequence.current;
    setLoading(true); setError("");
    try {
      const result = await playlistRequest<{ playlists: PlaylistSummary[] }>("/api/playlists", { signal });
      if (signal?.aborted || request !== loadSequence.current) return;
      setPlaylists(result.playlists); setLoaded(true);
      setSelected(previous => result.playlists.some(playlist => playlist.id === previous) ? previous : result.playlists[0]?.id ?? null);
    } catch (reason) {
      if (!signal?.aborted && request === loadSequence.current) setError(reason instanceof Error ? reason.message : "Your playlists couldn’t load.");
    } finally { if (!signal?.aborted && request === loadSequence.current) setLoading(false); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const changed = () => { void load(controller.signal); setDetailVersion(value => value + 1); };
    window.addEventListener(PLAYLISTS_CHANGED, changed);
    return () => { controller.abort(); window.removeEventListener(PLAYLISTS_CHANGED, changed); };
  }, [load]);

  useEffect(() => {
    setDetails(previous => previous?.playlist.id === selected ? previous : null); setDetailError(""); setConfirmDelete(null);
    if (!selected) { setLoadingTracks(false); return; }
    const controller = new AbortController();
    setLoadingTracks(true);
    void playlistRequest<PlaylistDetails>(`/api/playlists/${selected}`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setDetails(result); })
      .catch(reason => { if (!controller.signal.aborted) setDetailError(reason instanceof Error ? reason.message : "The playlist couldn’t load."); })
      .finally(() => { if (!controller.signal.aborted) setLoadingTracks(false); });
    return () => controller.abort();
  }, [selected, detailVersion]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || mutationLock.current) return;
    mutationLock.current = true; setMutation("create"); setError(""); setMessage("");
    try {
      const result = await playlistRequest<{ playlist: PlaylistSummary }>("/api/playlists", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }),
      });
      setName(""); setSelected(result.playlist.id); setPlaylists(previous => [result.playlist, ...previous]);
      setMessage(`“${result.playlist.name}” is ready. Add tracks as you find or create them.`);
      notifyPlaylistsChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Your playlist couldn’t be created."); }
    finally { mutationLock.current = false; setMutation(""); }
  }

  async function removePlaylist(playlist: PlaylistSummary) {
    if (mutationLock.current) return;
    mutationLock.current = true; setMutation(playlist.id); setError(""); setMessage("");
    try {
      await playlistRequest(`/api/playlists/${playlist.id}`, { method: "DELETE" });
      setPlaylists(previous => previous.filter(item => item.id !== playlist.id));
      setSelected(previous => previous === playlist.id ? null : previous); setConfirmDelete(null);
      setMessage(`“${playlist.name}” was deleted. Its songs remain available separately.`);
      notifyPlaylistsChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Your playlist couldn’t be deleted."); }
    finally { mutationLock.current = false; setMutation(""); }
  }

  async function removeItem(item: PlaylistItem) {
    if (!selected || mutationLock.current) return;
    mutationLock.current = true; setMutation(item.id); setError(""); setMessage("");
    try {
      await playlistRequest(`/api/playlists/${selected}/items/${item.id}`, { method: "DELETE" });
      setDetails(previous => previous ? { ...previous, items: previous.items.filter(track => track.id !== item.id) } : previous);
      setPlaylists(previous => previous.map(playlist => playlist.id === selected ? { ...playlist, itemCount: Math.max(0, playlist.itemCount - 1) } : playlist));
      setMessage(`“${item.title}” was removed from the playlist.`);
      notifyPlaylistsChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The track couldn’t be removed."); }
    finally { mutationLock.current = false; setMutation(""); }
  }

  const chosen = playlists.find(playlist => playlist.id === selected);

  return <div className="playlist-library">
    <section className="panel playlist-create" aria-labelledby={`${formId}-heading`}>
      <h2 id={`${formId}-heading`}>Create a playlist</h2><p>A place for your next chapter, daily focus, or a fresh start.</p>
      <form onSubmit={create}><label htmlFor={`${formId}-name`}>Playlist name</label>
        <div className="playlist-create-fields"><input id={`${formId}-name`} name="name" value={name} maxLength={80} required
          placeholder="My fresh start" disabled={!loaded || Boolean(mutation)} onChange={event => setName(event.target.value)} />
          <button type="submit" disabled={!loaded || Boolean(mutation) || !name.trim()}>{mutation === "create" ? "Creating…" : "Create playlist"}</button></div>
      </form>
      {error && <p role="alert" className="notice">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!loading && error && <button type="button" className="secondary" onClick={() => void load()}>Try loading playlists again</button>}
    </section>
    {loading && !loaded && <p role="status">Loading your playlists…</p>}
    {loaded && playlists.length === 0 && <section className="panel playlist-empty"><h2>Your collection starts here</h2><p>Create a playlist above, then add songs from search results or your custom tracks.</p>
      <div className="playlist-actions"><Link href="/#find-music">Find songs</Link><Link href="/generate">Create a song</Link></div>
    </section>}
    {playlists.length > 0 && <div className="playlist-workspace">
      <section className="panel playlist-list" aria-labelledby={`${formId}-list`}><h2 id={`${formId}-list`}>Your playlists</h2>
        <ul>{playlists.map(playlist => <li key={playlist.id}><button type="button" className={`secondary ${selected === playlist.id ? "selected" : ""}`}
          aria-pressed={selected === playlist.id} disabled={Boolean(mutation)} onClick={() => { setSelected(playlist.id); setDetailError(""); }}>
          <strong>{playlist.name}</strong><small>{playlist.itemCount} {playlist.itemCount === 1 ? "track" : "tracks"}</small>
        </button></li>)}</ul>
      </section>
      <section className="panel playlist-detail" aria-labelledby={`${formId}-selected`}>
        {chosen ? <>
          <div className="playlist-detail-heading"><div><span className="eyebrow">Private playlist</span><h2 id={`${formId}-selected`}>{chosen.name}</h2></div>
            <button type="button" className="secondary" disabled={Boolean(mutation)} onClick={() => setConfirmDelete(chosen.id)}>Delete playlist</button></div>
          {confirmDelete === chosen.id && <div className="notice playlist-delete-confirm"><p>Delete “{chosen.name}”? This removes the playlist and its track list. The songs themselves stay available separately.</p>
            <div className="playlist-actions"><button type="button" disabled={Boolean(mutation)} onClick={() => void removePlaylist(chosen)}>{mutation === chosen.id ? "Deleting…" : "Delete this playlist"}</button>
              <button type="button" className="secondary" disabled={Boolean(mutation)} onClick={() => setConfirmDelete(null)}>Keep playlist</button></div>
          </div>}
          {loadingTracks && <p role="status">Loading tracks…</p>}
          {detailError && <div className="notice"><p role="alert">{detailError}</p><button type="button" className="secondary" onClick={() => setDetailVersion(value => value + 1)}>Try again</button></div>}
          {details?.playlist.id === chosen.id && <PlaylistTracks key={chosen.id} items={details.items} busy={Boolean(mutation)} onRemove={item => void removeItem(item)} />}
        </> : <p>Choose a playlist to listen and manage its tracks.</p>}
      </section>
    </div>}
  </div>;
}
