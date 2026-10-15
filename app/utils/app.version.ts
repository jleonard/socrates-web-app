/**
 * The app's release version (package.json "version"), for logs.
 *
 * Injected at build time by vite.config.ts. Falls back to "dev" when code
 * runs outside a Vite build that defines it (e.g. ad-hoc scripts).
 */
export const APP_VERSION: string =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
