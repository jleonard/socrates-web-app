import * as Sentry from "@sentry/react-router";

Sentry.init({
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
