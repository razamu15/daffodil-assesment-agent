import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { LOCAL_API_MODE, LOCAL_API_ORIGIN } from "./src/devModes";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Only `npm run dev:local` needs the real API; the mock answers in the browser otherwise.
  server: mode === LOCAL_API_MODE ? { proxy: { "/api": LOCAL_API_ORIGIN } } : {},
}));
