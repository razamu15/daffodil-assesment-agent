/**
 * The mock transport: answers every route in apiRoutes from a MockWorld, the
 * way the real API would. It matches the path, checks the bearer token, and
 * validates params, query and body with the route's own schemas before calling
 * the handler, so a UI request that breaks the contract fails here too.
 */
import { API_ERROR_HTTP_STATUS, ApiErrorCode, apiRoutes } from "@helper-assistant/domain";
import type { ApiError, ApiErrorCode as ApiErrorCodeT, ApiRouteName, RouteDef } from "@helper-assistant/domain";
import type { Transport, TransportResponse } from "../api/transport";
import { MockApiError } from "./errors";
import { chatHandlers } from "./handlers/chat";
import { commitHandlers } from "./handlers/commits";
import { recordHandlers } from "./handlers/records";
import { MOCK_TOKEN } from "./handlers/types";
import type { Handlers } from "./handlers/types";
import type { MockWorld } from "./world";

const handlers: Handlers = { ...chatHandlers, ...recordHandlers, ...commitHandlers };

type CompiledRoute = { name: ApiRouteName; def: RouteDef; pattern: RegExp };

const compiledRoutes: CompiledRoute[] = (Object.entries(apiRoutes) as [ApiRouteName, RouteDef][]).map(([name, def]) => ({
  name,
  def,
  pattern: new RegExp(`^${def.path.replace(/:(\w+)/g, "(?<$1>[^/]+)")}$`),
}));

/** Simulated network latency in the browser, so loading states are visible. Tests pass 0. */
export const MOCK_LATENCY_MS = 120;

const failure = (code: ApiErrorCodeT, message: string): TransportResponse => {
  const body: ApiError = { error: { code, message } };
  return { status: API_ERROR_HTTP_STATUS[code], json: body };
};

function parsePart(schema: RouteDef["params"], value: unknown, what: string): unknown {
  if (schema === null) return undefined;
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new MockApiError(ApiErrorCode.VALIDATION_FAILED, `Invalid ${what}: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  return parsed.data;
}

export function createMockTransport(currentWorld: () => MockWorld, latencyMs: number): Transport {
  return async (request) => {
    if (latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, latencyMs));
    let match: { route: CompiledRoute; groups: Record<string, string> } | null = null;
    for (const route of compiledRoutes) {
      const found = route.def.method === request.method ? route.pattern.exec(request.path) : null;
      if (found) match = { route, groups: found.groups ?? {} };
    }
    if (match === null) return failure(ApiErrorCode.NOT_FOUND, `No route for ${request.method} ${request.path}.`);
    const { route, groups } = match;
    if (route.def.auth && request.headers.authorization !== `Bearer ${MOCK_TOKEN}`) {
      return failure(ApiErrorCode.UNAUTHORIZED, "Please log in again.");
    }

    try {
      const params = parsePart(route.def.params, Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, decodeURIComponent(v)])), "path");
      const query = parsePart(route.def.query, Object.fromEntries(request.query), "query");
      const body = parsePart(route.def.body, request.body === null ? undefined : JSON.parse(request.body), "body");
      const handler = handlers[route.name] as (world: MockWorld, parsed: { params: unknown; query: unknown; body: unknown }) => unknown;
      const result = handler(currentWorld(), { params, query, body });
      // A JSON round trip, as over the wire: the UI can never hold a live reference into the world.
      return { status: 200, json: JSON.parse(JSON.stringify(result)) };
    } catch (error) {
      if (error instanceof MockApiError) return failure(error.code, error.message);
      console.error("Mock API handler failed", error);
      return failure(ApiErrorCode.INTERNAL, "The mock server failed.");
    }
  };
}
