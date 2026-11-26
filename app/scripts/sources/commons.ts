/**
 * Wikimedia Commons images for objects (Wikidata P18): file info and
 * license from the Commons API, then a 1280px rendition (a standard
 * Wikimedia thumbnail width) for the ingest's vision step.
 *
 * Only freely licensed files pass: public domain (incl. PD-Art photos of
 * 2D public-domain works), CC0, CC BY and CC BY-SA. Anything else, or a
 * file with no machine-readable license, is skipped and reported.
 */
import { politeGetBinary, politeJson } from "./http";

const API = "https://commons.wikimedia.org/w/api.php";
export const IMAGE_WIDTH = 1280;

export type CommonsImage = {
  file: string;
  pageUrl: string;
  imageUrl: string;
  license: string;
  licenseShort: string;
  artist: string | null;
  free: boolean;
};

const stripHtml = (s?: string) =>
  s ? s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() || null : null;

/** Free = PD, CC0, CC BY, CC BY-SA (any version). NC/ND and unknown fail. */
export function isFreeLicense(license: string, short: string): boolean {
  const l = license.toLowerCase();
  const s = short.toLowerCase();
  if (/\bnc\b|-nc\b|\bnd\b|-nd\b/.test(`${l} ${s}`)) return false;
  return (
    l === "pd" ||
    l.startsWith("cc0") ||
    /^cc-by(-sa)?-\d/.test(l) ||
    s.startsWith("public domain") ||
    s.startsWith("cc0") ||
    /^cc by(-sa)? \d/.test(s)
  );
}

/** File info for up to 50 files per request. Keys are bare file names. */
export async function fetchCommonsInfo(files: string[]): Promise<Map<string, CommonsImage>> {
  const out = new Map<string, CommonsImage>();
  for (let i = 0; i < files.length; i += 50) {
    const batch = files.slice(i, i + 50);
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      prop: "imageinfo",
      iiprop: "url|extmetadata|mime",
      iiurlwidth: String(IMAGE_WIDTH),
      iiextmetadatafilter: "License|LicenseShortName|Artist",
      maxlag: "5",
      titles: batch.map((f) => `File:${f}`).join("|"),
    });
    type Res = {
      query: {
        normalized?: { from: string; to: string }[];
        pages: {
          title: string;
          missing?: boolean;
          imageinfo?: {
            url: string;
            thumburl?: string;
            descriptionurl: string;
            extmetadata?: Record<string, { value: string } | undefined>;
          }[];
        }[];
      };
    };
    const res = await politeJson<Res>(`${API}?${params}`);
    const back = new Map((res.query.normalized ?? []).map((n) => [n.to, n.from]));
    for (const page of res.query.pages) {
      const info = page.imageinfo?.[0];
      if (page.missing || !info) continue;
      const requested = (back.get(page.title) ?? page.title).replace(/^File:/, "");
      const meta = info.extmetadata ?? {};
      const license = meta.License?.value ?? "";
      const licenseShort = stripHtml(meta.LicenseShortName?.value) ?? "";
      out.set(requested, {
        file: page.title.replace(/^File:/, ""),
        pageUrl: info.descriptionurl,
        // drop the utm_* tracking query Commons appends
        imageUrl: (info.thumburl ?? info.url).split("?")[0],
        license,
        licenseShort,
        artist: stripHtml(meta.Artist?.value),
        free: isFreeLicense(license, licenseShort),
      });
    }
  }
  return out;
}

export const downloadImage = (img: CommonsImage) => politeGetBinary(img.imageUrl);
