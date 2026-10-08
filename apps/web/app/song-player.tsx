"use client";

import { useRef, useState } from "react";

export function SongPlayer({ songId, title }: { songId: string; title: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  async function play() {
    if (!audio.current || busy) return;
    if (playing) { audio.current.pause(); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/songs/${songId}/audio`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Audio is unavailable.");
      const position = audio.current.currentTime;
      audio.current.src = result.url;
      audio.current.currentTime = position;
      await audio.current.play();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Playback could not start."); }
    finally { setBusy(false); }
  }
  return <div className="song-player">
    <button type="button" disabled={busy} onClick={play} aria-label={`${playing ? "Pause" : "Play"} ${title}`}>
      {busy ? "Loading…" : playing ? "Pause" : "▶ Play"}
    </button>
    <audio ref={audio} controls preload="none" aria-label={`Audio player for ${title}`}
      onPlay={() => {
        document.querySelectorAll("audio").forEach(other => { if (other !== audio.current) other.pause(); });
        setPlaying(true);
      }} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
      onError={() => { setPlaying(false); setError("Audio could not load. Select Play to retry. Your browser may not support this format."); }} />
    {error && <p role="alert">{error}</p>}
  </div>;
}
