"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { SongSubmission } from "@/utils/ingestion";
import { saveSong } from "./actions";

export function SongEditor({ submission, updatedAt }: { submission: SongSubmission; updatedAt: string }) {
  const router = useRouter();
  const [visibility, setVisibility] = useState(submission.visibility);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const fields = [
    ["title", "Song title", 200, true], ["description", "Description", 5000, false],
    ["lyrics", "Lyrics", 50000, false], ["development_goal", "Personal development goal", 1000, true],
    ["emotional_progression", "Emotional progression", 1000, true],
    ["origin_provider", "Origin or generation provider", 100, true],
    ["provenance", "Provenance and rights evidence · administrator-only", 2000, true],
  ] as const;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const values = new FormData(event.currentTarget);
    const changes = Object.fromEntries(fields.map(([name]) => [name, String(values.get(name) ?? "").trim()]));
    const tags = (name: string) => String(values.get(name) ?? "").split(",").map(x => x.trim()).filter(Boolean);
    setBusy(true); setMessage("");
    try {
      const result = await saveSong({ ...submission, ...changes, visibility,
        genre: tags("genre"), mood: tags("mood"), rights_confirmed: values.has("rights_confirmed"),
        collective_consent: values.has("collective_consent"), reuse_allowed: values.has("reuse_allowed"),
      }, updatedAt);
      if (result.error) setMessage(result.error);
      else { router.push("/admin?notice=song-saved"); router.refresh(); }
    } catch { setMessage("Couldn’t save. Please try again."); }
    finally { setBusy(false); }
  }
  return <section className="panel"><h2>Song details</h2><p>The existing audio recording is retained.</p>
    {message && <p role="alert" className="notice">{message}</p>}
    <form className="upload-form" onSubmit={save}><fieldset disabled={busy}>
      {fields.map(([name, label, maxLength, required]) => <div key={name}>
        <label htmlFor={name}>{label}</label><textarea id={name} name={name} defaultValue={submission[name]}
          maxLength={maxLength} required={required} rows={name === "lyrics" ? 8 : 2} />
      </div>)}
      <label htmlFor="genre">Genres · separate with commas</label><input id="genre" name="genre" defaultValue={submission.genre.join(", ")} />
      <label htmlFor="mood">Moods · separate with commas</label><input id="mood" name="mood" defaultValue={submission.mood.join(", ")} />
      <label htmlFor="visibility">Library visibility</label><select id="visibility" value={visibility} onChange={e => setVisibility(e.target.value as SongSubmission["visibility"])}>
        <option value="collective">Collective library</option><option value="private">Private library</option></select>
      <p>Collective songs, their lyrics and context, and their audio are public. Private songs are available to their owner.</p>
      <label className="check"><input name="rights_confirmed" type="checkbox" required defaultChecked={submission.rights_confirmed} />I confirm permission to store and share this song according to the selected visibility.</label>
      {visibility === "collective" && <label className="check"><input name="collective_consent" type="checkbox" required defaultChecked={submission.collective_consent} />I approve publishing this song and its musical context in the public collective library.</label>}
      <label className="check"><input name="reuse_allowed" type="checkbox" defaultChecked={submission.reuse_allowed} />I authorize its content as context for future compositions.</label>
      <button type="submit">{busy ? "Saving…" : "Save changes"}</button>
    </fieldset></form>
  </section>;
}
