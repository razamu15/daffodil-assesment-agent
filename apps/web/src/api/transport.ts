/**
 * The one seam between the typed client and "the server". Production uses
 * fetchTransport against the same-origin /api (CloudFront proxies it, so no
 * CORS: Doc 2 §2). Dev mode swaps in the mock transport (src/mock).
 */
import type { HttpMethod } from "@helper-assistant/domain";

export type TransportRequest = {
  method: HttpMethod;
  /** Path with params filled in, e.g. /api/bills/bill-1. */
  path: string;
  query: URLSearchParams;
  headers: Record<string, string>;
  /** JSON text, or null for routes without a body. */
  body: string | null;
};

export type TransportResponse = { status: number; json: unknown };

export type Transport = (request: TransportRequest) => Promise<TransportResponse>;

export const fetchTransport: Transport = async ({ method, path, query, headers, body }) => {
  const search = query.toString();
  const response = await fetch(search === "" ? path : `${path}?${search}`, { method, headers, body });
  const json: unknown = await response.json().catch(() => null);
  return { status: response.status, json };
};
