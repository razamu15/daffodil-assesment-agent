/**
 * Registers every route in domain's apiRoutes on a Hono app. This is the one
 * validation boundary: params, query and body are parsed with the route's zod
 * schemas here, and handlers (and core below them) trust what they get.
 *
 * The handler table is typed as one handler per route name, so a route in the
 * contract without a handler is a compile error.
 *
 * Call site: createApp.
 */
import type { Context, Hono } from "hono";
import { ApiErrorCode, apiRoutes } from "@helper-assistant/domain";
import type { ApiRouteName, ApiRoutes, RouteDef, RouteResponse } from "@helper-assistant/domain";
import type { TokenAuth } from "./auth";
import { ApiFailure } from "./errors";

/** What a route schema parses to (its output type); null where the route has no such part. */
type Parsed<S> = S extends { parse(value: unknown): infer Output } ? Output : null;

export type RouteInput<N extends ApiRouteName> = {
  params: Parsed<ApiRoutes[N]["params"]>;
  query: Parsed<ApiRoutes[N]["query"]>;
  body: Parsed<ApiRoutes[N]["body"]>;
};

export type RouteHandler<N extends ApiRouteName> = (input: RouteInput<N>) => Promise<RouteResponse<N>>;
export type RouteHandlers = { [N in ApiRouteName]: RouteHandler<N> };

const BEARER_PREFIX = "Bearer ";

function parseOrFail(schema: RouteDef["body"], value: unknown, where: string): unknown {
  if (schema === null) return null;
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${[where, ...i.path].join(".")}: ${i.message}`).join("; ");
    throw new ApiFailure(ApiErrorCode.VALIDATION_FAILED, issues);
  }
  return result.data;
}

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new ApiFailure(ApiErrorCode.VALIDATION_FAILED, "The request body must be JSON.");
  }
}

async function requireToken(c: Context, auth: TokenAuth): Promise<void> {
  const header = c.req.header("Authorization") ?? "";
  const valid = header.startsWith(BEARER_PREFIX) && (await auth.tokenIsValid(header.slice(BEARER_PREFIX.length)));
  if (!valid) throw new ApiFailure(ApiErrorCode.UNAUTHORIZED, "Log in first.");
}

export function registerRoutes(app: Hono, handlers: RouteHandlers, auth: TokenAuth): void {
  for (const name of Object.keys(apiRoutes) as ApiRouteName[]) {
    const route = apiRoutes[name];
    const handler = handlers[name] as (input: unknown) => Promise<unknown>;
    app.on(route.method, route.path, async (c) => {
      if (route.auth) await requireToken(c, auth);
      const input = {
        params: parseOrFail(route.params, c.req.param(), "params"),
        query: parseOrFail(route.query, c.req.query(), "query"),
        body: route.body === null ? null : parseOrFail(route.body, await readJson(c), "body"),
      };
      return c.json(await handler(input), 200);
    });
  }
}
