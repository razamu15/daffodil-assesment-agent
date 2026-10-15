/**
 * createApp(deps): the whole HTTP API as a Hono app, implementing domain's
 * apiRoutes. Runtime-agnostic (Web APIs only): apps/local-server serves it with
 * Node, and the API Lambda wraps it with hono/aws-lambda (gate I3).
 *
 * Call sites: apps/local-server (I1), the API Lambda handler (I3), api tests.
 */
import { Hono } from "hono";
import { ApiErrorCode } from "@helper-assistant/domain";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { createTokenAuth } from "./auth";
import type { AppDeps } from "./deps";
import { ApiFailure, toApiError } from "./errors";
import { chatHandlers } from "./handlers/chat";
import { commitHandlers } from "./handlers/commits";
import { documentHandlers } from "./handlers/documents";
import { recordHandlers } from "./handlers/records";
import { registerRoutes } from "./routing";
import type { RouteHandlers } from "./routing";

export function createApp(deps: AppDeps): Hono {
  // Fail loudly at startup: an empty password would make every login succeed.
  if (deps.appPassword.length === 0) throw new Error("appPassword is empty. Set APP_PASSWORD.");
  const auth = createTokenAuth(deps.appPassword, deps.clock);

  const handlers: RouteHandlers = {
    login: async ({ body }) => {
      if (!(await auth.passwordMatches(body.password))) throw new ApiFailure(ApiErrorCode.UNAUTHORIZED, "Wrong password.");
      return auth.issueToken();
    },
    ...recordHandlers(deps),
    ...commitHandlers(deps),
    ...chatHandlers(deps),
    ...documentHandlers(deps),
  };

  const app = new Hono();
  registerRoutes(app, handlers, auth);
  app.notFound((c) => {
    const { status, body } = toApiError(new ApiFailure(ApiErrorCode.NOT_FOUND, `No route ${c.req.method} ${c.req.path}`));
    return c.json(body, status as ContentfulStatusCode);
  });
  app.onError((error, c) => {
    const { status, body } = toApiError(error);
    if (body.error.code === ApiErrorCode.INTERNAL) console.error(error);
    return c.json(body, status as ContentfulStatusCode);
  });
  return app;
}
