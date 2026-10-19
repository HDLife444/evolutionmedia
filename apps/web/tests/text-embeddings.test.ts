import assert from "node:assert/strict";
import { test } from "node:test";
import { EMBEDDING_DIMENSIONS, EmbeddingProviderError, embedTexts, songTextChunks } from "../utils/text-embeddings";

test("indexing includes complete bounded lyrics but excludes private provenance", () => {
  const lyrics = "🎵".repeat(2500);
  const chunks = songTextChunks({ title: "Song", lyrics, development_goal: "Confidence",
    emotional_progression: "Fear to expression", provenance: "DO NOT SEND" });
  assert.equal(chunks.filter(c => c.modality === "lyrics").map(c => c.chunk_text).join(""), lyrics);
  assert.ok(chunks.every(c => c.chunk_text.length <= 4000));
  assert.ok(chunks.every(c => !c.chunk_text.includes("DO NOT SEND")));
  assert.ok(chunks.some(c => c.modality === "development"));
});
test("provider results are matched to input order and dimensions", async () => {
  const one = Array(EMBEDDING_DIMENSIONS).fill(0); one[0] = 1;
  const two = Array(EMBEDDING_DIMENSIONS).fill(0); two[1] = 1;
  const fetcher = (async (_url, init) => {
    const input = JSON.parse(String(init?.body));
    assert.equal(input.dimensions, EMBEDDING_DIMENSIONS);
    assert.deepEqual(input.input, ["first", "second"]);
    return Response.json({ model: "text-embedding-3-small", data: [{ index: 1, embedding: two }, { index: 0, embedding: one }] });
  }) as typeof fetch;
  assert.deepEqual(await embedTexts(["first", "second"], "synthetic-test-key", fetcher), [one, two]);
});
test("wrong vector spaces, malformed results, and provider failures are rejected", async () => {
  for (const body of [
    { model: "wrong-model", data: [] },
    { model: "text-embedding-3-small", data: [{ index: 0, embedding: [1] }] },
    { model: "text-embedding-3-small", data: [{ index: 0, embedding: Array(1536).fill(0) }] },
  ]) {
    await assert.rejects(embedTexts(["query"], "synthetic-test-key", (async () => Response.json(body)) as typeof fetch));
  }
  await assert.rejects(embedTexts(["query"], "synthetic-test-key", (async () => new Response("", { status: 401 })) as typeof fetch));
});

test("provider quota classification retains no provider message or input", async () => {
  await assert.rejects(embedTexts(["PRIVATE QUERY"], "synthetic-test-key", (async () => Response.json({
    error: { code: "insufficient_quota", message: "PRIVATE PROVIDER DETAILS" },
  }, { status: 429 })) as typeof fetch), error => {
    assert.ok(error instanceof EmbeddingProviderError && error.quotaExhausted && error.status === 429);
    assert.ok(!JSON.stringify(error).includes("PRIVATE"));
    return true;
  });
});
