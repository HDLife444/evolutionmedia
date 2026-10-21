"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { AddToPlaylist } from "./add-to-playlist";
import { notifyPlaylistsChanged } from "@/utils/playlist-events";
import { TRACK_DURATION_SECONDS } from "@/utils/generation";

type TrackKind = "vocal" | "instrumental" | "soundscape";
type TrackStatus = "queued" | "running" | "completed" | "failed";
type GenerationRequest = { id: string; moment: string; genre: string; kind: TrackKind; duration: number };
type GenerationJob = GenerationRequest & {
  status: TrackStatus; created_at: string; progress?: string; error?: string;
};
type Availability = { ready: boolean; message?: string; jobs?: GenerationJob[]; canDelete?: boolean };
const genres = [
  ["soul", "Soul"], ["gospel", "Gospel"], ["rnb", "R&B"], ["pop", "Pop"],
  ["jazz", "Jazz"], ["ambient", "Ambient"], ["cinematic", "Cinematic"],
  ["electronic", "Electronic"], ["rock", "Rock"], ["hip-hop", "Hip-Hop"],
  ["classical", "Classical"], ["country", "Country"],
] as const;
const kinds: { value: TrackKind; label: string; detail: string }[] = [
  { value: "vocal", label: "Song with vocals", detail: "Original words and music" },
  { value: "instrumental", label: "Instrumental", detail: "Let the music speak" },
  { value: "soundscape", label: "Soundscape", detail: "An atmosphere for your moment" },
];
const labels: Record<TrackStatus, string> = { queued: "In the queue", running: "Creating your track", completed: "Ready to listen", failed: "Generation interrupted" };
const active = (job: GenerationJob) => job.status === "queued" || job.status === "running";
const rememberedTrack = "evolution-media-generator-track";

function rememberTrack(id: string) {
  try { sessionStorage.setItem(rememberedTrack, id); } catch { /* Optional browser persistence. */ }
}
function isJob(value: unknown): value is GenerationJob {
  if (!value || typeof value !== "object") return false;
  const job = value as Partial<GenerationJob>;
  return typeof job.id === "string" && /^[0-9a-f-]{36}$/i.test(job.id)
    && typeof job.status === "string" && job.status in labels
    && typeof job.moment === "string" && typeof job.genre === "string"
    && typeof job.kind === "string" && kinds.some(kind => kind.value === job.kind)
    && typeof job.duration === "number";
}
class StudioRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new StudioRequestError(result?.error ?? "The generator connection is unavailable. Please try again.", response.status);
  if (!result) throw new Error("The generator returned an incomplete response. Please check its connection.");
  return result as T;
}

