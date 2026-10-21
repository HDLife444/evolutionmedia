import assert from "node:assert/strict";
import { test } from "node:test";
import { playlistItem, playlistName, playlistSetupMissing, playlistSummary, playlistTrack } from "../utils/playlists";

const id = "abca1234-1234-4234-a123-123456789abc";
const trackId = "bbca1234-1234-4234-a123-123456789abc";
test("playlist input cannot supply another owner, table identity, or filesystem path", () => {
  assert.equal(playlistName({ name: " My next chapter " }), "My next chapter");
  assert.equal(playlistName({ name: "My next chapter", owner_id: id }), null);
  assert.equal(playlistName({ name: "a".repeat(81) }), null);
  assert.equal(playlistName({ name: "  " }), null);
  assert.deepEqual(playlistTrack({ source: "generated", trackId, title: " A new start " }), { source: "generated", trackId, title: "A new start" });
  for (const change of [{ owner_id: id }, { trackId: "../private/audio.mp3" }, { path: "/private/audio.mp3" }, { source: "other" }, { title: "a".repeat(161) }]) {
    assert.equal(playlistTrack({ source: "generated", trackId, title: "A new start", ...change }), null);
  }
});

test("playlist presentation includes only safe track references and public display fields", () => {
  const item = playlistItem({ id, source: "generated", generation_id: trackId, title: "A new start", created_at: "2026-10-21T00:00:00Z", owner_id: "PRIVATE_OWNER", path: "/private/audio", key: "PRIVATE_KEY" });
  assert.deepEqual(Object.keys(item).sort(), ["addedAt", "id", "source", "title", "trackId"]);
  assert.ok(!JSON.stringify(item).includes("PRIVATE_") && !JSON.stringify(item).includes("/private"));
  assert.throws(() => playlistItem({ id, source: "generated", generation_id: "../private", title: "Test", created_at: "now" }));
  const summary = playlistSummary({ id, name: "Next chapter", created_at: "now", updated_at: "now", playlist_items: [{ count: 3 }], owner_id: "PRIVATE_OWNER" });
  assert.equal(summary.itemCount, 3);
  assert.ok(!JSON.stringify(summary).includes("PRIVATE_"));
});

test("missing setup is distinct from authorization and unrelated database failures", () => {
  assert.ok(playlistSetupMissing({ code: "42P01" }));
  assert.ok(playlistSetupMissing({ code: "PGRST205" }));
  assert.equal(playlistSetupMissing({ code: "42501" }), false);
  assert.equal(playlistSetupMissing({ code: "08006" }), false);
});
