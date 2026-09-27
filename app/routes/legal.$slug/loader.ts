import { getLocale } from "app/middleware/i18next.server";
import { DEFAULT_LOCALE } from "app/utils/i18n/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { LoaderFunctionArgs } from "react-router";

const VALID_SLUGS = ["terms", "privacy"] as const;
type LegalSlug = (typeof VALID_SLUGS)[number];

function isValidSlug(slug: string): slug is LegalSlug {
  return (VALID_SLUGS as readonly string[]).includes(slug);
}

export async function loadLegalDoc(slug: LegalSlug, locale: string) {
  try {
    return await readFile(
      resolve(`./app/content/legal/${slug}.${locale}.md`),
      "utf-8",
    );
  } catch (error) {
    if (locale !== DEFAULT_LOCALE) {
      return readFile(
        resolve(`./app/content/legal/${slug}.${DEFAULT_LOCALE}.md`),
        "utf-8",
      );
    }
    throw error;
  }
}

export async function loader({ params, context }: LoaderFunctionArgs) {
  if (!params.slug || !isValidSlug(params?.slug)) {
    throw new Response("Not Found", { status: 404 });
  }

  const locale = getLocale(context);
  const content = await loadLegalDoc(params.slug, locale);

  const title =
    params.slug === "terms" ? "Terms and Conditions" : "Privacy Policy";

  return {
    content,
    pageTitle: "WonderWay | Terms and Conditions",
  };
}
