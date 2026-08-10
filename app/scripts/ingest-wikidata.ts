/**
 * ingest-wikidata.ts
 * ------------------
 * Pulls museums, landmarks, and cultural institutions from Wikidata (NYC bounding
 * box for now) and upserts them into Supabase.
 *
 * Setup:
 *   npm install @supabase/supabase-js dotenv
 *   npm install -D tsx   // or ts-node, to run .ts files directly
 *
 *   Add to your .env file (this script loads it directly, since it runs
 *   outside your app's server process and can't use request-scoped helpers):
 *     SUPABASE_URL=https://<your-project-ref>.supabase.co
 *     SUPABASE_SECRET_KEY=...   // Settings -> API -> service_role key
 *
 * Usage:
 *   npx tsx scripts/ingest-wikidata.ts
 *
 * Re-running is safe: rows are upserted on wikidata_qid, so this can be a
 * scheduled weekly/monthly job to pick up new or updated entries.
 *
 * `geom` is computed here in the script as an EWKT string and sent directly —
 * no database trigger required.
 */

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
);

const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";

type Category = "museum" | "cultural_institution" | "landmark";

// Wikidata QIDs for the categories we want. Each maps to a category label
// used in our own `category` column. Extend this to add more types
// (e.g. Q207694 art gallery, Q23413 castle, Q16970 church building).
const CATEGORY_QIDS: Record<string, Category> = {
  Q33506: "museum",
  Q2977: "cultural_institution", // cathedral (example of a broader cultural site)
  Q4989906: "landmark", // monument
  Q570116: "landmark", // tourist attraction
  Q9259: "landmark", // UNESCO World Heritage Site
  Q1802963: "cultural_institution", // art gallery
};

const BATCH_SIZE = 2000;
const USER_AGENT = "LocationDBBot/1.0 (contact: you@example.com)"; // Wikidata asks for a real UA

interface BoundingBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

// Rough bounding box covering all five NYC boroughs.
const BBOX: BoundingBox = {
  west: -74.259,
  south: 40.477,
  east: -73.7,
  north: 40.917,
};

// Shape of a single SPARQL result binding, as returned by the Wikidata endpoint.
// Every field is optional except `item` and `coord`, since OPTIONAL clauses in
// the query may or may not be present for a given row.
interface SparqlValue {
  value: string;
}

interface SparqlBinding {
  item: SparqlValue;
  coord: SparqlValue;
  itemLabel?: SparqlValue;
  itemDescription?: SparqlValue;
  image?: SparqlValue;
  countryLabel?: SparqlValue;
  article?: SparqlValue;
}

// Shape of a row as inserted into the `locations` table.
interface LocationRow {
  wikidata_qid: string;
  name: string;
  category: Category;
  description: string | null;
  image_url: string | null;
  wikipedia_url: string | null;
  country: string | null;
  city: string | null;
  lat: number;
  lng: number;
  geom: string;
  source: "wikidata";
}

function buildQuery(qid: string, limit: number, offset: number): string {
  return `
    SELECT ?item ?itemLabel ?itemDescription ?coord ?image ?countryLabel ?article WHERE {
      ?item wdt:P31/wdt:P279* wd:${qid} .
      SERVICE wikibase:box {
        ?item wdt:P625 ?coord .
        bd:serviceParam wikibase:cornerWest "Point(${BBOX.west} ${BBOX.south})"^^geo:wktLiteral .
        bd:serviceParam wikibase:cornerEast "Point(${BBOX.east} ${BBOX.north})"^^geo:wktLiteral .
      }
      OPTIONAL { ?item wdt:P18 ?image. }
      OPTIONAL { ?item wdt:P17 ?country. }
      OPTIONAL {
        ?article schema:about ?item ;
                 schema:isPartOf <https://en.wikipedia.org/> .
      }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    LIMIT ${limit}
    OFFSET ${offset}
  `;
}

async function fetchBatch(
  qid: string,
  limit: number,
  offset: number,
): Promise<SparqlBinding[]> {
  const url = `${WIKIDATA_ENDPOINT}?query=${encodeURIComponent(buildQuery(qid, limit, offset))}&format=json`;
  const resp = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/sparql-results+json",
    },
  });
  if (!resp.ok) {
    throw new Error(
      `Wikidata request failed: ${resp.status} ${resp.statusText}`,
    );
  }
  const json = await resp.json();
  return json.results.bindings as SparqlBinding[];
}

function parseRow(row: SparqlBinding, category: Category): LocationRow | null {
  const qid = row.item.value.split("/").pop()!;
  const name = row.itemLabel?.value ?? qid;
  const description = row.itemDescription?.value ?? null;
  const imageUrl = row.image?.value ?? null;
  const country = row.countryLabel?.value ?? null;
  const wikipediaUrl = row.article?.value ?? null;

  // coord looks like "Point(lng lat)"
  const coordRaw = row.coord.value;
  const [lngStr, latStr] = coordRaw
    .replace("Point(", "")
    .replace(")", "")
    .split(" ");
  const lng = parseFloat(lngStr);
  const lat = parseFloat(latStr);

  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

  // Field names match the `locations` table columns directly.
  // `geom` is built here as an EWKT string ("SRID=4326;POINT(lng lat)") —
  // Postgres parses this directly into a `geography` value on insert,
  // no database trigger needed.
  return {
    wikidata_qid: qid,
    name,
    category,
    description,
    image_url: imageUrl,
    wikipedia_url: wikipediaUrl,
    country,
    city: null,
    lat,
    lng,
    geom: `SRID=4326;POINT(${lng} ${lat})`,
    source: "wikidata",
  };
}

async function upsertRows(rows: LocationRow[]): Promise<void> {
  if (rows.length === 0) return;

  const { error } = await supabase
    .from("locations")
    .upsert(rows, { onConflict: "wikidata_qid" });

  if (error) {
    throw new Error(`Supabase upsert failed: ${error.message}`);
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  for (const [qid, category] of Object.entries(CATEGORY_QIDS)) {
    let offset = 0;
    console.log(`--- Fetching category '${category}' (${qid}) ---`);

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const bindings = await fetchBatch(qid, BATCH_SIZE, offset);
      if (bindings.length === 0) break;

      const rows = bindings
        .map((row) => parseRow(row, category))
        .filter((row): row is LocationRow => row !== null);

      // A single item can appear more than once in one batch (e.g. it has
      // multiple images or multiple country values via the OPTIONAL clauses),
      // and ON CONFLICT DO UPDATE can't touch the same row twice in one
      // statement. Keep the first occurrence of each qid per batch.
      const deduped = Array.from(
        new Map(rows.map((row) => [row.wikidata_qid, row])).values(),
      );

      await upsertRows(deduped);
      console.log(`  offset ${offset}: upserted ${deduped.length} rows`);

      offset += BATCH_SIZE;
      await sleep(1000); // be polite to the public Wikidata endpoint
    }
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
