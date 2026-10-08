import assert from "node:assert/strict";
import { test } from "node:test";
import { detectAudioMime, MAX_AUDIO_BYTES, validateSubmission, type SongSubmission } from "../utils/ingestion";

const valid: SongSubmission = {
  song_id: "20000000-0000-0000-0000-000000000001", title: "Voice", description: "Confidence",
  lyrics: "Find my voice", development_goal: "Speak with confidence", emotional_progression: "Fear to confidence",
  origin_provider: "Original", provenance: "Owned test fixture", genre: ["anthem"], mood: ["uplifting"],
  visibility: "collective", rights_confirmed: true, collective_consent: true, reuse_allowed: false,
  file_size: 100, mime_type: "audio/mpeg", sha256: "a".repeat(64),
};
test("collective submissions require both rights and sharing consent", () => {
  assert.equal(validateSubmission(valid), true);
  assert.equal(validateSubmission({ ...valid, rights_confirmed: false }), false);
  assert.equal(validateSubmission({ ...valid, collective_consent: false }), false);
  assert.equal(validateSubmission({ ...valid, visibility: "private", collective_consent: false }), true);
});
test("malformed and oversized manifests are rejected", () => {
  for (const override of [{ file_size: MAX_AUDIO_BYTES + 1 }, { mime_type: "text/plain" },
    { sha256: "bad" }, { genre: "anthem" }, { provenance: "" }, { development_goal: "" }, { song_id: "bad" }]) {
    assert.equal(validateSubmission({ ...valid, ...override }), false);
  }
});
test("audio identification uses signatures rather than trusting an extension", () => {
  const bytes = (text: string) => new TextEncoder().encode(text);
  assert.equal(detectAudioMime(bytes("RIFF1234WAVE")), "audio/wav");
  assert.equal(detectAudioMime(bytes("fLaC1234")), "audio/flac");
  assert.equal(detectAudioMime(bytes("ID3recording")), "audio/mpeg");
  assert.equal(detectAudioMime(bytes("this is not audio")), null);
});
