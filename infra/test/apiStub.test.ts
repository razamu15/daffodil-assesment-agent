import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HttpApiEvent } from "../lambda/apiStub";
import { handler } from "../lambda/apiStub";

const event = (method: string, rawPath: string, body?: string): HttpApiEvent => ({
  rawPath,
  body,
  isBase64Encoded: false,
  requestContext: { http: { method } },
});

describe("API stub", () => {
  beforeEach(() => {
    process.env.APP_PASSWORD = "test-password";
  });
  afterEach(() => {
    delete process.env.APP_PASSWORD;
  });

  it("answers health", async () => {
    const result = await handler(event("GET", "/api/health"));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ ok: true });
  });

  it("issues a token in the api package's format for the right password", async () => {
    const result = await handler(event("POST", "/api/login", JSON.stringify({ password: "test-password" })));
    expect(result.statusCode).toBe(200);
    const { token, expiresAt } = JSON.parse(result.body) as { token: string; expiresAt: string };
    const [encodedExpiry, signature] = token.split(".");
    expect(Buffer.from(encodedExpiry!, "base64url").toString()).toBe(expiresAt);
    expect(signature).toBe(createHmac("sha256", "test-password").update(expiresAt).digest("base64url"));
  });

  it("rejects a wrong password and a malformed body", async () => {
    expect((await handler(event("POST", "/api/login", JSON.stringify({ password: "nope" })))).statusCode).toBe(401);
    expect((await handler(event("POST", "/api/login", "not json"))).statusCode).toBe(400);
  });

  it("reads base64-encoded bodies", async () => {
    const body = Buffer.from(JSON.stringify({ password: "test-password" })).toString("base64");
    expect((await handler({ ...event("POST", "/api/login", body), isBase64Encoded: true })).statusCode).toBe(200);
  });

  it("404s everything else", async () => {
    expect((await handler(event("GET", "/api/bills"))).statusCode).toBe(404);
  });
});
