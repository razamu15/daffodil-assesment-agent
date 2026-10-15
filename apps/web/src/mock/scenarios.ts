/**
 * The six UI scenarios (Doc 4 §4 Track C). Each builds a fresh MockWorld and
 * names the screen to open on.
 *
 * Call sites: the scenario switcher, the mock contract test.
 */
import { billIds } from "@helper-assistant/fixtures";
import { routes } from "../app/routes";
import type { Route } from "../app/routes";
import { addApprovalsAndRefusal, addConflictingProposals, addLupeEngagementEnd, addMarcoWithoutBill } from "./scenarioData";
import { starterWorld } from "./starterWorld";
import { MockWorld } from "./world";

export const ScenarioId = {
  EMPTY: "empty",
  MONTH_MIXED: "month-mixed",
  BILL_FLAGGED: "bill-flagged",
  PENDING_CONFLICT: "pending-conflict",
  APPROVED: "approved",
  HELPER_ENDED: "helper-ended",
} as const;
export type ScenarioId = (typeof ScenarioId)[keyof typeof ScenarioId];

export type Scenario = {
  id: ScenarioId;
  /** What it shows, for the switcher. */
  shows: string;
  /** Builds the world and returns the screen to open on. */
  build: () => { world: MockWorld; start: Route };
};

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  [ScenarioId.EMPTY]: {
    id: ScenarioId.EMPTY,
    shows: "First run: nothing added yet",
    build: () => ({ world: new MockWorld(), start: routes.month() }),
  },
  [ScenarioId.MONTH_MIXED]: {
    id: ScenarioId.MONTH_MIXED,
    shows: "September: Priya and Lupe flagged, Theo checks out, Marco's bill not received",
    build: () => {
      const world = starterWorld();
      addMarcoWithoutBill(world);
      return { world, start: routes.month() };
    },
  },
  [ScenarioId.BILL_FLAGGED]: {
    id: ScenarioId.BILL_FLAGGED,
    shows: "Lupe's bill line by line, screenshot beside what was read",
    build: () => ({ world: starterWorld(), start: routes.bill(billIds.lupe) }),
  },
  [ScenarioId.PENDING_CONFLICT]: {
    id: ScenarioId.PENDING_CONFLICT,
    shows: "Two proposals for Lupe's November rate that disagree",
    build: () => {
      const world = starterWorld();
      addConflictingProposals(world);
      return { world, start: routes.decisions() };
    },
  },
  [ScenarioId.APPROVED]: {
    id: ScenarioId.APPROVED,
    shows: "Priya approved with exceptions (locked), Theo paid, a corrected bill refused",
    build: () => {
      const world = starterWorld();
      addApprovalsAndRefusal(world);
      return { world, start: routes.bill(billIds.priya) };
    },
  },
  [ScenarioId.HELPER_ENDED]: {
    id: ScenarioId.HELPER_ENDED,
    shows: "Lupe's last day: engagement end with key reminder, final bill expected",
    build: () => {
      const world = starterWorld();
      const sessionId = addLupeEngagementEnd(world);
      return { world, start: routes.chat(sessionId) };
    },
  },
};

/** Query-string key that keeps the chosen scenario across reloads (?scenario=month-mixed). */
export const SCENARIO_QUERY_KEY = "scenario";

export const DEFAULT_SCENARIO_ID: ScenarioId = ScenarioId.EMPTY;

export const isScenarioId = (value: string | null): value is ScenarioId => value !== null && Object.values(ScenarioId).includes(value as ScenarioId);
