import assert from "node:assert/strict";
import { test } from "node:test";
import { createMomentSearcher, cosine, publicDocuments, rankMoments, validateMoment, type PublicSong } from "../utils/moment-search";
import { createMomentLimits } from "../utils/moment-limits";

const song = (id: string, visibility = "collective"): PublicSong => ({
  id, title: `Song ${id}`, description: "Meaning", lyrics: "Lyrics", visibility,
  genre: ["Soul"], mood: ["Hopeful"], metadata: { development_goal: "Confidence", emotional_progression: "Fear to confidence" },
});
const vector = (axis = 0) => { const v = Array(1536).fill(0); v[axis] = 1; return v; };

test("moment input is nonempty text, Unicode bounded, and never coerced", () => {
  for (const value of [null, {}, [], 3, "", "   ", "x".repeat(501)]) assert.equal(validateMoment(value), false);
  assert.ok(validateMoment("I’m starting over and need confidence."));
  assert.ok(validateMoment("🎵".repeat(500)));
});

test("public documents exclude private songs and arbitrary metadata/provenance", () => {
  const publicSong = song("public");
  publicSong.metadata = { ...publicSong.metadata, provenance: "SECRET EVIDENCE", account: "PRIVATE PROFILE" } as PublicSong["metadata"];
  const docs = publicDocuments([publicSong, song("PRIVATE SONG", "private")]);
  assert.ok(docs.length > 0 && docs.every(doc => doc.songId === "public"));
  const text = JSON.stringify(docs);
  assert.ok(!text.includes("SECRET EVIDENCE") && !text.includes("PRIVATE PROFILE") && !text.includes("PRIVATE SONG"));
});

test("ranking uses intended development context, deduplicates songs, and suppresses unrelated vectors", () => {
  const songs = [song("confidence"), song("other"), song("private", "private")];
  const docs = publicDocuments(songs);
  const vectors = docs.map(doc => doc.songId === "confidence" ? vector() : vector(1));
  const matches = rankMoments(songs, docs, vectors, vector());
  assert.deepEqual(matches.map(s => s.id), ["confidence"]);
  assert.equal(matches[0].focus, "Confidence");
  assert.deepEqual(rankMoments(songs, docs, vectors, vector(2)), []);
  assert.throws(() => rankMoments(songs, docs, [], vector()));
  assert.throws(() => cosine([1], [1, 2]));
});

test("development intention outweighs coincidental lyric overlap", () => {
  const songs = [song("goal"), song("lyric")];
  const docs = publicDocuments(songs);
  const vectors = docs.map(doc => (doc.songId === "goal" ? doc.modality === "development" : doc.modality === "lyrics") ? vector() : vector(1));
  assert.equal(rankMoments(songs, docs, vectors, vector())[0].id, "goal");
});

test("only public corpus vectors are cached; edits, visibility, and expiry refresh the index", async () => {
  let now = 0;
  const batches: string[][] = [];
  const search = createMomentSearcher(async texts => { batches.push(texts); return texts.map(() => vector()); }, () => now);
  const songs = [song("one")];
  await search("first private listener request", songs, "test");
  await search("second private listener request", songs, "test");
  assert.equal(batches.length, 3); // Corpus once, two independently embedded queries.
  assert.ok(!batches[0].join(" ").includes("listener request"));
  songs[0].metadata!.development_goal = "Connection";
  await search("third query", songs, "test");
  assert.equal(batches.length, 5);
  now += 3_600_001;
  await search("fourth query", songs, "test");
  assert.equal(batches.length, 7);
  songs[0].visibility = "private";
  assert.deepEqual(await search("fifth query", songs, "test"), []);
  assert.equal(batches.length, 7);
});

test("concurrent searches share cold indexing and a failed build can retry", async () => {
  let builds = 0;
  let unblock!: () => void;
  const gate = new Promise<void>(resolve => { unblock = resolve; });
  const search = createMomentSearcher(async texts => {
    if (texts.length > 1) { builds++; await gate; }
    return texts.map(() => vector());
  });
  const one = search("first query", [song("one")], "test");
  const two = search("second query", [song("one")], "test");
  unblock();
  await Promise.all([one, two]);
  assert.equal(builds, 1);
  let fail = true;
  const retry = createMomentSearcher(async texts => {
    if (fail) { fail = false; throw new Error("Provider unavailable"); }
    return texts.map(() => vector());
  });
  await assert.rejects(retry("query", [song("one")], "test"));
  assert.equal((await retry("query", [song("one")], "test")).length, 1);
});

test("request limiter bounds concurrency, visitor requests, total budget, and resets", () => {
  let now = 0;
  const limits = createMomentLimits(() => now);
  const releases = [limits.enter("a"), limits.enter("b"), limits.enter("c")];
  assert.ok(releases.every(Boolean)); assert.equal(limits.enter("d"), null);
  releases.forEach(release => release!());
  // Releasing twice must not permit excess simultaneous requests.
  releases.forEach(release => release!());
  for (let i = 0; i < 5; i++) { const release = limits.enter("a"); assert.ok(release); release(); }
  assert.equal(limits.enter("a"), null);
  for (let i = 0; i < 22; i++) { const release = limits.enter(`visitor${i}`); assert.ok(release); release(); }
  assert.equal(limits.enter("new"), null);
  now = 60_001;
  assert.ok(limits.enter("a"));
});
