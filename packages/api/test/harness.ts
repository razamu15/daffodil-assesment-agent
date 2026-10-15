/**
 * API test harness: createApp over an InMemoryStore loaded with the starter pack
 * (September bills recorded and checked), a settable clock, and small recording
 * doubles for TurnRunner and MemoryClient (the real ones belong to Track B).
 */
import { expect } from "vitest";
import { apiRoutes, ApiErrorSchema, LoginResponseSchema, StoredEntity, WriteConditionKind } from "@helper-assistant/domain";
import type { ApiRouteName, RouteResponse, ChatMessage, Clock, Instant, LocalDate, MemoryClient, StoreRecord, TurnRunner } from "@helper-assistant/domain";
import {
  STARTER_PACK_TODAY,
  starterPackBills,
  starterPackDocuments,
  starterPackHelpers,
  starterPackHousehold,
  starterPackTerms,
} from "@helper-assistant/fixtures";
import { checkStoredBill } from "@helper-assistant/core";
import type { CoreDeps } from "@helper-assistant/core";
import { InMemoryBlobStore, InMemoryStore } from "@helper-assistant/store";
import { createApp } from "../src/index";

export const TEST_PASSWORD = "correct horse battery staple";

export class SettableClock implements Clock {
  constructor(public current: Instant) {}
  now(): Instant {
    return this.current;
  }
  today(): LocalDate {
    return this.current.slice(0, 10);
  }
}

export class RecordingTurnRunner implements TurnRunner {
  readonly started: { turnId: string; sessionId: string }[] = [];
  failWith: Error | null = null;
  async start(turn: { turnId: string; sessionId: string }): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.started.push(turn);
  }
}

export class RecordingMemory implements MemoryClient {
  readonly chats = new Map<string, ChatMessage[]>();
  async appendChatMessages(sessionId: string, messages: ChatMessage[]): Promise<void> {
    this.chats.set(sessionId, [...(this.chats.get(sessionId) ?? []), ...messages]);
  }
  async listChatMessages(sessionId: string, { maxMessages }: { maxMessages: number }): Promise<ChatMessage[]> {
    return (this.chats.get(sessionId) ?? []).slice(-maxMessages);
  }
  async retrieveHints(): Promise<[]> {
    return [];
  }
}

export async function testApp() {
  const store = new InMemoryStore();
  const clock = new SettableClock(`${STARTER_PACK_TODAY}T12:00:00.000Z`);
  let nextId = 0;
  const deps = {
    appPassword: TEST_PASSWORD,
    store,
    blobStore: new InMemoryBlobStore(),
    clock,
    turnRunner: new RecordingTurnRunner(),
    memory: new RecordingMemory(),
    newId: () => `id-${++nextId}`,
  };
  const records: StoreRecord[] = [
    { entity: StoredEntity.HOUSEHOLD, value: starterPackHousehold },
    ...starterPackHelpers.map((value): StoreRecord => ({ entity: StoredEntity.HELPER, value })),
    ...starterPackTerms.map((value): StoreRecord => ({ entity: StoredEntity.TERM, value })),
    ...starterPackDocuments.map((value): StoreRecord => ({ entity: StoredEntity.DOCUMENT, value })),
  ];
  await store.commit(records.map((record) => ({ record, condition: { kind: WriteConditionKind.ABSENT } })));
  for (const bill of starterPackBills) {
    const latestCheck = await checkStoredBill(deps, bill);
    await store.commit([{ record: { entity: StoredEntity.BILL, value: { ...bill, latestCheck } }, condition: { kind: WriteConditionKind.ABSENT } }]);
  }

  const app = createApp(deps);
  const core: CoreDeps = deps;

  async function request(method: string, path: string, options: { body?: unknown; token?: string | null; rawBody?: string } = {}) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    const body = options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
    const response = await app.request(path, { method, headers, body });
    return { status: response.status, json: (await response.json()) as unknown };
  }

  const login = async (): Promise<string> => LoginResponseSchema.parse((await request("POST", "/api/login", { body: { password: TEST_PASSWORD } })).json).token;

  /** The error code of a failed response (after checking it has the ApiError shape). */
  const errorCode = (json: unknown) => ApiErrorSchema.parse(json).error.code;

  /** Calls a route with a fresh token and checks the 200 response against the route's response schema. */
  async function call<N extends ApiRouteName>(name: N, path: string, body?: unknown): Promise<RouteResponse<N>> {
    const response = await request(apiRoutes[name].method, path, { body, token: await login() });
    expect(response.status, JSON.stringify(response.json)).toBe(200);
    return apiRoutes[name].response.parse(response.json) as RouteResponse<N>;
  }

  return { app, deps, core, store, clock, request, login, call, errorCode };
}
