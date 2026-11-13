import * as Sentry from "@sentry/react-router";
import { readFileSync } from "node:fs";

// Same release string as the browser (vite.config.ts): version + short commit.
let version = "dev";
try {
  ({ version } = JSON.parse(
    readFileSync(new URL("./package.json", import.meta.url), "utf-8"),
  ));
} catch {
  // package.json not next to this file (unusual deploy layout): keep "dev"
}
const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);

Sentry.init({
  // Vercel says production/preview/development; locally fall back to NODE_ENV
  environment:
    process.env.VERCEL_ENV ??
    (process.env.NODE_ENV === "production" ? "production" : "development"),
  release: `web-app@${version}${commit ? `+${commit}` : ""}`,
  dsn: "https://99830f5974dcb7c9561aff8c62fd8a54@o4510411602198528.ingest.us.sentry.io/4510411604688896",
  // Adds request headers and IP for users, for more info visit:
  // https://docs.sentry.io/platforms/javascript/guides/react-router/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
  // Enable logs to be sent to Sentry
  enableLogs: true,
  integrations: [
    // send console.log, console.warn, and console.error calls as logs to Sentry
    Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
  ],
});
