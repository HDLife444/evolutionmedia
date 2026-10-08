"use client";
import { SongPlayer } from "../song-player";
import { useState, type FormEvent } from "react";
import { searchSongs, type SongMatch } from "./indexing-actions";

export function TextSearch() {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<SongMatch[] | null>(null);
  const [error, setError] = useState("");
  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const query = String(new FormData(event.currentTarget).get("query") ?? "");
    setBusy(true); setError(""); setResults(null);
    try {
      const response = await searchSongs(query);
      if (response.error) setError(response.error);
      else setResults(response.songs ?? []);
    } catch { setError("Search failed. Please try again."); }
    finally { setBusy(false); }
  }
  return <section className="panel queue"><h2>Search by meaning</h2>
    <p>Find indexed songs through their lyrics and personal development context. This search does not analyze the sound of the audio.</p>
    <form onSubmit={search} className="search-form">
      <label htmlFor="query">What experience are you looking for?</label>
      <input id="query" name="query" maxLength={1000} required placeholder="Confidence in public speaking" />
      <button disabled={busy} type="submit">{busy ? "Searching…" : "Search songs"}</button>
    </form>
    {error && <p role="alert" className="notice">{error}</p>}
    {results !== null && <div aria-live="polite">{!results.length ? <p>No indexed songs are available for your search yet.</p>
      : <ul className="catalog">{results.map(song => <li className="panel" key={song.id}>
        <span className="eyebrow">{song.visibility}</span><h3>{song.title}</h3>
        {song.description && <p>{song.description}</p>}
        <SongPlayer songId={song.id} title={song.title} />
      </li>)}</ul>}</div>}
  </section>;
}
