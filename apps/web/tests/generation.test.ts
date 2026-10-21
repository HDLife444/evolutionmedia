import assert from "node:assert/strict";
import { test } from "node:test";
import { validGenerationInput, parseWorkerConnection, publicJob, sameOriginRequest, smallJson } from "../utils/generation";
const id = "a7ae1234-1234-4234-a123-123456789abc";
const request = { id, moment: "I want a hopeful start to my day.", genre: "soul", kind: "instrumental", duration: 30 };

test("generation request accepts supported choices and rejects invalid or unbounded jobs", () => {
  assert.ok(validGenerationInput(request));
  for (const change of [{ id: "../secret" }, { moment: " " }, { moment: "a".repeat(501) }, { duration: 600 }, { genre: "unknown" }, { kind: "cover" }]) {
    assert.equal(validGenerationInput({ ...request, ...change }), false);
  }
  assert.ok(validGenerationInput({ ...request, kind: "vocal", genre: "hip-hop", duration: 120 }));
});

test("connection URLs prevent private-network, arbitrary-host, credential, path, and redirect targets", () => {
  const key = "a".repeat(43);
  assert.deepEqual(parseWorkerConnection({ url: "https://music-test.trycloudflare.com", key }), { url: "https://music-test.trycloudflare.com", key });
  for (const url of ["http://music-test.trycloudflare.com", "https://127.0.0.1", "https://169.254.169.254", "https://[::1]", "https://music.trycloudflare.com.evil.example", "https://user:password@music.trycloudflare.com", "https://music.trycloudflare.com/v1/jobs", "https://music.trycloudflare.com?url=secret", "https://music.trycloudflare.com#secret", "https://music.trycloudflare.com:8443"]) {
    assert.equal(parseWorkerConnection({ url, key }), null, url);
  }
  assert.equal(parseWorkerConnection({ url: "https://music.trycloudflare.com", key: "short" }), null);
  assert.equal(parseWorkerConnection({ url: "https://music.trycloudflare.com", key: "a".repeat(32)+"\n" }), null);
});

test("worker presentation strips filesystem paths, keys, owner fields, and detailed internal errors", () => {
  const job = publicJob({ ...request, status: "failed", created_at: "2026-10-21T00:00:00Z", owner_id: "PRIVATE_OWNER", key: "PRIVATE_KEY", path: "/private/outputs", error: "PRIVATE_INTERNAL" }, id);
  const serialized = JSON.stringify(job);
  assert.ok(!serialized.includes("PRIVATE_") && !serialized.includes("/private"));
  assert.equal(job.id, id);
  assert.ok(job.error?.includes("did not finish"));
  assert.throws(() => publicJob({ ...request, status: "completed" }, "00000000-0000-0000-0000-000000000000"));
  assert.throws(() => publicJob({ ...request, status: "unknown" }));
});

test("connection-changing and job-creation requests require the same browser origin", () => {
  assert.ok(sameOriginRequest(new Request("https://evolutionmedia.vercel.app/api/generation", { headers: { Origin: "https://evolutionmedia.vercel.app" } })));
  assert.equal(sameOriginRequest(new Request("https://evolutionmedia.vercel.app/api/generation", { headers: { Origin: "https://attacker.example" } })), false);
  assert.equal(sameOriginRequest(new Request("https://evolutionmedia.vercel.app/api/generation")), false);
});

test("input is JSON-only and bounded even without a content-length header", async () => {
  const req = (body: string, type = "application/json") => new Request("https://evolutionmedia.vercel.app/api/generation", { method: "POST", headers: { "Content-Type": type }, body });
  assert.deepEqual(await smallJson(req(JSON.stringify(request))), request);
  await assert.rejects(smallJson(req("{")));
  await assert.rejects(smallJson(req("x".repeat(9000))));
  await assert.rejects(smallJson(req(JSON.stringify(request), "text/plain")));
});
