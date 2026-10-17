/**
 * build-map-region.ts
 * -------------------
 * Adds a region's museums, landmarks and cultural institutions from Wikidata
 * to `map_locations`. Re-runnable: run it for a new city, or again later for a
 * city already on the map to pick up new places and refresh prominence.
 *
 * Per run:
 *   1. Query Wikidata for each category within --radius km of --lat/--lng.
 *   2. Clean: drop items Wikidata marks dissolved/closed (P576, P3999, P5817),
 *      descriptions that say defunct/former/demolished/proposed/pop-up or carry
 *      a closed year range, items with no English label, anything in
 *      `map_location_exclusions`, and same-name duplicates within 150 m.
 *   3. Score prominence 0-100 from Wikidata sitelinks + avg monthly English
 *      Wikipedia pageviews (absolute log scale, so scores don't shift as other
 *      regions are added).
 *   4. Give each new row a unique `place_id`: kebab slug of the name, with a
 *      random 2-3 char suffix only when the slug is taken.
 *   5. Insert new rows. Rows already in the table only get their sitelinks /
 *      pageviews / prominence refreshed, so hand edits (descriptions, images,
 *      place_id) are never overwritten.
 *
 * Without --apply nothing is written; the report shows what would happen.
 * Every run writes a JSON report to .tmp/ (added, rejected with reason,
 * duplicates, and existing rows Wikidata now marks closed, for manual review).
 *
 * Schema: run app/scripts/build-map-region.sql once first.
 *
 * Usage:
 *   npm run map:region -- --lat 48.8566 --lng 2.3522 --city Paris
 *   npm run map:region -- --lat 48.8566 --lng 2.3522 --city Paris --radius 15 --apply
 *   npm run map:region -- --rescore-all --apply   # refresh prominence for every row
 *
 * Options:
 *   --lat, --lng     region center (required unless --rescore-all alone)
 *   --radius <km>    search radius, default 20
 *   --city <name>    written to the `city` column of new rows
 *   --rescore-all    also refresh prominence for every row in the table
 *   --apply          write to Supabase
 */

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import { mkdirSync, writeFileSync } from "fs";
import { parseArgs } from "util";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
);

const WIKIDATA_SPARQL = "https://query.wikidata.org/sparql";
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const PAGEVIEWS_API =
  "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user";
// Wikimedia throttles (429) clients without a descriptive UA and contact info.
// WIKIMEDIA_CONTACT (an email) is optional but makes throttling less likely.
const USER_AGENT = `WonderwayMapBuilder/1.0 (https://app.wonderway.ai${process.env.WIKIMEDIA_CONTACT ? `; ${process.env.WIKIMEDIA_CONTACT}` : ""})`;

type Category = "museum" | "cultural_institution" | "landmark";

// Checked in this order; an item matching several classes takes the first.
const CATEGORY_QIDS: [string, Category][] = [
  // Not art gallery (Q1007870): mostly commercial galleries, many closed
  // without a closure date in Wikidata. Museums that are galleries still
  // match Q33506.
  ["Q33506", "museum"],
  ["Q2977", "cultural_institution"], // cathedral
  ["Q1802963", "cultural_institution"], // mansion
  ["Q9259", "landmark"], // UNESCO World Heritage Site
  ["Q4989906", "landmark"], // monument
  ["Q570116", "landmark"], // tourist attraction
];

// Description patterns meaning the place is gone or never existed.
const GONE_PATTERNS: [RegExp, string][] = [
  [/^(former|defunct|demolished|bygone|closed|destroyed|razed|shut down)\b/i, "description: gone"],
  [/\b(defunct|demolished|formerly at|no longer exists|ceased)\b/i, "description: gone"],
  [/\bclosed (in )?(1[5-9]|20)\d\d\b/i, "description: closed year"],
  [/^(proposed|planned|cancell?ed|unbuilt)\b/i, "description: never built"],
  [/\bpop-up\b/i, "description: pop-up"],
  [/\b1[5-9]\d\d\s*[-–]\s*(1[5-9]\d\d|20[0-2]\d)\b/, "description: closed year range"],
];
const GONE_STATES = /closed|demolish|destroy|abandon|disused|ruin|defunct/i;

const DUPLICATE_METERS = 150;
// Log-scale caps: roughly the Eiffel Tower / Louvre end of the range.
const SITELINKS_CAP = 250;
const PAGEVIEWS_CAP = 200_000;

interface SparqlBinding {
  item: { value: string };
  coord: { value: string };
  itemLabel?: { value: string };
  itemDescription?: { value: string };
  image?: { value: string };
  countryLabel?: { value: string };
  article?: { value: string };
  sitelinks?: { value: string };
  dissolved?: { value: string };
  closed?: { value: string };
  stateLabel?: { value: string };
}

