import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { NextRequest } from "next/server";
import { updateSession } from "../utils/supabase/proxy";

// Use the real SSR SDK against a local Auth stand-in. This verifies the cookie
// bridge, not hosted JWT validation or Supabase's actual refresh-token service.
const user = {
  id: "00000000-0000-0000-0000-000000000001",
  aud: "authenticated", role: "authenticated", email: "test@example.test",
  app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z",
};
const expiresAt = () => Math.floor(Date.now() / 1000) + 3600;
const jwt = (exp: number) => [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify({ sub: user.id, aud: "authenticated", exp })).toString("base64url"),
  "test-signature",
].join(".");
const refreshedToken = jwt(expiresAt());
let rejectRefresh = false;
let calls: string[] = [];
const server = createServer((request, response) => {
  calls.push(request.url ?? "");
  response.setHeader("Content-Type", "application/json");
  if (request.url?.startsWith("/auth/v1/token")) {
    if (rejectRefresh) {
      response.writeHead(400);
      response.end(JSON.stringify({ code: "refresh_token_not_found", msg: "Invalid refresh token" }));
    } else {
      response.end(JSON.stringify({
        access_token: refreshedToken, refresh_token: "new-refresh-token",
        token_type: "bearer", expires_in: 3600, expires_at: expiresAt(), user,
      }));
    }
  } else if (request.url === "/auth/v1/user" && request.headers.authorization === `Bearer ${refreshedToken}`) {
    response.end(JSON.stringify(user));
  } else {
    response.writeHead(401);
    response.end(JSON.stringify({ code: "bad_jwt", msg: "Invalid token" }));
  }
});

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const cookieName = "sb-127-auth-token";

before(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_local-test";
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
});

function requestWithExpiredSession(refreshToken: string) {
  const session = {
    access_token: jwt(Math.floor(Date.now() / 1000) - 3600),
    refresh_token: refreshToken, token_type: "bearer", expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) - 3600, user,
  };
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  return new NextRequest("http://localhost/library", { headers: { cookie: `${cookieName}=${value}` } });
}

test("an anonymous request does not manufacture a session", async () => {
  calls = [];
  const request = new NextRequest("http://localhost/");
  const response = await updateSession(request);
  assert.equal(response.cookies.getAll().length, 0);
  assert.equal(calls.length, 0);
  assert.match(response.headers.get("Cache-Control") ?? "", /private.*no-store/);
});

test("an expired session refreshes cookies for both the render and the browser", async () => {
  calls = [];
  rejectRefresh = false;
  const request = requestWithExpiredSession("old-refresh-token");
  const oldValue = request.cookies.get(cookieName)?.value;
  const response = await updateSession(request);
  assert.ok(calls.some(call => call.includes("grant_type=refresh_token")), "Auth refresh must execute");
  assert.ok(calls.includes("/auth/v1/user"), "Auth must validate the refreshed user");
  const browserCookie = response.cookies.get(cookieName);
  assert.ok(browserCookie?.value);
  assert.notEqual(browserCookie.value, oldValue);
  assert.equal(request.cookies.get(cookieName)?.value, browserCookie.value);
  assert.equal(browserCookie.path, "/");
  assert.match(response.headers.get("Cache-Control") ?? "", /private.*no-store/);
  assert.equal(response.headers.get("Pragma"), "no-cache");
  assert.equal(response.headers.get("Expires"), "0");
  assert.ok(response.headers.get("x-middleware-request-cookie")?.includes(browserCookie.value));
});

test("a rejected refresh removes the expired session instead of preserving it", async () => {
  calls = [];
  rejectRefresh = true;
  const request = requestWithExpiredSession("revoked-refresh-token");
  const response = await updateSession(request);
  assert.ok(calls.some(call => call.includes("grant_type=refresh_token")));
  assert.equal(request.cookies.get(cookieName)?.value, "");
  assert.equal(response.cookies.get(cookieName)?.value, "");
  assert.equal(response.cookies.get(cookieName)?.maxAge, 0);
  assert.match(response.headers.get("Cache-Control") ?? "", /private.*no-store/);
});
