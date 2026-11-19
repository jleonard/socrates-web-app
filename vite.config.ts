import { reactRouter } from "@react-router/dev/vite";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// package.json "version", baked in at build time as __APP_VERSION__ (see
// app/utils/app.version.ts) so logs can record which release produced them.
const { version } = JSON.parse(readFileSync("./package.json", "utf-8"));

// Sentry release: version + short commit (Vercel sets the commit at build),
// so "has this happened since the deploy?" is one filter even when the
// package version doesn't change. Must match instrument.server.mjs.
const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
const release = `web-app@${version}${commit ? `+${commit}` : ""}`;

export default defineConfig({
  plugins: [reactRouter(), tsconfigPaths()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_RELEASE__: JSON.stringify(release),
  },
  optimizeDeps: {
    exclude: ["i18next-fs-backend"],
  },
});
