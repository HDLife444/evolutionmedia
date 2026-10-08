export const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type IngestionStatus = "awaiting_upload" | "queued" | "processing" | "searchable" | "failed";
export type UploadJob = {
  song_id: string;
  status: IngestionStatus;
  storage_path: string;
  file_size: number;
  mime_type: string;
  sha256: string;
  title: string;
};
export type SongSubmission = {
  song_id: string; title: string; description: string; lyrics: string;
  development_goal: string; emotional_progression: string; origin_provider: string;
  provenance: string; genre: string[]; mood: string[];
  visibility: "collective" | "private";
  rights_confirmed: boolean; collective_consent: boolean; reuse_allowed: boolean;
  file_size: number; mime_type: string; sha256: string;
};

export const statusLabels: Record<IngestionStatus, string> = {
  awaiting_upload: "Upload pending",
  queued: "Awaiting indexing",
  processing: "Processing",
  searchable: "Searchable",
  failed: "Indexing failed",
};

export function validateSubmission(input: unknown): input is SongSubmission {
  if (!input || typeof input !== "object") return false;
  const v = input as Record<string, unknown>;
  const fields: Record<string, [number, number]> = {
    title: [1, 200], description: [0, 5000], lyrics: [0, 50000],
    development_goal: [1, 1000], emotional_progression: [1, 1000],
    origin_provider: [1, 100], provenance: [1, 2000],
  };
  for (const [name, [min, max]] of Object.entries(fields)) {
    if (typeof v[name] !== "string" || v[name].trim().length < min || v[name].length > max) return false;
  }
  for (const name of ["genre", "mood"]) {
    if (!Array.isArray(v[name]) || v[name].length > 10 || v[name].some(x => typeof x !== "string" || !x.trim() || x.length > 80)) return false;
  }
  return typeof v.song_id === "string" && UUID_PATTERN.test(v.song_id)
    && typeof v.file_size === "number" && Number.isInteger(v.file_size)
    && v.file_size > 0 && v.file_size <= MAX_AUDIO_BYTES
    && ["audio/mpeg", "audio/wav", "audio/flac"].includes(String(v.mime_type))
    && typeof v.sha256 === "string" && /^[a-f0-9]{64}$/.test(v.sha256)
    && v.rights_confirmed === true
    && (v.visibility === "private" || (v.visibility === "collective" && v.collective_consent === true))
    && typeof v.collective_consent === "boolean" && typeof v.reuse_allowed === "boolean";
}

export function detectAudioMime(bytes: Uint8Array): string | null {
  const prefix = String.fromCharCode(...bytes.slice(0, 12));
  if (prefix.startsWith("RIFF") && prefix.slice(8, 12) === "WAVE") return "audio/wav";
  if (prefix.startsWith("fLaC")) return "audio/flac";
  if (prefix.startsWith("ID3") || (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  return null;
}
