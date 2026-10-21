import { cookies } from "next/headers";
import { CONNECTION_COOKIE, generationAdministrator, generationFailure, privateHeaders, workerJson } from "@/utils/generation-server";
import { parseWorkerConnection, sameOriginRequest, smallJson } from "@/utils/generation";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return generationFailure("Please connect from the Evolution Media site.", 403);
  const auth = await generationAdministrator();
  if (auth.error) return auth.error;
  let value: unknown;
  try {
    const input = await smallJson(request) as { connection?: unknown };
    value = typeof input.connection === "string" ? JSON.parse(input.connection) : input.connection;
  } catch { return generationFailure("Paste the connection details printed by the Lambda setup command.", 400); }
  const connection = parseWorkerConnection(value);
  if (!connection) return generationFailure("These connection details aren’t valid. Use the HTTPS connection details from the Lambda setup command.", 400);
  try {
    const health = await workerJson(connection, "/v1/health");
    if (!health.ok) return generationFailure("We couldn’t verify this music server. Confirm the setup is running and copy its latest connection details.", 400);
    (await cookies()).set(CONNECTION_COOKIE, Buffer.from(JSON.stringify({ ...connection, owner: auth.owner })).toString("base64url"), {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 12 * 60 * 60,
    });
    return Response.json({ connected: true }, { headers: privateHeaders });
  } catch { return generationFailure("We couldn’t reach this music server. Leave its setup running and try the latest connection details.", 503); }
}
export async function DELETE(request: Request) {
  if (!sameOriginRequest(request)) return generationFailure("Please disconnect from the Evolution Media site.", 403);
  const auth = await generationAdministrator();
  if (auth.error) return auth.error;
  (await cookies()).set(CONNECTION_COOKIE, "", { path: "/", maxAge: 0, httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" });
  return Response.json({ connected: false }, { headers: privateHeaders });
}
