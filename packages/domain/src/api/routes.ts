/**
 * The HTTP API route table (Doc 2 §4), written once.
 *
 * Call sites: api (registers handlers and validates against these schemas),
 * web (typed fetch client), web's mock server (serves fixtures per route).
 *
 * Every route needs a bearer token except where `auth` is false.
 */
import { z } from "zod";
import { BillStatusSchema, PendingActionStatusSchema } from "../enums";
import { ActionRefSchema, IdSchema, MonthKeySchema } from "../primitives";
import {
  ActionsResponseSchema,
  ApproveBillRequestSchema,
  ApproveBillResponseSchema,
  BillResponseSchema,
  BillsResponseSchema,
  ChatRequestSchema,
  ChatResponseSchema,
  ConfirmActionRequestSchema,
  ConfirmActionResponseSchema,
  CreateHelperRequestSchema,
  HelperResponseSchema,
  RecordPaymentRequestSchema,
  RecordPaymentResponseSchema,
  UpdateHelperRequestSchema,
  DocumentResponseSchema,
  EmptyBodySchema,
  HealthResponseSchema,
  HelpersResponseSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  MessageHandedOffResponseSchema,
  MessagesResponseSchema,
  RejectActionRequestSchema,
  RejectActionResponseSchema,
  SessionMessagesResponseSchema,
  SessionsResponseSchema,
  TermsResponseSchema,
  TurnViewSchema,
  UploadDocumentRequestSchema,
} from "./schemas";
import { MonthStatusSchema } from "../entities/monthStatus";

export type HttpMethod = "GET" | "POST";

export type RouteDef = {
  method: HttpMethod;
  /** Hono-style path with :params. */
  path: string;
  auth: boolean;
  params: z.ZodType | null;
  query: z.ZodType | null;
  body: z.ZodType | null;
  response: z.ZodType;
};

const route = <const R extends RouteDef>(r: R) => r;

const idParam = z.object({ id: IdSchema });
const refParam = z.object({ ref: z.coerce.number().pipe(ActionRefSchema) });

export const apiRoutes = {
  login: route({ method: "POST", path: "/api/login", auth: false, params: null, query: null, body: LoginRequestSchema, response: LoginResponseSchema }),
  health: route({ method: "GET", path: "/api/health", auth: false, params: null, query: null, body: null, response: HealthResponseSchema }),

  chat: route({ method: "POST", path: "/api/chat", auth: true, params: null, query: null, body: ChatRequestSchema, response: ChatResponseSchema }),
  getTurn: route({ method: "GET", path: "/api/turns/:id", auth: true, params: idParam, query: null, body: null, response: TurnViewSchema }),
  listSessions: route({ method: "GET", path: "/api/sessions", auth: true, params: null, query: null, body: null, response: SessionsResponseSchema }),
  getSessionMessages: route({ method: "GET", path: "/api/sessions/:id/messages", auth: true, params: idParam, query: null, body: null, response: SessionMessagesResponseSchema }),

  uploadDocument: route({ method: "POST", path: "/api/documents", auth: true, params: null, query: null, body: UploadDocumentRequestSchema, response: DocumentResponseSchema }),
  getDocument: route({ method: "GET", path: "/api/documents/:id", auth: true, params: idParam, query: null, body: null, response: DocumentResponseSchema }),

  listHelpers: route({ method: "GET", path: "/api/helpers", auth: true, params: null, query: null, body: null, response: HelpersResponseSchema }),
  createHelper: route({ method: "POST", path: "/api/helpers", auth: true, params: null, query: null, body: CreateHelperRequestSchema, response: HelperResponseSchema }),
  updateHelper: route({ method: "POST", path: "/api/helpers/:id", auth: true, params: idParam, query: null, body: UpdateHelperRequestSchema, response: HelperResponseSchema }),
  listTerms: route({
    method: "GET", path: "/api/terms", auth: true, params: null,
    query: z.object({ helperId: IdSchema.optional() }),
    body: null, response: TermsResponseSchema,
  }),
  listBills: route({
    method: "GET", path: "/api/bills", auth: true, params: null,
    query: z.object({ month: MonthKeySchema.optional(), helperId: IdSchema.optional(), status: BillStatusSchema.optional() }),
    body: null, response: BillsResponseSchema,
  }),
  getBill: route({ method: "GET", path: "/api/bills/:id", auth: true, params: idParam, query: null, body: null, response: BillResponseSchema }),
  /** month defaults to the most recent closed month as of the server's Clock. */
  getMonthStatus: route({
    method: "GET", path: "/api/month-status", auth: true, params: null,
    query: z.object({ month: MonthKeySchema.optional() }),
    body: null, response: MonthStatusSchema,
  }),
  listActions: route({
    method: "GET", path: "/api/actions", auth: true, params: null,
    query: z.object({ status: PendingActionStatusSchema.optional() }),
    body: null, response: ActionsResponseSchema,
  }),
  listMessages: route({
    method: "GET", path: "/api/messages", auth: true, params: null,
    query: z.object({ helperId: IdSchema.optional() }),
    body: null, response: MessagesResponseSchema,
  }),

  /** THE commit. No model call anywhere on this path. */
  confirmAction: route({ method: "POST", path: "/api/actions/:ref/confirm", auth: true, params: refParam, query: null, body: ConfirmActionRequestSchema, response: ConfirmActionResponseSchema }),
  rejectAction: route({ method: "POST", path: "/api/actions/:ref/reject", auth: true, params: refParam, query: null, body: RejectActionRequestSchema, response: RejectActionResponseSchema }),
  approveBill: route({ method: "POST", path: "/api/bills/:id/approve", auth: true, params: idParam, query: null, body: ApproveBillRequestSchema, response: ApproveBillResponseSchema }),
  recordPayment: route({ method: "POST", path: "/api/bills/:id/payment", auth: true, params: idParam, query: null, body: RecordPaymentRequestSchema, response: RecordPaymentResponseSchema }),
  markMessageHandedOff: route({ method: "POST", path: "/api/messages/:id/handed-off", auth: true, params: idParam, query: null, body: EmptyBodySchema, response: MessageHandedOffResponseSchema }),
} as const;

export type ApiRoutes = typeof apiRoutes;
export type ApiRouteName = keyof ApiRoutes;
export type RouteBody<N extends ApiRouteName> = ApiRoutes[N]["body"] extends z.ZodType ? z.infer<ApiRoutes[N]["body"]> : never;
export type RouteResponse<N extends ApiRouteName> = z.infer<ApiRoutes[N]["response"]>;