export function GenerationStudio() {
  const formId = useId();
  const [moment, setMoment] = useState("");
  const [genre, setGenre] = useState("soul");
  const [kind, setKind] = useState<TrackKind>("instrumental");
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [selected, setSelected] = useState<GenerationJob | null>(null);
  const [pending, setPending] = useState<GenerationRequest | null>(null);
  const [error, setError] = useState("");
  const [pollError, setPollError] = useState("");
  const [pollVersion, setPollVersion] = useState(0);
  const [audioError, setAudioError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteMessage, setDeleteMessage] = useState("");
  const deleteLock = useRef(false);
  const deletedIds = useRef(new Set<string>());
  const submitLock = useRef(false);
  const audio = useRef<HTMLAudioElement>(null);

  const recordJob = useCallback((job: GenerationJob) => {
    if (deletedIds.current.has(job.id)) return;
    setJobs(previous => [job, ...previous.filter(item => item.id !== job.id)].slice(0, 20));
    setSelected(previous => previous?.id === job.id ? job : previous);
  }, []);
  const updateJob = useCallback((job: GenerationJob) => {
    recordJob(job); setSelected(job); rememberTrack(job.id);
  }, [recordJob]);

  const checkConnection = useCallback(async (signal?: AbortSignal) => {
    setChecking(true);
    try {
      const result = await requestJson<Availability>("/api/generation", { signal });
      if (signal?.aborted) return;
      setAvailability(result);
      const incoming = (result.jobs ?? []).filter(isJob).filter(job => !deletedIds.current.has(job.id));
      setJobs(incoming);
      let remembered: string | null = null;
      try { remembered = sessionStorage.getItem(rememberedTrack); } catch { /* Optional browser persistence. */ }
      setSelected(previous => {
        if (previous) return incoming.find(job => job.id === previous.id) ?? previous;
        return incoming.find(job => job.id === remembered) ?? incoming.find(active) ?? incoming[0] ?? null;
      });
    } catch (reason) {
      if (signal?.aborted) return;
      setAvailability({ ready: false, message: reason instanceof Error ? reason.message : "We couldn’t reach your generator. Please check the connection." });
    } finally { if (!signal?.aborted) setChecking(false); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void checkConnection(controller.signal);
    return () => controller.abort();
  }, [checkConnection]);

  const pollingJob = selected && active(selected) ? selected : jobs.find(active);
  useEffect(() => {
    if (!pollingJob) return;
    const id = pollingJob.id;
    const controller = new AbortController();
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    setPollError("");
    async function poll() {
      if (Date.now() - started > 20 * 60_000) {
        setPollError("This track is taking longer than expected. Check its status before starting another generation.");
        return;
      }
      try {
        const result = await requestJson<{ job: GenerationJob }>(`/api/generation/${id}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (!isJob(result.job)) throw new Error("The track status could not be read. Please check again.");
        recordJob(result.job); setPollError(""); failures = 0;
        if (!active(result.job)) return;
      } catch (reason) {
        if (controller.signal.aborted) return;
        failures++;
        setPollError(reason instanceof Error ? reason.message : "The connection was interrupted. Your track may still be running.");
        if (reason instanceof StudioRequestError && [401, 403, 404].includes(reason.status)) return;
        if (failures >= 5) return;
      }
      timer = setTimeout(poll, Math.min(15_000, 2500 * (failures + 1)));
    }
    timer = setTimeout(poll, 1500);
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [pollingJob?.id, pollingJob?.status, pollVersion, recordJob]);

  useEffect(() => { setAudioError(""); }, [selected?.id]);
  useEffect(() => {
    if (pending && jobs.some(job => job.id === pending.id)) { setPending(null); setError(""); }
  }, [jobs, pending]);

  async function submit(request: GenerationRequest) {
    if (submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true); setError(""); setPending(request); rememberTrack(request.id);
    try {
      const result = await requestJson<{ job: GenerationJob }>("/api/generation", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request),
      });
      if (!isJob(result.job)) throw new Error("The submission response was incomplete. Retry this same request to check it safely.");
      updateJob(result.job); setPending(null); setPollError(""); setPollVersion(version => version + 1);
    } catch (reason) {
      // Definitive input/auth rejections did not enqueue a track; allow editing.
      if (reason instanceof StudioRequestError && [400, 401, 403, 409, 422, 429].includes(reason.status)) setPending(null);
      setError(reason instanceof Error ? reason.message : "The connection was interrupted. Retry this same request to check whether it was accepted.");
    } finally { submitLock.current = false; setSubmitting(false); }
  }
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!moment.trim() || pending) return;
    void submit({ id: crypto.randomUUID(), moment: moment.trim(), genre, kind, duration: TRACK_DURATION_SECONDS });
  }

  async function deleteTrack(job: GenerationJob) {
    if (deleteLock.current || active(job)) return;
    if (!window.confirm("Permanently delete this generated track and remove it from your playlists? Download it first if you want to keep a copy.")) return;
    deleteLock.current = true;
    setDeleting(job.id); setDeleteMessage("");
    try {
      const result = await requestJson<{ deleted: boolean; playlistsUpdated: boolean }>(`/api/generation/${job.id}`, { method: "DELETE" });
      if (result.deleted !== true) throw new Error("The server did not confirm deletion. Please try again.");
      deletedIds.current.add(job.id);
      if (selected?.id === job.id) audio.current?.pause();
      setJobs(previous => previous.filter(item => item.id !== job.id));
      setSelected(previous => previous?.id === job.id ? null : previous);
      try { if (sessionStorage.getItem(rememberedTrack) === job.id) sessionStorage.removeItem(rememberedTrack); } catch { /* Optional browser persistence. */ }
      setDeleteMessage(result.playlistsUpdated ? "Track deleted." : "Track deleted. If it still appears in a playlist, remove that playlist entry.");
      notifyPlaylistsChanged();
    } catch (reason) {
      setDeleteMessage(reason instanceof Error ? reason.message : "The track could not be deleted. Please try again.");
    } finally { deleteLock.current = false; setDeleting(null); }
  }

  const hasActive = jobs.some(active);
  const formDisabled = submitting || Boolean(pending) || hasActive || Boolean(deleting);
  const genreName = (value: string) => genres.find(([id]) => id === value)?.[1] ?? value;
  const kindName = (value: TrackKind) => kinds.find(item => item.value === value)?.label ?? value;

  return <div className="generation-studio">
    <section className="panel generation-form-panel" aria-labelledby={`${formId}-heading`}>
      <div className="generation-panel-heading"><h2 id={`${formId}-heading`}>Create music for this moment</h2>
        <span className={`generation-connection ${availability?.ready ? "connected" : ""}`} role="status">
          {checking ? "Checking connection…" : availability?.ready ? "Generator connected" : "Generator not connected"}
        </span>
      </div>
      {availability && !availability.ready && <div className="notice generation-setup">
        <p>{availability.message ?? "Connect your generation server to begin creating tracks from the site."}</p>
        <div className="generation-actions"><Link href="/generate/connect">Music server setup</Link>
          <button type="button" className="secondary" disabled={checking} onClick={() => void checkConnection()}>Check connection</button></div>
      </div>}
      <form className="upload-form" onSubmit={create}>
        <fieldset disabled={formDisabled}>
          <label htmlFor={`${formId}-moment`}>What future state or feeling do you want to move toward?</label>
          <textarea id={`${formId}-moment`} name="moment" maxLength={500} rows={4} required value={moment}
            placeholder="I’m beginning a new chapter. I want to feel confident, grounded, and ready to move forward."
            onChange={event => setMoment(event.target.value)} aria-describedby={`${formId}-privacy`} />
          <span className="generation-counter">{moment.length}/500</span>
          <fieldset className="generation-kind"><legend>Your sound</legend><div className="generation-kind-options">
            {kinds.map(option => <label className={`generation-kind-card ${kind === option.value ? "selected" : ""}`} key={option.value}>
              <input type="radio" name="kind" value={option.value} checked={kind === option.value} onChange={() => setKind(option.value)} />
              <span><strong>{option.label}</strong><small>{option.detail}</small></span>
            </label>)}
          </div></fieldset>
          <div className="form-grid"><div><label htmlFor={`${formId}-genre`}>Genre</label>
            <select id={`${formId}-genre`} value={genre} onChange={event => setGenre(event.target.value)}>
              {genres.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
            </select></div>
          </div>
          <p className="generation-note">Every new recording is a full-length four-minute composition, with space for phrasing, development, and emotional context.</p>
          <p className="generation-note" id={`${formId}-privacy`}>This administrator preview creates one track at a time. Your request and generated audio stay private to your account.</p>
          <button className="generation-create" type="submit" disabled={!availability?.ready || !moment.trim()}>
            {submitting ? "Submitting your moment…" : hasActive ? "A track is being created…" : "Generate my track"}
          </button>
        </fieldset>
      </form>
      {error && <p role="alert" className="notice">{error}</p>}
      {pending && !submitting && <div className="generation-retry"><p>The request may already have reached the generator. This retry uses the same request and won’t intentionally create a second track.</p>
        <button type="button" className="secondary" onClick={() => void submit(pending)}>Retry this same request</button></div>}
    </section>

    {deleteMessage && <p role="status" className="notice">{deleteMessage}</p>}
    {selected && <section className="panel generation-result" aria-labelledby={`${formId}-result`}>
      <div className="generation-panel-heading"><span className="eyebrow">Created for your moment</span>
        <span className={`generation-job-status status-${selected.status}`}>{labels[selected.status]}</span></div>
      <h2 id={`${formId}-result`}>{kindName(selected.kind)} · {genreName(selected.genre)}</h2>
      <p className="generation-moment">“{selected.moment}”</p>
      <p className="generation-track-meta">Requested length: {selected.duration} seconds · Private</p>
      <div aria-live="polite" aria-busy={active(selected)}>
        {active(selected) && <><p role="status">{selected.progress || (selected.status === "queued" ? "Your request is waiting for the generator." : "Your music is taking shape. You can leave this page open while the track is created.")}</p>
          <div className="generation-working" aria-hidden="true"><span /><span /><span /></div></>}
        {selected.status === "failed" && <p role="alert" className="notice">{selected.error || "The generator couldn’t finish this track. You can submit a new request when the connection is ready."}</p>}
        {pollError && <p role="alert" className="notice">{pollError}</p>}
      </div>
      {active(selected) && pollError && <button type="button" className="secondary" onClick={() => setPollVersion(version => version + 1)}>Check track status</button>}
      {selected.status === "completed" && <div className="generation-playback">
        <p>Your track is ready. Press Play and hear how it feels.</p>
        <audio key={selected.id} ref={audio} controls preload="none" aria-label="Your generated track"
          src={`/api/generation/${selected.id}/audio`} onError={() => setAudioError("The audio couldn’t load. Refresh the page to reconnect, then try Play again.")}
          onPlay={() => document.querySelectorAll("audio").forEach(other => { if (other !== audio.current) other.pause(); })} />
        <a className="generation-download" href={`/api/generation/${selected.id}/audio?download=1`} download={`evolution-media-${selected.id}.mp3`}>Download your track</a>
        <AddToPlaylist source="generated" trackId={selected.id} title={`${kindName(selected.kind)} · ${genreName(selected.genre)} — ${selected.moment}`.slice(0, 160)} />
        {audioError && <p role="alert" className="notice">{audioError}</p>}
      </div>}
      {!active(selected) && <div className="generation-actions generation-delete-actions">
        <button type="button" className="secondary danger-action" disabled={Boolean(deleting) || !availability?.canDelete} onClick={() => void deleteTrack(selected)}>
          {deleting === selected.id ? "Deleting track…" : "Delete track"}
        </button>
        {!availability?.canDelete && <p>Your music server needs the latest update to enable deletion. <a href="https://github.com/HDLife444/evolutionmedia-generator/blob/main/docs/permanent-server.md" target="_blank" rel="noreferrer">Update instructions</a></p>}
      </div>}
    </section>}

    {jobs.length > 0 && <section className="generation-history" aria-labelledby={`${formId}-history`}><h2 id={`${formId}-history`}>Your recent creations</h2>
      <ul>{jobs.map(job => <li key={job.id}><button type="button" className={`secondary generation-history-item ${selected?.id === job.id ? "selected" : ""}`}
        disabled={Boolean(deleting)} aria-pressed={selected?.id === job.id} onClick={() => { updateJob(job); setPollError(""); }}>
        <span><strong>{kindName(job.kind)} · {genreName(job.genre)}</strong><small>{job.moment}</small></span>
        <span className="generation-history-status">{labels[job.status]}</span>
      </button>{!active(job) && <button type="button" className="secondary danger-action generation-history-delete" disabled={Boolean(deleting) || !availability?.canDelete}
        onClick={() => void deleteTrack(job)} aria-label={`Delete ${kindName(job.kind)}: ${job.moment}`}>
        {deleting === job.id ? "Deleting…" : "Delete"}
      </button>}</li>)}</ul>
    </section>}
  </div>;
}
