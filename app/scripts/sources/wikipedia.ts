/**
 * English Wikipedia via the Action API, by revision:
 *   1. resolveArticles(): one uncached call per 50 titles returns each
 *      page's canonical title and current revision id (redirects followed).
 *   2. fetchArticle(): the plain-text extract, cached under title+revision,
 *      so a page is only downloaded again when it has been edited.
 */
import { politeJson } from "./http";

const API = "https://en.wikipedia.org/w/api.php";

export type ArticleRef = {
  requested: string;
  title: string;
  pageid: number;
  revid: number;
};

export type Article = ArticleRef & {
  url: string;
  permalink: string;
  sections: { heading: string; text: string }[];
};

/** Sections that are lists of references or links, not prose. */
const SKIP_SECTIONS = new Set(
  [
    "references",
    "notes",
    "footnotes",
    "citations",
    "sources",
    "bibliography",
    "works cited",
    "further reading",
    "external links",
    "see also",
    "gallery",
    "notes and references",
    "references and notes",
    "explanatory notes",
  ].map((s) => s.toLowerCase()),
);

export async function resolveArticles(
  titles: string[],
): Promise<{ found: ArticleRef[]; missing: string[] }> {
  const found: ArticleRef[] = [];
  const missing: string[] = [];
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      redirects: "1",
      prop: "info",
      maxlag: "5",
      titles: batch.join("|"),
    });
    type Res = {
      query: {
        normalized?: { from: string; to: string }[];
        redirects?: { from: string; to: string }[];
        pages: {
          title: string;
          pageid?: number;
          lastrevid?: number;
          missing?: boolean;
        }[];
      };
    };
    const res = await politeJson<Res>(`${API}?${params}`, { cache: false });
    const rename = new Map<string, string>();
    for (const n of res.query.normalized ?? []) rename.set(n.from, n.to);
    for (const r of res.query.redirects ?? []) rename.set(r.from, r.to);
    const pages = new Map(res.query.pages.map((p) => [p.title, p]));

    for (const requested of batch) {
      let title = requested;
      for (let hops = 0; rename.has(title) && hops < 3; hops++) {
        title = rename.get(title)!;
      }
      const page = pages.get(title);
      if (!page || page.missing || !page.pageid || !page.lastrevid) {
        missing.push(requested);
      } else {
        found.push({
          requested,
          title: page.title,
          pageid: page.pageid,
          revid: page.lastrevid,
        });
      }
    }
  }
  return { found, missing };
}

export async function fetchArticle(ref: ArticleRef): Promise<Article> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "extracts",
    explaintext: "1",
    exsectionformat: "wiki",
    maxlag: "5",
    pageids: String(ref.pageid),
  });
  type Res = { query: { pages: { extract?: string }[] } };
  const res = await politeJson<Res>(`${API}?${params}`, {
    cacheKey: `wikipedia:en:${ref.pageid}:${ref.revid}`,
  });
  const extract = res.query.pages[0]?.extract ?? "";
  const slug = encodeURIComponent(ref.title.replace(/ /g, "_"));
  return {
    ...ref,
    url: `https://en.wikipedia.org/wiki/${slug}`,
    permalink: `https://en.wikipedia.org/w/index.php?title=${slug}&oldid=${ref.revid}`,
    sections: splitSections(extract),
  };
}

/** Splits an extract on level-2 headings; drops reference/link sections. */
function splitSections(extract: string): { heading: string; text: string }[] {
  const out: { heading: string; text: string }[] = [];
  let heading = "Overview";
  let lines: string[] = [];
  const flush = () => {
    const text = clean(lines.join("\n"));
    if (text.length >= 200 && !SKIP_SECTIONS.has(heading.toLowerCase())) {
      out.push({ heading, text });
    }
    lines = [];
  };
  for (const line of extract.split("\n")) {
    const h2 = /^==\s*([^=].*?)\s*==\s*$/.exec(line);
    if (h2) {
      flush();
      heading = h2[1];
      continue;
    }
    // deeper headings stay inside their section as a plain line
    const h3 = /^={3,}\s*(.*?)\s*={3,}\s*$/.exec(line);
    lines.push(h3 ? `${h3[1]}:` : line);
  }
  flush();
  return out;
}

export function clean(text: string): string {
  return (
    text
      // "---" anywhere is the ingest's chunk separator
      .replace(/-{3,}/g, "—")
      .replace(/\{\\displaystyle[^}]*\}/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