interface Candidate {
  qid: string;
  name: string;
  category: Category;
  description: string | null;
  image_url: string | null;
  wikipedia_url: string | null;
  country: string | null;
  lat: number;
  lng: number;
  sitelinks: number;
  goneReason: string | null;
}

interface Links {
  sitelinks: number;
  enwiki: string | null;
}

interface Signals {
  sitelinks: number;
  pageviews: number;
  prominence: number;
}

interface ExistingRow {
  id: number;
  wikidata_qid: string | null;
  name: string;
  lat: number;
  lng: number;
  place_id: string | null;
}

// parseArgs reads "--lng -73.9" as two flags; join negative numbers to their flag.
const argv = process.argv.slice(2).reduce<string[]>((acc, arg) => {
  const prev = acc[acc.length - 1];
  if (/^-\d/.test(arg) && prev?.startsWith("--") && !prev.includes("=")) acc[acc.length - 1] = `${prev}=${arg}`;
  else acc.push(arg);
  return acc;
}, []);

const { values: args } = parseArgs({
  args: argv,
  options: {
    lat: { type: "string" },
    lng: { type: "string" },
    radius: { type: "string", default: "20" },
    city: { type: "string" },
    "rescore-all": { type: "boolean", default: false },
    apply: { type: "boolean", default: false },
  },
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(url: string, init: RequestInit = {}, tries = 4): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    let resp: Response | null = null;
    try {
      resp = await fetch(url, {
        ...init,
        headers: { "User-Agent": USER_AGENT, ...init.headers },
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      if (attempt >= tries) throw err;
    }
    if (resp) {
      if (resp.ok || resp.status === 404 || attempt >= tries) return resp;
      if (resp.status !== 429 && resp.status < 500) return resp;
    }
    const retryAfter = Math.min(Number(resp?.headers.get("retry-after")) || 2 ** attempt, 60);
    await sleep(retryAfter * 1000);
  }
}

async function sparql<T>(query: string): Promise<T[]> {
  const resp = await fetchWithRetry(WIKIDATA_SPARQL, {
    method: "POST",
    headers: { Accept: "application/sparql-results+json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ query, format: "json" }),
  });
  if (!resp.ok) throw new Error(`Wikidata query failed: ${resp.status} ${resp.statusText}`);
  const json = await resp.json();
  return json.results.bindings as T[];
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

// ---------- 1. Wikidata query ----------

function buildQuery(classQid: string, lat: number, lng: number, radiusKm: number): string {
  return `
      SELECT ?item ?itemLabel ?itemDescription ?coord ?image ?countryLabel ?article
           ?sitelinks ?dissolved ?closed ?stateLabel WHERE {
      SERVICE wikibase:around {
        ?item wdt:P625 ?coord .
        bd:serviceParam wikibase:center "Point(${lng} ${lat})"^^geo:wktLiteral .
        bd:serviceParam wikibase:radius "${radiusKm}" .
      }
      ?item wdt:P31/wdt:P279* wd:${classQid} .
      ?item wikibase:sitelinks ?sitelinks .
      OPTIONAL { ?item wdt:P18 ?image. }
      OPTIONAL { ?item wdt:P17 ?country. }
      OPTIONAL {
        ?article schema:about ?item ;
                 schema:isPartOf <https://en.wikipedia.org/> .
      }
      OPTIONAL { ?item wdt:P576 ?dissolved. }
      OPTIONAL { ?item wdt:P3999 ?closed. }
      OPTIONAL { ?item wdt:P5817 ?state. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
  `;
}

const fetchCategory = (classQid: string, lat: number, lng: number, radiusKm: number) =>
  sparql<SparqlBinding>(buildQuery(classQid, lat, lng, radiusKm));

const enwikiTitle = (articleUrl: string | null) =>
  articleUrl ? decodeURIComponent(articleUrl.split("/wiki/")[1] ?? "") || null : null;

function capitalize(text: string | null): string | null {
  return text ? text.charAt(0).toLocaleUpperCase("en") + text.slice(1) : text;
}

function goneReason(b: SparqlBinding, description: string | null): string | null {
  if (b.dissolved) return "wikidata: dissolved/demolished date (P576)";
  if (b.closed) return "wikidata: official closure date (P3999)";
  if (b.stateLabel && GONE_STATES.test(b.stateLabel.value)) return `wikidata: state of use "${b.stateLabel.value}"`;
  // "Former family seat, now a house museum" is still open.
  if (!description || /\bnow (a|an|the)\b/i.test(description)) return null;
  for (const [re, reason] of GONE_PATTERNS) if (re.test(description)) return reason;
  return null;
}

// OPTIONAL clauses repeat an item once per image/country/... value; fold them
// into one candidate, keeping any closure signal seen on any of its rows.
function toCandidates(bindings: SparqlBinding[], category: Category): Map<string, Candidate> {
  const out = new Map<string, Candidate>();
  for (const b of bindings) {
    const qid = b.item.value.split("/").pop()!;
    const [lngStr, latStr] = b.coord.value.replace("Point(", "").replace(")", "").split(" ");
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

    const description = capitalize(b.itemDescription?.value ?? null);
    const reason = goneReason(b, description);
    const prev = out.get(qid);
    if (prev) {
      prev.goneReason ??= reason;
      prev.image_url ??= b.image?.value ?? null;
      prev.wikipedia_url ??= b.article?.value ?? null;
      prev.country ??= b.countryLabel?.value ?? null;
      continue;
    }
    out.set(qid, {
      qid,
      name: b.itemLabel?.value ?? qid,
      category,
      description,
      image_url: b.image?.value ?? null,
      wikipedia_url: b.article?.value ?? null,
      country: b.countryLabel?.value ?? null,
      lat,
      lng,
      sitelinks: Number(b.sitelinks?.value ?? 0),
      goneReason: reason,
    });
  }
  return out;
}

// ---------- 3. Prominence ----------

// Sitelink counts and enwiki titles for rows not returned by the region
// query (--rescore-all), 50 items per wbgetentities call. The API follows
// Wikidata merges; the item's current qid is reported as `mergedInto`.
async function fetchLinks(qids: string[]): Promise<Map<string, Links & { mergedInto?: string }>> {
  const out = new Map<string, Links & { mergedInto?: string }>();
  for (let i = 0; i < qids.length; i += 50) {
    const ids = qids.slice(i, i + 50).join("|");
    const resp = await fetchWithRetry(`${WIKIDATA_API}?action=wbgetentities&props=sitelinks&format=json&ids=${ids}`);
    if (!resp.ok) throw new Error(`wbgetentities failed: ${resp.status} ${resp.statusText}`);
    const json = await resp.json();
    type Entity = { id?: string; missing?: string; sitelinks?: Record<string, { title: string }> };
    for (const [qid, entity] of Object.entries<Entity>(json.entities ?? {})) {
      if (entity.missing !== undefined || !entity.id) continue;
      const links = entity.sitelinks ?? {};
      out.set(qid, {
        sitelinks: Object.keys(links).length,
        enwiki: links.enwiki?.title ?? null,
        ...(entity.id !== qid && { mergedInto: entity.id }),
      });
    }
  }
  return out;
}

// Average monthly user pageviews over the last 12 full months.
async function fetchPageviews(title: string): Promise<number> {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11, 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "") + "00";
  const article = encodeURIComponent(title.replace(/ /g, "_"));
  const resp = await fetchWithRetry(`${PAGEVIEWS_API}/${article}/monthly/${fmt(start)}/${fmt(end)}`);
  if (resp.status === 404) return 0; // no views recorded in the window
  if (!resp.ok) throw new Error(`pageviews for "${title}" failed: ${resp.status} ${resp.statusText}`);
  const json = await resp.json();
  const items: { views: number }[] = json.items ?? [];
  return Math.round(items.reduce((sum, i) => sum + i.views, 0) / 12);
}

function prominence(sitelinks: number, pageviews: number): number {
  const s = Math.min(1, Math.log1p(sitelinks) / Math.log1p(SITELINKS_CAP));
  const p = Math.min(1, Math.log1p(pageviews) / Math.log1p(PAGEVIEWS_CAP));
  return Math.round((0.6 * s + 0.4 * p) * 1000) / 10;
}

async function score(links: Map<string, Links>): Promise<Map<string, Signals>> {
  const out = new Map<string, Signals>();
  let done = 0;
  await mapLimit([...links], 4, async ([qid, l]) => {
    const pageviews = l.enwiki ? await fetchPageviews(l.enwiki) : 0;
    out.set(qid, { sitelinks: l.sitelinks, pageviews, prominence: prominence(l.sitelinks, pageviews) });
    if (++done % 100 === 0) console.log(`  scored ${done}/${links.size}`);
  });
  return out;
}

// ---------- 4. place_id ----------

const slugify = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

function uniquePlaceId(name: string, taken: Set<string>): string {
  const base = slugify(name) || "place";
  let id = base;
  while (taken.has(id)) {
    const len = 2 + Math.round(Math.random());
    id = `${base}-${Math.random().toString(36).slice(2, 2 + len)}`;
  }
  taken.add(id);
  return id;
}

// ---------- helpers ----------

function meters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

const normName = (name: string) => slugify(name);

async function selectAll<T>(table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(`select ${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (data.length < 1000) return rows;
  }
}

async function updateSignals(byQid: Map<string, Signals>): Promise<number> {
  let failed = 0;
  await mapLimit([...byQid], 8, async ([qid, s]) => {
    const { error } = await supabase.from("map_locations").update(s).eq("wikidata_qid", qid);
    if (error) {
      failed++;
      console.error(`  update ${qid}: ${error.message}`);
    }
  });
  return failed;
}

// ---------- main ----------

async function main(): Promise<void> {
  const lat = args.lat !== undefined ? Number(args.lat) : undefined;
  const lng = args.lng !== undefined ? Number(args.lng) : undefined;
  const radiusKm = Number(args.radius);
  const hasRegion = lat !== undefined && lng !== undefined;
  if (!hasRegion && !args["rescore-all"]) {
    throw new Error("Pass --lat and --lng (and optionally --radius, --city), or --rescore-all.");
  }
  if (hasRegion && (Number.isNaN(lat) || Number.isNaN(lng) || !(radiusKm > 0))) {
    throw new Error("--lat, --lng and --radius must be numbers.");
  }

  const mode = args.apply ? "APPLY" : "DRY RUN (pass --apply to write)";
  console.log(`build-map-region: ${mode}`);

  const existing = await selectAll<ExistingRow>("map_locations", "id,wikidata_qid,name,lat,lng,place_id");
  const existingByQid = new Map(existing.filter((r) => r.wikidata_qid).map((r) => [r.wikidata_qid!, r]));
  const { data: exclusionRows, error: exclusionError } = await supabase
    .from("map_location_exclusions")
    .select("wikidata_qid");
  if (exclusionError) {
    const msg = `map_location_exclusions: ${exclusionError.message} (run build-map-region.sql first)`;
    if (args.apply) throw new Error(msg);
    console.warn(`  warning: ${msg}; continuing without exclusions`);
  }
  const excluded = new Set((exclusionRows ?? []).map((r) => r.wikidata_qid as string));

  const report = {
    run: { at: new Date().toISOString(), lat, lng, radiusKm, city: args.city ?? null, applied: args.apply },
    added: [] as object[],
    rejected: [] as object[],
    duplicates: [] as object[],
    existingMarkedClosed: [] as object[],
    merged: [] as object[],
    notFoundOnWikidata: [] as string[],
    refreshed: 0,
  };
  const merged = new Map<string, string>(); // old qid -> qid Wikidata merged it into

  const toInsert: (Candidate & Signals & { place_id: string })[] = [];
  const refresh = new Map<string, Signals>();

  if (hasRegion) {
    // 1. Query
    const candidates = new Map<string, Candidate>();
    for (const [classQid, category] of CATEGORY_QIDS) {
      const found = toCandidates(await fetchCategory(classQid, lat!, lng!, radiusKm), category);
      let added = 0;
      for (const [qid, c] of found) {
        const prev = candidates.get(qid);
        if (prev) prev.goneReason ??= c.goneReason;
        else {
          candidates.set(qid, c);
          added++;
        }
      }
      console.log(`  ${category.padEnd(20)} ${classQid.padEnd(9)} ${found.size} items, ${added} new to this run`);
      await sleep(1000); // be polite to the public endpoint
    }

    // 2. Clean
    const fresh: Candidate[] = [];
    for (const c of candidates.values()) {
      const row = existingByQid.get(c.qid);
      if (row) {
        if (c.goneReason) report.existingMarkedClosed.push({ id: row.id, qid: c.qid, name: row.name, reason: c.goneReason });
        continue;
      }
      let reason = c.goneReason;
      if (!reason && excluded.has(c.qid)) reason = "in map_location_exclusions";
      if (!reason && /^Q\d+$/.test(c.name)) reason = "no English label";
      if (reason) report.rejected.push({ qid: c.qid, name: c.name, description: c.description, reason });
      else fresh.push(c);
    }

    // 3. Score new + existing-in-region together
    const inRegion = [...candidates.values()].filter((c) => existingByQid.has(c.qid));
    const signals = await score(
      new Map([...fresh, ...inRegion].map((c) => [c.qid, { sitelinks: c.sitelinks, enwiki: enwikiTitle(c.wikipedia_url) }])),
    );
    for (const c of inRegion) refresh.set(c.qid, signals.get(c.qid)!);

    // Duplicates: same name within DUPLICATE_METERS of an existing row or a
    // better-known candidate. Highest sitelinks wins.
    fresh.sort((a, b) => (signals.get(b.qid)?.sitelinks ?? 0) - (signals.get(a.qid)?.sitelinks ?? 0));
    const kept: { name: string; lat: number; lng: number; qid: string }[] = existing.map((r) => ({
      name: normName(r.name),
      lat: r.lat,
      lng: r.lng,
      qid: r.wikidata_qid ?? `row ${r.id}`,
    }));

    // 4. place_id
    const { data: rel } = await supabase.from("location_relationships").select("parent_id,child_id");
    const taken = new Set<string>([
      ...existing.flatMap((r) => (r.place_id ? [r.place_id] : [])),
      ...(rel ?? []).flatMap((r) => [r.parent_id as string, r.child_id as string]),
    ]);

    for (const c of fresh) {
      const name = normName(c.name);
      const dup = kept.find((k) => k.name === name && meters(k, c) < DUPLICATE_METERS);
      if (dup) {
        report.duplicates.push({ qid: c.qid, name: c.name, duplicateOf: dup.qid });
        continue;
      }
      kept.push({ name, lat: c.lat, lng: c.lng, qid: c.qid });
      toInsert.push({ ...c, ...signals.get(c.qid)!, place_id: uniquePlaceId(c.name, taken) });
    }
    toInsert.sort((a, b) => b.prominence - a.prominence);
    report.added = toInsert.map((c) => ({
      qid: c.qid,
      place_id: c.place_id,
      name: c.name,
      category: c.category,
      description: c.description,
      prominence: c.prominence,
      sitelinks: c.sitelinks,
      pageviews: c.pageviews,
    }));
  }

  if (args["rescore-all"]) {
    const rest = [...existingByQid.keys()].filter((q) => !refresh.has(q));
    const links = await fetchLinks(rest);
    const signals = await score(links);
    for (const [q, s] of signals) refresh.set(q, s);
    for (const [q, l] of links) if (l.mergedInto) merged.set(q, l.mergedInto);
    report.notFoundOnWikidata = rest.filter((q) => !links.has(q));
  }
  report.merged = [...merged].map(([from, to]) => ({ from, to, name: existingByQid.get(from)?.name }));
  report.refreshed = refresh.size;

  // 5. Save
  if (args.apply) {
    const rows = toInsert.map((c) => ({
      wikidata_qid: c.qid,
      place_id: c.place_id,
      name: c.name,
      category: c.category,
      description: c.description,
      image_url: c.image_url,
      wikipedia_url: c.wikipedia_url,
      country: c.country,
      city: args.city ?? null,
      lat: c.lat,
      lng: c.lng,
      geom: `SRID=4326;POINT(${c.lng} ${c.lat})`,
      source: "wikidata",
      sitelinks: c.sitelinks,
      pageviews: c.pageviews,
      prominence: c.prominence,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from("map_locations").insert(rows.slice(i, i + 500));
      if (error) throw new Error(`insert failed: ${error.message}`);
    }
    const failed = await updateSignals(refresh);
    if (failed) console.error(`  ${failed} prominence updates failed`);
    for (const [from, to] of merged) {
      const { error } = await supabase.from("map_locations").update({ wikidata_qid: to }).eq("wikidata_qid", from);
      if (error) console.error(`  qid ${from} -> ${to}: ${error.message}`);
    }
  }

  const tag = args.city ? slugify(args.city) : hasRegion ? `${lat}_${lng}` : "rescore";
  const file = `.tmp/map-region-${tag}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
  mkdirSync(".tmp", { recursive: true });
  writeFileSync(file, JSON.stringify(report, null, 2));

  console.log(`
  new rows:                 ${toInsert.length}${args.apply ? " (inserted)" : ""}
  rejected (closed etc.):   ${report.rejected.length}
  duplicates skipped:       ${report.duplicates.length}
  existing rows refreshed:  ${refresh.size}${args.apply ? "" : " (not written)"}
  existing rows Wikidata marks closed (review by hand): ${report.existingMarkedClosed.length}
  merged on Wikidata (qid updated):   ${merged.size}${args.apply ? "" : " (not written)"}
  not found on Wikidata (unscored):   ${report.notFoundOnWikidata.length}
  report: ${file}`);
  if (toInsert.length) {
    console.log("\n  top new rows by prominence:");
    for (const c of toInsert.slice(0, 10)) console.log(`    ${String(c.prominence).padStart(5)}  ${c.name}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
