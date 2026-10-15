/**
 * App-wide context: the API client and a refresh epoch. Any mutation calls
 * refresh(), and every mounted query reloads, so the Decisions badge, Month
 * screen and detail views never show stale state after a confirm or approve.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ApiClientError, ClientFailure } from "../api/client";
import type { ApiClient } from "../api/client";

type AppContextValue = { api: ApiClient; epoch: number; refresh: () => void };

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ api, children }: { api: ApiClient; children: ReactNode }) {
  const [epoch, setEpoch] = useState(0);
  const refresh = useCallback(() => setEpoch((e) => e + 1), []);
  const value = useMemo(() => ({ api, epoch, refresh }), [api, epoch, refresh]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (value === null) throw new Error("useApp must be used inside AppProvider");
  return value;
}

export const LoadStatus = { LOADING: "LOADING", ERROR: "ERROR", READY: "READY" } as const;

export type Query<T> =
  | { status: typeof LoadStatus.LOADING }
  | { status: typeof LoadStatus.ERROR; error: ApiClientError }
  | { status: typeof LoadStatus.READY; data: T };

export const asClientError = (error: unknown): ApiClientError =>
  error instanceof ApiClientError ? error : new ApiClientError(ClientFailure.BAD_RESPONSE, error instanceof Error ? error.message : String(error));

/**
 * Loads data through the API client and reloads on refresh(). Keeps showing the
 * last data while a reload is in flight, so confirming a card doesn't flash the screen.
 */
export function useApiQuery<T>(load: (api: ApiClient) => Promise<T>, deps: readonly unknown[]): Query<T> {
  const { api, epoch } = useApp();
  const [state, setState] = useState<Query<T>>({ status: LoadStatus.LOADING });
  useEffect(() => {
    let live = true;
    load(api).then(
      (data) => live && setState({ status: LoadStatus.READY, data }),
      (error: unknown) => live && setState({ status: LoadStatus.ERROR, error: asClientError(error) }),
    );
    return () => {
      live = false;
    };
    // `load` is recreated every render; the caller's deps say when it changes.
  }, [api, epoch, ...deps]);
  return state;
}
