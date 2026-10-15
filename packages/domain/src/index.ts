/**
 * @helper-assistant/domain: the shared contract. FROZEN after Track 0 —
 * changes go through Saad (Doc 4 §3).
 */
export * from "./primitives";
export * from "./enums";
export * from "./constants";
export * from "./targetKeys";
export * from "./errors";
export * from "./clock";

export * from "./entities/people";
export * from "./entities/document";
export * from "./entities/agreement";
export * from "./entities/check";
export * from "./entities/bill";
export * from "./entities/action";
export * from "./entities/records";
export * from "./entities/payment";
export * from "./entities/monthStatus";

export * from "./ports/store";
export * from "./ports/services";
export * from "./ports/model";

export * from "./api/schemas";
export * from "./api/routes";

export * from "./tools/extraction";
export * from "./tools/tools";
