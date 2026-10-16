/**
 * TEMPORARY Track D stub for the API Lambda: just /api/health and /api/login, so
 * the skeleton deploy can be smoke-tested. I3 replaces this file's entry with a
 * thin wrapper around createApp, and this file is deleted.
 *
 * The token format matches packages/api/src/auth.ts (Doc 3 §9):
 *   base64url(expiresAt) + "." + base64url(HMAC-SHA256(APP_PASSWORD, expiresAt))
 * Node built-ins only; infra doesn't depend on the app packages.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Copy of AUTH_TOKEN_TTL_HOURS in packages/domain/src/constants.ts. */
const AUTH_TOKEN_TTL_HOURS = 12;
const MS_PER_HOUR = 60 * 60 * 1000;

/** The parts of an API Gateway HTTP API (payload v2) event the stub reads. */
export type HttpApiEvent = {
  rawPath: string;
  body?: string;
  isBase64Encoded: boolean;
  requestContext: { http: { method: string } };
};

export type HttpApiResult = { statusCode: number; headers: Record<string, string>; body: string };

const json = (statusCode: number, body: unknown): HttpApiResult => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const sha256 = (text: string) => createHash("sha256").update(text).digest();

function readPassword(event: HttpApiEvent): string | null {
  if (event.body === undefined) return null;
  const text = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) return null;
    const password = (parsed as { password?: unknown }).password;
    return typeof password === "string" && password.length > 0 ? password : null;
  } catch {
    return null;
  }
}

export function issueToken(appPassword: string, now: Date): { token: string; expiresAt: string } {
  const expiresAt = new Date(now.getTime() + AUTH_TOKEN_TTL_HOURS * MS_PER_HOUR).toISOString();
  const signature = createHmac("sha256", appPassword).update(expiresAt).digest("base64url");
  return { token: `${Buffer.from(expiresAt).toString("base64url")}.${signature}`, expiresAt };
}

export async function handler(event: HttpApiEvent): Promise<HttpApiResult> {
  const appPassword = process.env.APP_PASSWORD;
  if (appPassword === undefined || appPassword === "") throw new Error("APP_PASSWORD is not set on the API Lambda");

  const route = `${event.requestContext.http.method} ${event.rawPath}`;
  if (route === "GET /api/health") return json(200, { ok: true });
  if (route === "POST /api/login") {
    const attempt = readPassword(event);
    if (attempt === null) return json(400, { error: "Body must be {\"password\": \"...\"}" });
    // Fixed-length digests, so timingSafeEqual never throws on length.
    if (!timingSafeEqual(sha256(attempt), sha256(appPassword))) return json(401, { error: "Wrong password" });
    return json(200, issueToken(appPassword, new Date()));
  }
  return json(404, { error: `Not in the Track D stub: ${route}` });
}
