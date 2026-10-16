/**
 * Vite modes for local development. Default `development` uses the in-browser
 * mock API; LOCAL_API_MODE talks to apps/local-server through the dev proxy.
 *
 * Call sites: main.tsx (which transport), vite.config.ts (the proxy).
 */
export const LOCAL_API_MODE = "local-api";

/** apps/local-server's port (LOCAL_API_PORT in apps/local-server/src/config.ts). */
export const LOCAL_API_ORIGIN = "http://localhost:8787";
