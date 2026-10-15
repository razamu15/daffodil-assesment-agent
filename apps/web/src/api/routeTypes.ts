/**
 * Request types derived from the domain route table (`apiRoutes`), so the client
 * and the mock server can't drift from the contract.
 *
 * Call sites: api/client.ts (what a caller passes), mock/router.ts and the mock
 * handlers (what a handler receives after validation).
 */
import type { z } from "zod";
import type { ApiRouteName, ApiRoutes } from "@helper-assistant/domain";

type PartKey = "params" | "query" | "body";
type EmptyObject = Record<never, never>;

/** The validated (output) type of one request part, or undefined when the route has none. */
export type RoutePart<N extends ApiRouteName, K extends PartKey> = ApiRoutes[N][K] extends z.ZodType ? z.output<ApiRoutes[N][K]> : undefined;

/** A part is optional when the route has none, or when every field in it is optional. */
type Field<K extends PartKey, T> = [T] extends [undefined]
  ? { [P in K]?: undefined }
  : EmptyObject extends T
    ? { [P in K]?: T }
    : { [P in K]: T };

export type RouteRequest<N extends ApiRouteName> = Field<"params", RoutePart<N, "params">> &
  Field<"query", RoutePart<N, "query">> &
  Field<"body", RoutePart<N, "body">>;

/** Lets `call("listHelpers")` omit the request while `call("getBill", {...})` requires it. */
export type RouteArgs<N extends ApiRouteName> = EmptyObject extends RouteRequest<N> ? [request?: RouteRequest<N>] : [request: RouteRequest<N>];

/** What a mock handler receives: every part, already parsed by the route's schemas. */
export type ParsedRequest<N extends ApiRouteName> = {
  params: RoutePart<N, "params">;
  query: RoutePart<N, "query">;
  body: RoutePart<N, "body">;
};
