/**
 * One mock handler per route in apiRoutes. The full map is typed as `Handlers`,
 * so a route added to the contract without a mock handler fails typecheck.
 */
import type { ApiRouteName, RouteResponse } from "@helper-assistant/domain";
import type { ParsedRequest } from "../../api/routeTypes";
import type { MockWorld } from "../world";

export type Handler<N extends ApiRouteName> = (world: MockWorld, request: ParsedRequest<N>) => RouteResponse<N>;
export type Handlers = { [N in ApiRouteName]: Handler<N> };

/** The single token the mock issues. Any request on an authenticated route must carry it. */
export const MOCK_TOKEN = "mock-token";
/** The one password the mock refuses, to show the Login error state. */
export const MOCK_WRONG_PASSWORD = "wrong";
