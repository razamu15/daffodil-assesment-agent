/**
 * The typed API client, derived from `apiRoutes`. Every response is parsed with
 * the route's `response` schema: this is the UI's one validation boundary, and
 * everything downstream trusts what it returns.
 *
 * Auth (Doc 3 §9): the token lives in memory only and goes out as
 * `Authorization: Bearer …`. A 401 on an authenticated route drops it, which
 * sends the app back to Login.
 */
import { ApiErrorCode, ApiErrorSchema, apiRoutes } from "@helper-assistant/domain";
import type { ApiErrorCode as ApiErrorCodeT, ApiRouteName, RouteDef, RouteResponse } from "@helper-assistant/domain";
import type { RouteArgs, RouteRequest } from "./routeTypes";
import type { Transport } from "./transport";

/** Failures the client detects itself, alongside the server's ApiErrorCode. */
export const ClientFailure = {
  /** The request never got an answer. */
  NETWORK: "NETWORK",
  /** The server answered with something the contract doesn't allow. */
  BAD_RESPONSE: "BAD_RESPONSE",
} as const;
export type ClientFailure = (typeof ClientFailure)[keyof typeof ClientFailure];

export class ApiClientError extends Error {
  constructor(
    readonly code: ApiErrorCodeT | ClientFailure,
    message: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

const fillPath = (path: string, params: Record<string, unknown> | undefined): string =>
  path.replace(/:(\w+)/g, (_match, name: string) => encodeURIComponent(String(params?.[name])));

function toSearchParams(query: Record<string, unknown> | undefined): URLSearchParams {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) if (value !== undefined) search.set(key, String(value));
  return search;
}

export class ApiClient {
  private token: string | null = null;
  private readonly authListeners = new Set<() => void>();

  constructor(private readonly transport: Transport) {}

  get isLoggedIn(): boolean {
    return this.token !== null;
  }

  /** Call sites: App (switches between Login and the app shell). */
  onAuthChange(listener: () => void): () => void {
    this.authListeners.add(listener);
    return () => this.authListeners.delete(listener);
  }

  async login(password: string): Promise<void> {
    const { token } = await this.call("login", { body: { password } });
    this.setToken(token);
  }

  logout(): void {
    this.setToken(null);
  }

  async call<N extends ApiRouteName>(name: N, ...[request]: RouteArgs<N>): Promise<RouteResponse<N>> {
    const route: RouteDef = apiRoutes[name];
    const req = (request ?? {}) as RouteRequest<N> & { params?: Record<string, unknown>; query?: Record<string, unknown> };
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (route.auth && this.token !== null) headers.authorization = `Bearer ${this.token}`;

    let answer;
    try {
      answer = await this.transport({
        method: route.method,
        path: fillPath(route.path, req.params),
        query: toSearchParams(req.query),
        headers,
        body: route.body === null ? null : JSON.stringify(req.body ?? {}),
      });
    } catch {
      throw new ApiClientError(ClientFailure.NETWORK, "Couldn't reach the server. Check your connection and try again.");
    }

    if (answer.status >= 200 && answer.status < 300) {
      const parsed = route.response.safeParse(answer.json);
      if (!parsed.success) {
        console.error(`Response for ${name} broke the contract`, parsed.error.issues);
        throw new ApiClientError(ClientFailure.BAD_RESPONSE, "The server sent something unexpected.");
      }
      return parsed.data as RouteResponse<N>;
    }

    const failure = ApiErrorSchema.safeParse(answer.json);
    if (!failure.success) throw new ApiClientError(ClientFailure.BAD_RESPONSE, `The server failed (HTTP ${answer.status}).`);
    if (failure.data.error.code === ApiErrorCode.UNAUTHORIZED && route.auth) this.setToken(null);
    throw new ApiClientError(failure.data.error.code, failure.data.error.message);
  }

  private setToken(token: string | null): void {
    this.token = token;
    for (const listener of this.authListeners) listener();
  }
}
