/**
 * Boot. Dev mode serves the mock API (src/mock) with a scenario switcher; the
 * production build talks to the real same-origin /api. The mock is imported
 * dynamically behind `import.meta.env.DEV`, which Vite replaces with `false` in
 * a production build, so the mock, fixtures and core are never bundled.
 */
import { StrictMode } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { ApiClient } from "./api/client";
import { fetchTransport } from "./api/transport";
import type { Transport } from "./api/transport";
import { App } from "./app/App";
import { hrefFor } from "./app/routes";
import "./styles.css";

async function boot(): Promise<void> {
  let transport: Transport = fetchTransport;
  let devTools: ReactNode = null;

  if (import.meta.env.DEV) {
    const mock = await import("./mock");
    const mockApi = mock.createMockApi(new URLSearchParams(window.location.search).get(mock.SCENARIO_QUERY_KEY));
    transport = mockApi.transport;
    devTools = <mock.ScenarioSwitcher mock={mockApi} />;
    if (window.location.hash === "") window.location.hash = hrefFor(mockApi.initialRoute);
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App api={new ApiClient(transport)} devTools={devTools} />
    </StrictMode>,
  );
}

void boot();
