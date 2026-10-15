/**
 * Password login and stateless bearer tokens (Doc 3 §9, option 1):
 *
 *   token = base64url(expiresAt) + "." + base64url(HMAC-SHA256(APP_PASSWORD, expiresAt))
 *
 * No signing secret besides the password, nothing stored server-side, expiry
 * AUTH_TOKEN_TTL_HOURS. Comparisons are constant-time. Web Crypto only, so the
 * same code runs in Node and on Lambda.
 *
 * Call site: createApp (the login route, and the check on every auth: true route).
 */
import { AUTH_TOKEN_TTL_HOURS } from "@helper-assistant/domain";
import type { Clock, Instant } from "@helper-assistant/domain";
import { fromBase64Url, toBase64Url } from "./base64";

const MS_PER_HOUR = 60 * 60 * 1000;
const encoder = new TextEncoder();

/** Equal-length inputs are compared without an early exit. Lengths are not secret here (fixed-size digests). */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i]! ^ b[i]!;
  return difference === 0;
}

const sha256 = async (text: string): Promise<Uint8Array> => new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text)));

export type TokenAuth = {
  /** Constant-time check of a login attempt. */
  passwordMatches(attempt: string): Promise<boolean>;
  issueToken(): Promise<{ token: string; expiresAt: Instant }>;
  /** True only for a well-formed, correctly signed, unexpired token. */
  tokenIsValid(token: string): Promise<boolean>;
};

export function createTokenAuth(appPassword: string, clock: Clock): TokenAuth {
  const signingKey = crypto.subtle.importKey("raw", encoder.encode(appPassword), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const passwordDigest = sha256(appPassword);
  const sign = async (expiresAt: string) => new Uint8Array(await crypto.subtle.sign("HMAC", await signingKey, encoder.encode(expiresAt)));

  return {
    async passwordMatches(attempt) {
      return constantTimeEqual(await sha256(attempt), await passwordDigest);
    },

    async issueToken() {
      const expiresAt = new Date(Date.parse(clock.now()) + AUTH_TOKEN_TTL_HOURS * MS_PER_HOUR).toISOString();
      return { token: `${toBase64Url(encoder.encode(expiresAt))}.${toBase64Url(await sign(expiresAt))}`, expiresAt };
    },

    async tokenIsValid(token) {
      const [encodedExpiry, encodedSignature, ...rest] = token.split(".");
      if (encodedExpiry === undefined || encodedSignature === undefined || rest.length > 0) return false;
      const expiryBytes = fromBase64Url(encodedExpiry);
      const signature = fromBase64Url(encodedSignature);
      if (expiryBytes === null || signature === null) return false;
      const expiresAt = new TextDecoder().decode(expiryBytes);
      if (!constantTimeEqual(signature, await sign(expiresAt))) return false;
      const expiry = Date.parse(expiresAt);
      return !Number.isNaN(expiry) && expiry > Date.parse(clock.now());
    },
  };
}
