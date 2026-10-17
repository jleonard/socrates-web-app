import { reactRouter } from "@react-router/dev/vite";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// package.json "version", baked in at build time as __APP_VERSION__ (see
// app/utils/app.version.ts) so logs can record which release produced them.
const { version } = JSON.parse(readFileSync("./package.json", "utf-8"));

export default defineConfig({
  plugins: [reactRouter(), tsconfigPaths()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  optimizeDeps: {
    exclude: ["i18next-fs-backend"],
  },
});
