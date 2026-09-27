import {
  DEFAULT_LOCALE,
  DEFAULT_NS,
  SUPPORTED_LOCALES,
} from "app/utils/i18n/config";
import Backend from "i18next-fs-backend";
import { resolve } from "node:path";
import { initReactI18next } from "react-i18next";
import { createCookie } from "react-router";
import { createI18nextMiddleware } from "remix-i18next/middleware";

export const localeCookie = createCookie("lng", {
  path: "/",
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  httpOnly: true,
});

export const [i18nextMiddleware, getLocale, getInstance] =
  createI18nextMiddleware({
    detection: {
      supportedLanguages: [...SUPPORTED_LOCALES],
      fallbackLanguage: DEFAULT_LOCALE,
      cookie: localeCookie,
    },
    i18next: {
      fallbackLng: DEFAULT_LOCALE,
      supportedLngs: [...SUPPORTED_LOCALES],
      defaultNS: DEFAULT_NS,
      backend: {
        loadPath: resolve("./public/locales/{{lng}}/{{ns}}.json"),
      },
    },
    plugins: [initReactI18next, Backend],
  });
