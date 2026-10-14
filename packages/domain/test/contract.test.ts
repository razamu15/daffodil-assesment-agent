import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AgreementExtractionSchema,
  BillExtractionSchema,
  FixedClock,
  ServiceKind,
  SystemClock,
  apiRoutes,
  termSlot,
  toolInputSchemas,
  TOOL_CATEGORY,
} from "../src/index";

describe("model-facing schemas convert to JSON Schema (Bedrock toolSpec)", () => {
  const schemas = { ...toolInputSchemas, AgreementExtractionSchema, BillExtractionSchema };
  for (const [name, schema] of Object.entries(schemas)) {
    it(name, () => {
      const json = z.toJSONSchema(schema, { io: "input" });
      expect(json.type).toBe("object");
    });
  }
});

describe("tool registry", () => {
  it("gives every tool a category", () => {
    expect(Object.keys(TOOL_CATEGORY).sort()).toEqual(Object.keys(toolInputSchemas).sort());
  });

  it("has no commit-capable tools", () => {
    const forbidden = ["confirm_action", "approve_bill", "send_message", "edit_approved_bill", "delete_anything", "run_code"];
    for (const name of forbidden) expect(name in toolInputSchemas).toBe(false);
  });
});

describe("api routes", () => {
  it("are unique by method + path and only login/health are public", () => {
    const routes = Object.values(apiRoutes);
    expect(new Set(routes.map((r) => `${r.method} ${r.path}`)).size).toBe(routes.length);
    expect(routes.filter((r) => !r.auth).map((r) => r.path).sort()).toEqual(["/api/health", "/api/login"]);
  });
});

describe("termSlot", () => {
  it("uses the kind for known services and the label for OTHER", () => {
    expect(termSlot(ServiceKind.CLEANING_REGULAR, "Regular cleaning")).toBe("CLEANING_REGULAR");
    expect(termSlot(ServiceKind.OTHER, " Tutoring ")).toBe(termSlot(ServiceKind.OTHER, "tutoring"));
    expect(termSlot(ServiceKind.OTHER, "Tutoring")).not.toBe(termSlot(ServiceKind.OTHER, "Test prep"));
  });
});

describe("clocks", () => {
  it("FixedClock.onDate", () => {
    const clock = FixedClock.onDate("2026-10-14");
    expect(clock.today()).toBe("2026-10-14");
    expect(clock.now()).toBe("2026-10-14T12:00:00.000Z");
  });

  it("SystemClock formats today as YYYY-MM-DD", () => {
    expect(new SystemClock("America/Los_Angeles").today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
