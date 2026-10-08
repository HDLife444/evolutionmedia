"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { detectAudioMime, MAX_AUDIO_BYTES, statusLabels, type SongSubmission, type UploadJob } from "@/utils/ingestion";
import { beginUpload, finishUpload } from "./actions";

const storageKey = "evolution-media-pending-upload";
function rememberUpload(songId: string | null) {
  try {
    if (songId) sessionStorage.setItem(storageKey, songId);
    else sessionStorage.removeItem(storageKey);
  } catch { /* The database queue still supports resuming without browser storage. */ }
}

export function UploadPortal({ jobs }: { jobs: UploadJob[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<UploadJob | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [visibility, setVisibility] = useState("collective");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const id = useRef<string | null>(null);

  useEffect(() => {
    let saved: string | null = null;
    try { saved = sessionStorage.getItem(storageKey); } catch { /* Optional browser persistence. */ }
    const match = jobs.find(job => job.song_id === saved && job.status === "awaiting_upload");
    if (match) setPending(match);
    else rememberUpload(null);
  }, [jobs]);

  function resume(job: UploadJob) {
    setPending(job); setFile(null); setError(""); setMessage("");
    rememberUpload(job.song_id);
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true); setError(""); setMessage("Checking audio…");
    try {
      if (!file || !file.size || file.size > MAX_AUDIO_BYTES) throw new Error("Choose an MP3, WAV, or FLAC file up to 50 MB.");
      const buffer = await file.arrayBuffer();
      const mime = detectAudioMime(new Uint8Array(buffer));
      if (!mime) throw new Error("The file doesn’t appear to be an MP3, WAV, or FLAC audio file.");
      const digest = await crypto.subtle.digest("SHA-256", buffer);
      const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      let job = pending;
      if (job && (job.sha256 !== sha256 || job.file_size !== file.size || job.mime_type !== mime)) {
        throw new Error("Select the same audio file used for this pending upload.");
      }
      if (!job) {
        id.current ??= crypto.randomUUID();
        const text = (name: string) => String(values.get(name) ?? "").trim();
        const tags = (name: string) => text(name).split(",").map(tag => tag.trim()).filter(Boolean);
        const submission: SongSubmission = {
          song_id: id.current, title: text("title"), description: text("description"), lyrics: text("lyrics"),
          development_goal: text("development_goal"), emotional_progression: text("emotional_progression"),
          origin_provider: text("origin_provider"), provenance: text("provenance"), genre: tags("genre"), mood: tags("mood"),
          visibility: visibility as SongSubmission["visibility"], rights_confirmed: values.has("rights_confirmed"),
          collective_consent: values.has("collective_consent"), reuse_allowed: values.has("reuse_allowed"),
          file_size: file.size, mime_type: mime, sha256,
        };
        setMessage("Registering song…");
        const result = await beginUpload(submission);
        if (!result.job) throw new Error(result.error ?? "Couldn’t register this song.");
        job = result.job; setPending(job);
        rememberUpload(job.song_id);
      }
      if (job.status === "awaiting_upload") {
        setMessage("Uploading audio… Keep this page open.");
        const supabase = createClient();
        const { error: uploadError } = await supabase.storage.from("song-assets").upload(job.storage_path, file, {
          contentType: mime, upsert: false,
        });
        // An interrupted response may have left the immutable object in place.
        // The completion RPC verifies its manifest before accepting it.
        if (uploadError && !["409", "Duplicate"].includes(String(uploadError.statusCode ?? uploadError.name))) {
          throw new Error("The audio upload failed. Use Resume with the same file to retry.");
        }
      }
      setMessage("Confirming upload…");
      const result = await finishUpload(job.song_id);
      if (!result.job) throw new Error(result.error ?? "Couldn’t confirm this upload.");
      rememberUpload(null);
      setPending(null); setFile(null); id.current = null; form.reset(); setVisibility("collective");
      setMessage("Song uploaded. It is awaiting indexing and is not searchable yet.");
      router.refresh();
    } catch (reason) {
      setMessage(""); setError(reason instanceof Error ? reason.message : "Upload failed. Please try again.");
    } finally { setBusy(false); }
  }

  return <>
    <section className="panel">
      <h2>{pending ? `Resume: ${pending.title}` : "Upload a foundational song"}</h2>
      <p>Audio stays in private storage. Provenance stays with your administrator record. Indexing will begin after the embedding worker is configured.</p>
      {message && <p role="status" className="notice">{message}</p>}
      {error && <p role="alert" className="notice">{error}</p>}
      <form onSubmit={upload} className="upload-form">
        <fieldset disabled={busy}>
          <label htmlFor="audio">Audio file · MP3, WAV, or FLAC · maximum 50 MB</label>
          <input key={pending?.song_id ?? "new"} id="audio" type="file" accept=".mp3,.wav,.flac" required onChange={e => setFile(e.target.files?.[0] ?? null)} />
          {!pending && <>
            <label htmlFor="title">Song title</label><input id="title" name="title" maxLength={200} required />
            <label htmlFor="description">Description</label><textarea id="description" name="description" maxLength={5000} rows={3} />
            <label htmlFor="lyrics">Lyrics</label><textarea id="lyrics" name="lyrics" maxLength={50000} rows={8} />
            <label htmlFor="development_goal">Personal development goal</label><textarea id="development_goal" name="development_goal" maxLength={1000} rows={2} required />
            <label htmlFor="emotional_progression">Emotional progression</label><input id="emotional_progression" name="emotional_progression" placeholder="Uncertainty → recognition → confidence" maxLength={1000} required />
            <div className="form-grid"><div><label htmlFor="genre">Genres · separate with commas</label><input id="genre" name="genre" /></div>
              <div><label htmlFor="mood">Moods · separate with commas</label><input id="mood" name="mood" /></div></div>
            <label htmlFor="origin_provider">Origin or generation provider</label><input id="origin_provider" name="origin_provider" placeholder="Suno, original recording, or another provider" maxLength={100} required />
            <label htmlFor="provenance">Provenance and rights evidence · administrator-only</label><textarea id="provenance" name="provenance" placeholder="Creator, source, creation date, and the permission or license covering this song." maxLength={2000} rows={4} required />
            <label htmlFor="visibility">Library visibility</label><select id="visibility" value={visibility} onChange={e => setVisibility(e.target.value)}>
              <option value="collective">Collective library</option><option value="private">Private library</option></select>
            <p>Collective songs share their lyrics, descriptions, goals, and metadata with signed-in users. Remove personal information before sharing. Private songs remain limited to their owner.</p>
            <label className="check"><input name="rights_confirmed" type="checkbox" required />I confirm I have permission to upload and store this song and its lyrics.</label>
            {visibility === "collective" && <label className="check"><input name="collective_consent" type="checkbox" required />I approve sharing the song’s lyrics and musical context in the collective library.</label>}
            <label className="check"><input name="reuse_allowed" type="checkbox" />I also authorize this song’s content as context for future compositions.</label>
            <p>Model training is not authorized by this upload. Industry Integration remains a separate future workflow.</p>
          </>}
          <button type="submit">{busy ? "Working…" : pending ? "Resume upload" : "Upload song"}</button>
        </fieldset>
      </form>
      {pending && !busy && <button className="secondary" type="button" onClick={() => {
        rememberUpload(null); setPending(null); setFile(null); id.current = null; setError("");
      }}>Start another song · keep this upload pending</button>}
    </section>
    <section className="queue"><h2>Ingestion queue</h2>
      {!jobs.length ? <p>Your first upload will appear here.</p> : <ul className="catalog">{jobs.map(job => <li key={job.song_id} className="panel">
        <span className="eyebrow">{statusLabels[job.status]}</span><h3>{job.title}</h3>
        {job.status === "awaiting_upload" && <button type="button" className="secondary" disabled={busy} onClick={() => resume(job)}>Resume this upload</button>}
      </li>)}</ul>}
    </section>
  </>;
}
