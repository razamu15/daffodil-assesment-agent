/**
 * Token auth (Doc 3 §9 option 1): every route but login and health needs a valid,
 * unexpired token signed with the deploy-time password.
 */
import { describe, expect, it } from "vitest";
import { apiRoutes, ApiErrorCode, AUTH_TOKEN_TTL_HOURS, LoginResponseSchema } from "@helper-assistant/domain";
import { createApp } from "../src/index";
import { TEST_PASSWORD, testApp } from "./harness";

/** A concrete path for a route, with placeholder params. */
const concretePath = (path: string) => path.replace(":ref", "1").replace(":id", "x");

describe("auth", () => {
  it("health and login are the only open routes", async () => {
    const { request } = await testApp();
    expect((await request("GET", "/api/health")).status).toBe(200);
  });

  it("every other route refuses a request without a token (401), before validating anything", async () => {
    const { request, errorCode } = await testApp();
    for (const route of Object.values(apiRoutes).filter((r) => r.auth)) {
      const response = await request(route.method, concretePath(route.path), { body: route.method === "POST" ? {} : undefined });
      expect(response.status, `${route.method} ${route.path}`).toBe(401);
      expect(errorCode(response.json)).toBe(ApiErrorCode.UNAUTHORIZED);
    }
  });

  it("a wrong password gets 401; the right one a token that expires in AUTH_TOKEN_TTL_HOURS", async () => {
    const { request } = await testApp();
    expect((await request("POST", "/api/login", { body: { password: "wrong" } })).status).toBe(401);
    expect((await request("POST", "/api/login", { body: { password: `${TEST_PASSWORD} ` } })).status).toBe(401);
    const ok = await request("POST", "/api/login", { body: { password: TEST_PASSWORD } });
    expect(ok.status).toBe(200);
    const { expiresAt } = LoginResponseSchema.parse(ok.json);
    expect(Date.parse(expiresAt) - Date.parse("2026-10-14T12:00:00.000Z")).toBe(AUTH_TOKEN_TTL_HOURS * 3_600_000);
  });

  it("accepts a valid token, and rejects tampered, foreign, malformed and expired ones", async () => {
    const { request, login, clock } = await testApp();
    const token = await login();
    expect((await request("GET", "/api/helpers", { token })).status).toBe(200);

    const [expiry, signature] = token.split(".") as [string, string];
    const laterExpiry = btoa("2099-01-01T00:00:00.000Z").replace(/=+$/, "");
    const flipped = `${signature.slice(0, -2)}${signature.endsWith("AA") ? "BB" : "AA"}`;
    for (const bad of [`${laterExpiry}.${signature}`, `${expiry}.${flipped}`, "garbage", `${token}.extra`, ""]) {
      expect((await request("GET", "/api/helpers", { token: bad })).status, bad).toBe(401);
    }

    const otherApp = await testApp();
    const foreign = createApp({ ...otherApp.deps, appPassword: "another password" });
    const foreignLogin = await foreign.request("/api/login", { method: "POST", body: JSON.stringify({ password: "another password" }) });
    const foreignToken = LoginResponseSchema.parse(await foreignLogin.json()).token;
    expect((await request("GET", "/api/helpers", { token: foreignToken })).status).toBe(401);

    clock.current = "2026-10-14T23:59:59.999Z";
    expect((await request("GET", "/api/helpers", { token })).status).toBe(200);
    clock.current = "2026-10-15T00:00:00.000Z";
    expect((await request("GET", "/api/helpers", { token })).status).toBe(401);
  });

  it("refuses to start with an empty password", async () => {
    const { deps } = await testApp();
    expect(() => createApp({ ...deps, appPassword: "" })).toThrow(/APP_PASSWORD/);
  });
});
