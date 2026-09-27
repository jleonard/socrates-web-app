/**
 * By default, Remix will handle hydrating your app on the client for you.
 * You are free to delete this file if you'd like to, but if you ever want it revealed again, you can run `npx remix reveal` ✨
 * For more information, see https://remix.run/file-conventions/entry.client
 */
import * as Sentry from "@sentry/react-router";
import {
  DEFAULT_LOCALE,
  DEFAULT_NS,
  SUPPORTED_LOCALES,
} from "app/utils/i18n/config";
import i18next from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import HttpBackend from "i18next-http-backend";
import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { HydratedRouter } from "react-router/dom";

Sentry.init({
  dsn: "https://99830f5974dcb7c9561aff8c62fd8a54@o4510411602198528.ingest.us.sentry.io/4510411604688896",
  // Adds request headers and IP for users, for more info visit:
  // https://docs.sentry.io/platforms/javascript/guides/react-router/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
});

async function main() {
  await i18next
    .use(initReactI18next)
    .use(HttpBackend)
    .use(LanguageDetector)
    .init({
      fallbackLng: DEFAULT_LOCALE,
      supportedLngs: [...SUPPORTED_LOCALES],
      defaultNS: DEFAULT_NS,
      detection: { order: ["htmlTag"], caches: [] },
      backend: { loadPath: "/locales/{{lng}}/{{ns}}.json" },
      react: { useSuspense: false },
    });

  startTransition(() => {
    hydrateRoot(
      document,
      <I18nextProvider i18n={i18next}>
        <StrictMode>
          <HydratedRouter />
        </StrictMode>
      </I18nextProvider>,
    );
  });
}

main().catch(console.error);
