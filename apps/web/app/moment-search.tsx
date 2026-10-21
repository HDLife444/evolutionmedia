"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import type { MomentMatch } from "@/utils/moment-search";
import { SongPlayer } from "./song-player";
import { AddToPlaylist } from "./add-to-playlist";

const examples = [
  { label: "A fresh start", query: "I’m starting over and need confidence." },
  { label: "Find my focus", query: "I keep getting distracted and want to stay on my path." },
  { label: "Feel connected", query: "I want to feel love and connection while staying true to myself." },
  { label: "Celebrate a win", query: "I finished something difficult and want to celebrate my achievement." },
];

export function MomentSearch({ canSave = false }: { canSave?: boolean }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"moment" | "words">("moment");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<MomentMatch[] | null>(null);
  const searching = useRef(false);

  async function find(moment: string) {
    if (searching.current || !moment.trim()) return;
    searching.current = true;
    setQuery(moment); setBusy(true); setError(""); setResults(null);
    try {
      const response = await fetch(mode === "words" ? "/api/songs/search" : "/api/moments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: moment }), cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) setError(result.error ?? "We couldn’t find matches just now. Please try again.");
      else setResults(result.songs ?? []);
    } catch { setError("We couldn’t connect. Please try again shortly."); }
    finally { searching.current = false; setBusy(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void find(query); }

  return <section id="find-music" className="panel moment-search" aria-labelledby={`${id}-heading`}>
    <span className="eyebrow">Your next chapter starts here</span>
    <h2 id={`${id}-heading`}>Find music for this moment</h2>
    <p>Find songs in the collection by describing your moment, or search for words in their titles and lyrics.</p>
    <div className="search-modes" role="group" aria-label="How to find songs">
      <button type="button" className="secondary" aria-pressed={mode === "moment"} disabled={busy} onClick={() => { setMode("moment"); setResults(null); setError(""); }}>By moment</button>
      <button type="button" className="secondary" aria-pressed={mode === "words"} disabled={busy} onClick={() => { setMode("words"); setResults(null); setError(""); }}>By title or words</button>
    </div>
    <form className="search-form" onSubmit={submit}>
      <label htmlFor={`${id}-query`}>{mode === "moment" ? "What do you need from your music today?" : "Search song titles and lyrics"}</label>
      <textarea id={`${id}-query`} name="moment" rows={3} maxLength={500} required value={query}
        onChange={event => setQuery(event.target.value)} disabled={busy}
        placeholder={mode === "moment" ? "I’m starting over and need confidence." : "Try a song title, confidence, or a fresh start"} aria-describedby={`${id}-privacy`} />
      <div className="moment-submit"><button type="submit" disabled={busy || !query.trim()}>
        {busy ? "Finding your songs…" : mode === "moment" ? "Find my music" : "Search existing songs"}
      </button><span className="moment-count">{query.length}/500</span></div>
      <p id={`${id}-privacy`} className="moment-note">Your search is used to find matches and isn’t saved to the library.</p>
    </form>
    {mode === "moment" && <div className="moment-examples" aria-label="Try an example moment">{examples.map(example =>
      <button className="secondary" type="button" key={example.label} disabled={busy} onClick={() => void find(example.query)}>{example.label}</button>
    )}</div>}
    <div aria-live="polite" aria-busy={busy}>
      {busy && <p role="status">Finding songs for your moment…</p>}
      {error && <div role="alert" className="notice"><p>{error}</p>{mode === "moment" && <button type="button" className="secondary" onClick={() => { setMode("words"); setResults(null); setError(""); }}>Try searching by title or words</button>}</div>}
      {results !== null && <div className="moment-results">
        <h3>{results.length ? mode === "moment" ? "Songs for your moment" : "Songs matching your words" : "A new chapter for the collection"}</h3>
        <p>{results.length ? "Try a song and see how it feels. These are songs from our growing collection."
          : mode === "moment" ? "We don’t have a close match in this small collection yet. Try describing your moment another way." : "No songs contain all those words yet. Try fewer words or another title."}</p>
        {results.length > 0 && <ul className="catalog">{results.map(song => <li className="panel" key={song.id}>
          <span className="eyebrow">Collective</span><h3>{song.title}</h3>
          {song.description && <p>{song.description}</p>}
          {song.focus && <p className="moment-focus"><strong>Song’s focus:</strong> {song.focus}</p>}
          <SongPlayer songId={song.id} title={song.title} />
          {canSave && <AddToPlaylist source="catalog" trackId={song.id} title={song.title} />}
        </li>)}</ul>}
      </div>}
    </div>
  </section>;
}
