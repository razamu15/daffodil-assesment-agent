/**
 * Dev-only mock API. main.tsx imports this module dynamically behind
 * `import.meta.env.DEV`, so the production build never bundles it (or the
 * fixtures and core it pulls in).
 */
import type { Route } from "../app/routes";
import type { Transport } from "../api/transport";
import { createMockTransport, MOCK_LATENCY_MS } from "./router";
import { DEFAULT_SCENARIO_ID, isScenarioId, SCENARIOS } from "./scenarios";
export { SCENARIO_QUERY_KEY } from "./scenarios";
import type { Scenario, ScenarioId } from "./scenarios";
import type { MockWorld } from "./world";

export { ScenarioSwitcher } from "./ScenarioSwitcher";

export type MockApi = {
  transport: Transport;
  current: () => Scenario;
  /** Replaces the world with a fresh build of the scenario; returns the screen it starts on. */
  switchTo: (id: ScenarioId) => Route;
  /** The start screen of the scenario loaded at boot. */
  initialRoute: Route;
};

export function createMockApi(requested: string | null, latencyMs = MOCK_LATENCY_MS): MockApi {
  let scenario = SCENARIOS[isScenarioId(requested) ? requested : DEFAULT_SCENARIO_ID];
  let built: { world: MockWorld; start: Route } = scenario.build();
  return {
    transport: createMockTransport(() => built.world, latencyMs),
    current: () => scenario,
    initialRoute: built.start,
    switchTo: (id) => {
      scenario = SCENARIOS[id];
      built = scenario.build();
      return built.start;
    },
  };
}
