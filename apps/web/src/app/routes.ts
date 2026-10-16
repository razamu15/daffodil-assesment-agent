/**
 * Hash routes (`#/month`), hand-rolled. Hash routing means CloudFront never has
 * to rewrite unknown paths to index.html, which would also swallow API 404s
 * (Doc 2 §6 "Gotchas").
 *
 * Call sites: App (render the screen for the current route), every link and
 * navigation in the app, mock scenarios (start screen per scenario).
 */
import type { Id, MonthKey } from "@helper-assistant/domain";

export const Screen = {
  /** The month: its bills, charts and the assistant side by side. Bills have no screen of their own. */
  MONTH: "MONTH",
  BILL: "BILL",
  AGREEMENTS: "AGREEMENTS",
  CHAT: "CHAT",
  DECISIONS: "DECISIONS",
  NOT_FOUND: "NOT_FOUND",
} as const;
export type Screen = (typeof Screen)[keyof typeof Screen];

export type Route =
  /** month null = the API's default (most recent closed month). */
  | { screen: typeof Screen.MONTH; month: MonthKey | null }
  | { screen: typeof Screen.BILL; billId: Id }
  | { screen: typeof Screen.AGREEMENTS; helperId: Id | null }
  /** sessionId null = a new chat; draft prefills the composer ("Change this…" links). */
  | { screen: typeof Screen.CHAT; sessionId: Id | null; draft: string | null }
  | { screen: typeof Screen.DECISIONS }
  | { screen: typeof Screen.NOT_FOUND; hash: string };

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function parseHash(hash: string): Route {
  const [pathPart = "", queryPart = ""] = hash.replace(/^#/, "").split("?");
  const parts = pathPart.split("/").filter((p) => p !== "").map(decodeURIComponent);
  const query = new URLSearchParams(queryPart);
  const [first, second] = parts;
  if (first === undefined || (first === "month" && second === undefined)) return { screen: Screen.MONTH, month: null };
  if (first === "month" && second !== undefined && MONTH_PATTERN.test(second)) return { screen: Screen.MONTH, month: second };
  // #/bills (the old Bills screen) now lands on the month, where bills are listed.
  if (first === "bills") return second === undefined ? { screen: Screen.MONTH, month: null } : { screen: Screen.BILL, billId: second };
  if (first === "agreements") return { screen: Screen.AGREEMENTS, helperId: second ?? null };
  if (first === "chat") return { screen: Screen.CHAT, sessionId: second ?? null, draft: query.get("draft") };
  if (first === "decisions") return { screen: Screen.DECISIONS };
  return { screen: Screen.NOT_FOUND, hash };
}

const enc = encodeURIComponent;

export function hrefFor(route: Route): string {
  switch (route.screen) {
    case Screen.MONTH:
      return route.month === null ? "#/month" : `#/month/${route.month}`;
    case Screen.BILL:
      return `#/bills/${enc(route.billId)}`;
    case Screen.AGREEMENTS:
      return route.helperId === null ? "#/agreements" : `#/agreements/${enc(route.helperId)}`;
    case Screen.CHAT: {
      const base = route.sessionId === null ? "#/chat" : `#/chat/${enc(route.sessionId)}`;
      return route.draft === null ? base : `${base}?draft=${enc(route.draft)}`;
    }
    case Screen.DECISIONS:
      return "#/decisions";
    case Screen.NOT_FOUND:
      return route.hash;
  }
}

export const navigate = (route: Route): void => {
  window.location.hash = hrefFor(route);
};

/** Shorthands for the routes linked most often. */
export const routes = {
  month: (month: MonthKey | null = null): Route => ({ screen: Screen.MONTH, month }),
  bill: (billId: Id): Route => ({ screen: Screen.BILL, billId }),
  agreements: (helperId: Id | null = null): Route => ({ screen: Screen.AGREEMENTS, helperId }),
  chat: (sessionId: Id | null = null, draft: string | null = null): Route => ({ screen: Screen.CHAT, sessionId, draft }),
  decisions: (): Route => ({ screen: Screen.DECISIONS }),
};
