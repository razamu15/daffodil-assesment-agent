/**
 * The app shell: Login until there's a token, then the nav (with the Decisions
 * badge) and the screen for the current hash route.
 */
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { PendingActionStatus } from "@helper-assistant/domain";
import type { ApiClient } from "../api/client";
import { AgreementsScreen } from "../screens/agreements/AgreementsScreen";
import { BillScreen } from "../screens/bill/BillScreen";
import { BillsScreen } from "../screens/bills/BillsScreen";
import { ChatScreen } from "../screens/chat/ChatScreen";
import { DecisionsScreen } from "../screens/decisions/DecisionsScreen";
import { LoginScreen } from "../screens/LoginScreen";
import { MonthScreen } from "../screens/month/MonthScreen";
import { ErrorBoundary } from "../ui/ErrorBoundary";
import { plural } from "../ui/format";
import { AppProvider, LoadStatus, useApiQuery, useApp } from "./AppContext";
import { hrefFor, parseHash, routes, Screen } from "./routes";
import type { Route } from "./routes";

type ScreenViews = { [S in Screen]: (route: Extract<Route, { screen: S }>) => ReactNode };

const SCREEN_VIEW: ScreenViews = {
  [Screen.MONTH]: (r) => <MonthScreen month={r.month} />,
  [Screen.BILLS]: () => <BillsScreen />,
  [Screen.BILL]: (r) => <BillScreen billId={r.billId} />,
  [Screen.AGREEMENTS]: (r) => <AgreementsScreen helperId={r.helperId} />,
  [Screen.CHAT]: (r) => <ChatScreen sessionId={r.sessionId} draft={r.draft} />,
  [Screen.DECISIONS]: () => <DecisionsScreen />,
  [Screen.NOT_FOUND]: (r) => (
    <section className="screen">
      <h1>Nothing here</h1>
      <p>
        There's no page at <code>{r.hash}</code>. <a href={hrefFor(routes.month())}>Go to this month</a>.
      </p>
    </section>
  ),
};

/** Which nav item a screen belongs to. */
const NAV_SECTION: Record<Screen, Screen | null> = {
  [Screen.MONTH]: Screen.MONTH,
  [Screen.BILLS]: Screen.BILLS,
  [Screen.BILL]: Screen.BILLS,
  [Screen.AGREEMENTS]: Screen.AGREEMENTS,
  [Screen.CHAT]: Screen.CHAT,
  [Screen.DECISIONS]: Screen.DECISIONS,
  [Screen.NOT_FOUND]: null,
};

const NAV_ITEMS: { section: Screen; label: string; route: Route }[] = [
  { section: Screen.MONTH, label: "Month", route: routes.month() },
  { section: Screen.BILLS, label: "Bills", route: routes.bills() },
  { section: Screen.AGREEMENTS, label: "Agreements", route: routes.agreements() },
  { section: Screen.CHAT, label: "Assistant", route: routes.chat() },
];

function useHashRoute(): { route: Route; hash: string } {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return { route: parseHash(hash), hash };
}

function DecisionsBadge({ active }: { active: boolean }) {
  const query = useApiQuery((api) => api.call("listActions", { query: { status: PendingActionStatus.PENDING } }), []);
  const count = query.status === LoadStatus.READY ? query.data.actions.length : 0;
  return (
    <a href={hrefFor(routes.decisions())} className={`decisions-badge${count > 0 ? " has-items" : ""}${active ? " active" : ""}`}>
      {count > 0 ? `${plural(count, "thing")} need${count === 1 ? "s" : ""} you` : "Nothing waiting on you"}
    </a>
  );
}

function Shell() {
  const { api } = useApp();
  const { route, hash } = useHashRoute();
  const section = NAV_SECTION[route.screen];
  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href={hrefFor(routes.month())}>
          Helper Assistant
        </a>
        <nav className="nav">
          {NAV_ITEMS.map((item) => (
            <a key={item.section} href={hrefFor(item.route)} className={item.section === section ? "active" : undefined}>
              {item.label}
            </a>
          ))}
        </nav>
        <DecisionsBadge active={section === Screen.DECISIONS} />
        <button type="button" className="link-button logout" onClick={() => api.logout()}>
          Log out
        </button>
      </header>
      <main key={hash}>
        <ErrorBoundary>{(SCREEN_VIEW[route.screen] as (r: Route) => ReactNode)(route)}</ErrorBoundary>
      </main>
    </div>
  );
}

export function App({ api, devTools }: { api: ApiClient; devTools: ReactNode }) {
  const [loggedIn, setLoggedIn] = useState(api.isLoggedIn);
  useEffect(() => {
    const unsubscribe = api.onAuthChange(() => setLoggedIn(api.isLoggedIn));
    return () => {
      unsubscribe();
    };
  }, [api]);
  return (
    <AppProvider api={api}>
      {loggedIn ? <Shell /> : <LoginScreen />}
      {devTools}
    </AppProvider>
  );
}
