/**
 * pull.ts — stages a venue's open content for review
 * --------------------------------------------------
 * Reads manifests/<venue>/manifest.json (rooms, libraries, decisions) and
 * manifests/<venue>/pull.json (which articles and items feed what), fetches
 * the sources politely (http.ts: one request at a time per host, backoff on
 * 429/503/maxlag, on-disk cache), and writes a Dropbox-shaped tree under
 * .tmp/staging/:
 *
 *   wonderway rag/places/_<venue>/        place + rooms + venue content
 *   wonderway rag/places/_<venue>/<room folder>/<object>/   placed objects
 *   wonderway rag/places/_<venue>/objects/<object>/         on view, not in a room
 *   wonderway rag/places/_<venue>/_unassigned-objects/      objects without a room
 *
 * Room settings come from manifests/<venue>/strapi-copy.json (optional):
 * each room folder gets prompt.md, card.txt (the blurb), card.<ext> (a copy
 * of the chosen object's public-domain image) and, when pull.json sets
 * room_greetings, greeting.txt. The ingest applies them (utils/ragIngest/
 * room.ts) instead of embedding them.
 *
 * Room placement comes from manifests/<venue>/placements.json (optional):
 * { objects: { "<object_id>": { exhibition_id: "<id>" | "place", … } } }.
 *   wonderway rag/_library/<topic>/       shared libraries
 *   wonderway rag/_library/artists/<artist>/   one folder per artist (additive:
 *                                         other venues' artists are kept)
 *
 * Every folder starts with "_", so nothing is ingested until it's renamed
 * in Dropbox. Upload with upload.ts. Re-running is cheap: unchanged
 * Wikipedia revisions and archive items come from the cache.
 *
 * Usage:
 *   npx tsx app/scripts/sources/pull.ts frick
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { chunkParagraphs, fetchArchiveText } from "./archive";
import { type CommonsImage, downloadImage, fetchCommonsInfo } from "./commons";
import { politeJson, stats, USER_AGENT } from "./http";
import { type Article, fetchArticle, resolveArticles } from "./wikipedia";

const venue = process.argv[2];
if (!venue) {
  console.error("usage: npx tsx app/scripts/sources/pull.ts <venue>");
  process.exit(1);
}

const MANIFEST_DIR = join(process.cwd(), "manifests", venue);
const STAGE = join(process.cwd(), ".tmp", "staging");
const ROOT = "wonderway rag";
const PLACE_DIR = `${ROOT}/places/_${venue}`;
const LIBRARY_DIR = `${ROOT}/_library`;
const TODAY = new Date().toISOString().slice(0, 10);
/** Chunks per file: keeps each file's embedding call small and fast. */
const CHUNKS_PER_FILE = 20;

type Manifest = {
  place: { name: string; place_id: string };
  place_libraries?: string[];
  exhibitions: { id: string; name: string; room?: number | null; floor: string; folder: string; libraries: string[] }[];
  libraries: { id: string; name: string; covers: string }[];
  sources: { id: string; decision: string | null }[];
};
type PullPlan = {
  wikidata_collection: string;
  object_id_prefix: string;
  about: {
    history_articles: string[];
    archive_items: { id: string; folder: string; title: string; source_year: number }[];
  };
  libraries: Record<string, string[]>;
  /** Library that gets a biography for every artist in the collection. */
  artists_library?: string;
  /** Write greeting.txt in each room (an mp3 per language at go-live). */
  room_greetings?: boolean;
};

const manifest = JSON.parse(
  readFileSync(join(MANIFEST_DIR, "manifest.json"), "utf8"),
) as Manifest;
const plan = JSON.parse(
  readFileSync(join(MANIFEST_DIR, "pull.json"), "utf8"),
) as PullPlan;
const COPY_FILE = join(MANIFEST_DIR, "strapi-copy.json");
const roomCopy = existsSync(COPY_FILE)
  ? (JSON.parse(readFileSync(COPY_FILE, "utf8")) as {
      exhibitions: Record<
        string,
        { prompt?: string; greeting?: string; card?: { blurb: string; image_object_id?: string } }
      >;
    }).exhibitions
  : {};
const PLACEMENTS_FILE = join(MANIFEST_DIR, "placements.json");
const placements = existsSync(PLACEMENTS_FILE)
  ? (JSON.parse(readFileSync(PLACEMENTS_FILE, "utf8")) as {
      objects: Record<string, { exhibition_id: string }>;
    }).objects
  : {};

const rejected = new Set(
  manifest.sources.filter((s) => s.decision === "rejected").map((s) => s.id),
);
const report = {
  venue,
  pulled_at: new Date().toISOString(),
  user_agent: USER_AGENT,
  files: 0,
  chunks: 0,
  wikipedia_missing: [] as string[],
  images: 0,
  images_skipped: [] as string[],
  errors: [] as string[],
  skipped_rejected: [...rejected],
};

// ─── writing ────────────────────────────────────────────────────────────────

function write(path: string, content: string) {
  const full = join(STAGE, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  report.files++;
}

function writeBinary(path: string, content: Buffer) {
  const full = join(STAGE, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  report.files++;
}

const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";

function yamlValue(v: string | number) {
  return typeof v === "number" ? String(v) : JSON.stringify(v);
}

/** A text file: front matter (source details) + chunks split by "---". */
function writeText(
  path: string,
  front: Record<string, string | number>,
  chunks: string[],
) {
  const head = Object.entries(front)
    .map(([k, v]) => `${k}: ${yamlValue(v)}`)
    .join("\n");
  write(path, `---\n${head}\n---\n${chunks.join("\n\n---\n\n")}\n`);
  report.chunks += chunks.length;
}

const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

const WIKIPEDIA_FOLDER_META = {
  source_publisher: "Wikipedia",
  license: "CC BY-SA 4.0",
  source_type: "encyclopedia",
};

/**
 * Target chunk size. The reranker reads the first 2,500 characters of a
 * chunk (RERANK_MAX_CHARS in retrieval.server.ts), so pieces stay under it,
 * each repeating its "Article — Section" heading for context.
 */
const CHUNK_CHARS = 2200;

function writeArticle(folder: string, a: Article) {
  const chunks = a.sections.flatMap((s) => {
    const head = s.heading === "Overview" ? a.title : `${a.title} — ${s.heading}`;
    return chunkParagraphs(s.text, CHUNK_CHARS).map((piece) => `${head}\n\n${piece}`);
  });
  if (chunks.length === 0) return;
  writeText(
    `${folder}/${slugify(a.title)}.md`,
    {
      title: a.title,
      // repeated per file: object folders mix Wikidata and Wikipedia files
      ...WIKIPEDIA_FOLDER_META,
      source_title: `${a.title} (Wikipedia)`,
      source_url: a.permalink,
      attribution: `"${a.title}", Wikipedia contributors, CC BY-SA 4.0`,
      retrieved_at: TODAY,
      wikipedia_revision: a.revid,
    },
    chunks,
  );
}

// ─── wikipedia (one resolve pass for everything, then fetch by revision) ────

const articleCache = new Map<string, Article | null>();

async function loadArticles(titles: string[]) {
  const todo = [...new Set(titles)].filter((t) => !articleCache.has(t));
  if (todo.length === 0) return;
  const { found, missing } = await resolveArticles(todo);
  for (const t of missing) {
    articleCache.set(t, null);
    report.wikipedia_missing.push(t);
  }
  for (const ref of found) {
    try {
      articleCache.set(ref.requested, await fetchArticle(ref));
    } catch (err) {
      articleCache.set(ref.requested, null);
      report.errors.push(`wikipedia ${ref.title}: ${String(err)}`);
    }
  }
}

// ─── wikidata objects ───────────────────────────────────────────────────────

type ObjectRow = {
  qid: string;
  label: string;
  description: string | null;
  creators: string[];
  types: string[];
  materials: string[];
  inception: string | null;
  inventory: string | null;
  heightCm: number | null;
  widthCm: number | null;
  enwiki: string | null;
  /** Commons file name (Wikidata P18), without "File:". */
  image: string | null;
};

async function loadObjects(collection: string): Promise<ObjectRow[]> {
  const query = `
SELECT ?i ?label ?desc
  (GROUP_CONCAT(DISTINCT ?creatorL; separator="|") AS ?creators)
  (GROUP_CONCAT(DISTINCT ?typeL; separator="|") AS ?types)
  (GROUP_CONCAT(DISTINCT ?matL; separator="|") AS ?materials)
  (SAMPLE(?t) AS ?time) (SAMPLE(?prec) AS ?precision)
  (SAMPLE(?inv) AS ?inventory)
  (SAMPLE(?h) AS ?height) (SAMPLE(?hu) AS ?heightUnit)
  (SAMPLE(?w) AS ?width) (SAMPLE(?wu) AS ?widthUnit)
  (SAMPLE(?article) AS ?enwiki) (SAMPLE(?img) AS ?image)
WHERE {
  ?i p:P195 ?st . ?st ps:P195 wd:${collection} .
  FILTER NOT EXISTS { ?st pq:P582 ?end }
  ?i rdfs:label ?label FILTER(lang(?label) = "en")
  OPTIONAL { ?i schema:description ?desc FILTER(lang(?desc) = "en") }
  OPTIONAL { ?i wdt:P170 ?c . ?c rdfs:label ?creatorL FILTER(lang(?creatorL) = "en") }
  OPTIONAL { ?i wdt:P31 ?ty . ?ty rdfs:label ?typeL FILTER(lang(?typeL) = "en") }
  OPTIONAL { ?i wdt:P186 ?m . ?m rdfs:label ?matL FILTER(lang(?matL) = "en") }
  OPTIONAL { ?i p:P571/psv:P571 [ wikibase:timeValue ?t ; wikibase:timePrecision ?prec ] }
  OPTIONAL { ?i p:P217 ?invSt . ?invSt ps:P217 ?inv . ?invSt pq:P195 wd:${collection} }
  OPTIONAL { ?i p:P2048/psv:P2048 [ wikibase:quantityAmount ?h ; wikibase:quantityUnit ?hu ] }
  OPTIONAL { ?i p:P2049/psv:P2049 [ wikibase:quantityAmount ?w ; wikibase:quantityUnit ?wu ] }
  OPTIONAL { ?article schema:about ?i ; schema:isPartOf <https://en.wikipedia.org/> }
  OPTIONAL { ?i wdt:P18 ?img }
}
GROUP BY ?i ?label ?desc`;
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
  type B = Record<string, { value: string } | undefined>;
  const res = await politeJson<{ results: { bindings: B[] } }>(url, {
    // re-query at most once a day
    cacheKey: `wikidata:v2:${collection}:${TODAY}`,
    accept: "application/sparql-results+json",
  });
  const CM = "http://www.wikidata.org/entity/Q174728";
  const split = (v?: { value: string }) => (v?.value ? v.value.split("|").filter(Boolean) : []);
  return res.results.bindings.map((b) => ({
    qid: b.i!.value.split("/").pop()!,
    label: b.label!.value,
    description: b.desc?.value ?? null,
    creators: split(b.creators),
    types: split(b.types),
    materials: split(b.materials),
    inception: formatTime(b.time?.value, Number(b.precision?.value)),
    inventory: b.inventory?.value ?? null,
    heightCm: b.heightUnit?.value === CM ? Number(b.height!.value) : null,
    widthCm: b.widthUnit?.value === CM ? Number(b.width!.value) : null,
    enwiki: b.enwiki?.value
      ? decodeURIComponent(b.enwiki.value.split("/wiki/")[1]).replace(/_/g, " ")
      : null,
    image: b.image?.value
      ? decodeURIComponent(b.image.value.split("/Special:FilePath/")[1] ?? "").replace(/_/g, " ") || null
      : null,
  }));
}

function formatTime(value: string | undefined, precision: number): string | null {
  const year = value ? Number(/^[+-]?(\d+)/.exec(value)?.[1]) : NaN;
  if (!Number.isFinite(year)) return null;
  if (precision >= 9) return String(year);
  if (precision === 8) return `the ${Math.floor(year / 10) * 10}s`;
  if (precision === 7) {
    const c = Math.floor((year - 1) / 100) + 1;
    return `the ${c}${c % 10 === 1 && c !== 11 ? "st" : c % 10 === 2 && c !== 12 ? "nd" : c % 10 === 3 && c !== 13 ? "rd" : "th"} century`;
  }
  return null;
}

// ─── artists (creators of the collection's objects) ─────────────────────────

type ArtistRow = {
  qid: string;
  label: string;
  description: string | null;
  born: number | null;
  died: number | null;
  citizenship: string[];
  occupations: string[];
  ulan: string | null;
  enwiki: string | null;
};

/** People (Q5) credited as creator of an object in the collection. */
async function loadArtists(collection: string): Promise<ArtistRow[]> {
  type B = Record<string, { value: string } | undefined>;
  const sparql = (query: string, cacheKey: string) =>
    politeJson<{ results: { bindings: B[] } }>(
      `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`,
      { cacheKey, accept: "application/sparql-results+json" },
    );
  // 1. who: one cheap query (a single query with the details times out)
  const who = await sparql(`
SELECT DISTINCT ?c WHERE {
  ?i p:P195 ?st . ?st ps:P195 wd:${collection} .
  FILTER NOT EXISTS { ?st pq:P582 ?end }
  ?i wdt:P170 ?c . ?c wdt:P31 wd:Q5 .
}`, `wikidata:artist-ids:${collection}:${TODAY}`);
  const qids = who.results.bindings.map((b) => b.c!.value.split("/").pop()!);

  // 2. details, 50 people per query
  const split = (v?: { value: string }) => (v?.value ? v.value.split("|").filter(Boolean) : []);
  const year = (v?: { value: string }) => (v?.value ? Number(v.value) : null);
  const rows: ArtistRow[] = [];
  for (let i = 0; i < qids.length; i += 50) {
    const batch = qids.slice(i, i + 50);
    const res = await sparql(`
SELECT ?c ?label ?desc (SAMPLE(?b) AS ?born) (SAMPLE(?d) AS ?died)
  (SAMPLE(?u) AS ?ulan) (SAMPLE(?article) AS ?enwiki)
  (GROUP_CONCAT(DISTINCT ?citL; separator="|") AS ?citizenship)
  (GROUP_CONCAT(DISTINCT ?occL; separator="|") AS ?occupations)
WHERE {
  VALUES ?c { ${batch.map((q) => `wd:${q}`).join(" ")} }
  ?c rdfs:label ?label FILTER(lang(?label) = "en")
  OPTIONAL { ?c schema:description ?desc FILTER(lang(?desc) = "en") }
  OPTIONAL { ?c wdt:P569 ?bt BIND(YEAR(?bt) AS ?b) }
  OPTIONAL { ?c wdt:P570 ?dt BIND(YEAR(?dt) AS ?d) }
  OPTIONAL { ?c wdt:P245 ?u }
  OPTIONAL { ?c wdt:P27 ?cit . ?cit rdfs:label ?citL FILTER(lang(?citL) = "en") }
  OPTIONAL { ?c wdt:P106 ?occ . ?occ rdfs:label ?occL FILTER(lang(?occL) = "en") }
  OPTIONAL { ?article schema:about ?c ; schema:isPartOf <https://en.wikipedia.org/> }
}
GROUP BY ?c ?label ?desc`, `wikidata:artists:${batch.join(",")}:${TODAY}`);
    for (const b of res.results.bindings) {
      rows.push({
        qid: b.c!.value.split("/").pop()!,
        label: b.label!.value,
        description: b.desc?.value ?? null,
        born: year(b.born),
        died: year(b.died),
        citizenship: split(b.citizenship),
        occupations: split(b.occupations),
        ulan: b.ulan?.value ?? null,
        enwiki: b.enwiki?.value
          ? decodeURIComponent(b.enwiki.value.split("/wiki/")[1]).replace(/_/g, " ")
          : null,
      });
    }
  }
  return rows;
}

function lifeYears(a: ArtistRow): string {
  if (a.born && a.died) return ` (${a.born}–${a.died})`;
  if (a.born) return ` (born ${a.born})`;
  if (a.died) return ` (died ${a.died})`;
  return "";
}

/** CC0 facts about an artist, as one short chunk. */
function artistSentence(a: ArtistRow): string {
  const parts = [`${a.label}${lifeYears(a)}${a.description ? `: ${a.description}` : ""}.`];
  if (a.occupations.length) parts.push(`Occupations: ${a.occupations.slice(0, 5).join(", ")}.`);
  if (a.citizenship.length) parts.push(`Citizenship: ${a.citizenship.join(", ")}.`);
  return parts.join(" ");
}

type UlanBio = { bio: string | null; note: string | null };

/** Getty ULAN short biographies (ODC-By), 25 artists per query. */
async function loadUlan(ids: string[]): Promise<Map<string, UlanBio>> {
  const out = new Map<string, UlanBio>();
  for (let i = 0; i < ids.length; i += 25) {
    const batch = ids.slice(i, i + 25);
    const query = `
PREFIX gvp: <http://vocab.getty.edu/ontology#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX schema: <http://schema.org/>
SELECT ?s (SAMPLE(?bio) AS ?bio) (SAMPLE(?note) AS ?note) WHERE {
  VALUES ?s { ${batch.map((id) => `<http://vocab.getty.edu/ulan/${id}>`).join(" ")} }
  OPTIONAL { ?s foaf:focus/gvp:biographyPreferred/schema:description ?bio }
  OPTIONAL { ?s skos:scopeNote ?n . ?n rdf:value ?note FILTER(lang(?note) = "en") }
}
GROUP BY ?s`;
    type B = Record<string, { value: string } | undefined>;
    const res = await politeJson<{ results: { bindings: B[] } }>(
      `https://vocab.getty.edu/sparql.json?query=${encodeURIComponent(query)}`,
      { cacheKey: `ulan:${batch.join(",")}`, accept: "application/sparql-results+json" },
    );
    for (const b of res.results.bindings) {
      out.set(b.s!.value.split("/").pop()!, { bio: b.bio?.value ?? null, note: b.note?.value ?? null });
    }
  }
  return out;
}

function objectSentence(o: ObjectRow, placeName: string): string {
  const type = o.types[0] ?? "work";
  const by = o.creators.length ? ` by ${o.creators.join(" and ")}` : "";
  const when = o.inception ? `, dated ${o.inception}` : "";
  const parts = [`${o.label} is a ${type}${by}${when}.`];
  if (o.materials.length) parts.push(`Materials: ${o.materials.join(", ")}.`);
  if (o.heightCm && o.widthCm) parts.push(`Size: ${o.heightCm} × ${o.widthCm} cm (height × width).`);
  parts.push(`It is in ${placeName}${o.inventory ? `, accession number ${o.inventory}` : ""}.`);
  // skip descriptions that only repeat type and artist ("painting by Vermeer")
  const redundant =
    !o.description ||
    /^(\w+\s){0,3}by\s/i.test(o.description) ||
    o.creators.some((c) => o.description!.includes(c));
  if (!redundant) parts.push(`Wikidata describes it as: ${o.description}.`);
  return parts.join(" ");
}

// ─── run ────────────────────────────────────────────────────────────────────

async function main() {
  rmSync(join(STAGE, PLACE_DIR), { recursive: true, force: true });
  const placeName = manifest.place.name;

  // place, review copy, rooms
  write(`${PLACE_DIR}/metadata.json`, json({ place_id: manifest.place.place_id, place_name: placeName }));
  write(`${PLACE_DIR}/libraries.json`, json({ libraries: manifest.place_libraries ?? [] }));
  for (const f of ["manifest.json", "manifest.html", "pull.json", "placements.json", "strapi-copy.json"].filter((f) => existsSync(join(MANIFEST_DIR, f)))) {
    mkdirSync(join(STAGE, PLACE_DIR, "_review"), { recursive: true });
    cpSync(join(MANIFEST_DIR, f), join(STAGE, PLACE_DIR, "_review", f));
    report.files++;
  }
  for (const e of manifest.exhibitions) {
    write(`${PLACE_DIR}/${e.folder}/metadata.json`, json({ exhibition_id: e.id, exhibition_name: e.name, ...(e.room ? { room_number: e.room } : {}), floor: e.floor }));
    write(`${PLACE_DIR}/${e.folder}/libraries.json`, json({ libraries: e.libraries }));
  }

  // every Wikipedia title we need, resolved in batches of 50
  const objects = await loadObjects(plan.wikidata_collection);
  console.log(`[pull] wikidata: ${objects.length} objects`);
  const artists = plan.artists_library ? await loadArtists(plan.wikidata_collection) : [];
  if (plan.artists_library) console.log(`[pull] wikidata: ${artists.length} artists`);
  const libraryTitles = Object.values(plan.libraries).flat();
  const useWikipedia = !rejected.has("wikipedia-en");
  const objectTitles = useWikipedia ? objects.map((o) => o.enwiki).filter((t): t is string => !!t) : [];
  const artistTitles = useWikipedia ? artists.map((a) => a.enwiki).filter((t): t is string => !!t) : [];
  await loadArticles([
    ...plan.about.history_articles,
    ...libraryTitles,
    ...objectTitles,
    ...artistTitles,
  ]);
  console.log(`[pull] wikipedia: ${[...articleCache.values()].filter(Boolean).length} articles`);

  // venue content
  write(`${PLACE_DIR}/about/metadata.json`, json({ scope: "venue" }));
  write(`${PLACE_DIR}/about/history/wikipedia/metadata.json`, json(WIKIPEDIA_FOLDER_META));
  for (const t of plan.about.history_articles) {
    const a = articleCache.get(t);
    if (a) writeArticle(`${PLACE_DIR}/about/history/wikipedia`, a);
  }

  for (const item of plan.about.archive_items) {
    try {
      const doc = await fetchArchiveText(item.id);
      const folder = `${PLACE_DIR}/about/${item.folder}`;
      write(`${folder}/metadata.json`, json({
        source_publisher: "Internet Archive (public domain)",
        license: "Public domain (US)",
        source_type: "historical",
        source_year: item.source_year,
      }));
      const chunks = chunkParagraphs(doc.text, CHUNK_CHARS).map((c) => `${item.title}\n\n${c}`);
      for (let i = 0; i < chunks.length; i += CHUNKS_PER_FILE) {
        const part = String(i / CHUNKS_PER_FILE + 1).padStart(2, "0");
        writeText(`${folder}/part-${part}.md`, {
          title: item.title,
          source_title: item.title,
          source_url: doc.url,
          attribution: `${item.title}, public domain, via Internet Archive`,
          retrieved_at: TODAY,
        }, chunks.slice(i, i + CHUNKS_PER_FILE));
      }
      console.log(`[pull] archive ${item.id}: ${chunks.length} chunks`);
    } catch (err) {
      report.errors.push(`archive ${item.id}: ${String(err)}`);
    }
  }

  // collection overview, written from the open data
  const byArtist = new Map<string, number>();
  for (const o of objects) for (const c of o.creators) byArtist.set(c, (byArtist.get(c) ?? 0) + 1);
  const topArtists = [...byArtist].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([n]) => n);
  const floors = [...new Set(manifest.exhibitions.map((e) => e.floor))];
  const libName = new Map(manifest.libraries.map((l) => [l.id, l]));
  writeText(`${PLACE_DIR}/about/collection-overview/overview.md`, {
    title: `${placeName}: collection overview`,
    source_title: `${placeName} collection overview`,
    source_publisher: "Wonderway",
    license: "Wonderway (written for this guide from open data)",
    retrieved_at: TODAY,
  }, [
    `${placeName}: what's in the collection\n\n${placeName} is best known for European paintings from the Renaissance to the 19th century, shown in the rooms of Henry Clay Frick's former house alongside sculpture, furniture, porcelain and other decorative arts. Artists represented include ${topArtists.join(", ")}.`,
    ...floors.map((floor) => {
      const rooms = manifest.exhibitions.filter((e) => e.floor === floor);
      return `${placeName}: rooms on the ${floor.toLowerCase()}\n\n` + rooms.map((r) => {
        const topics = r.libraries.map((id) => libName.get(id)?.name).filter(Boolean);
        return `${r.name}${topics.length ? `: ${topics.join(", ")}` : ""}.`;
      }).join("\n");
    }),
  ]);

  // Commons images (one per object, Wikidata P18), license checked first
  const images = rejected.has("commons")
    ? new Map<string, CommonsImage>()
    : await fetchCommonsInfo(objects.map((o) => o.image).filter((f): f is string => !!f));

  // objects: in their room folder when placements.json places them
  const roomFolder = new Map(manifest.exhibitions.map((e) => [e.id, e.folder]));
  const placed = { room: 0, place: 0, unassigned: 0 };
  const objectFolder = new Map<string, string>();
  for (const o of objects) {
    const objectId = `${plan.object_id_prefix}${o.inventory ?? o.qid}`;
    const target = placements[objectId]?.exhibition_id;
    const parent =
      target === "place"
        ? `${PLACE_DIR}/objects`
        : target && roomFolder.has(target)
          ? `${PLACE_DIR}/${roomFolder.get(target)}`
          : `${PLACE_DIR}/_unassigned-objects`;
    if (target && target !== "place" && !roomFolder.has(target)) {
      report.errors.push(`placements.json: ${objectId} → unknown exhibition ${target}`);
    }
    placed[target === "place" ? "place" : target && roomFolder.has(target) ? "room" : "unassigned"]++;
    const folder = `${parent}/${slugify(o.label)}-${o.inventory ? slugify(o.inventory) : o.qid.toLowerCase()}`;
    objectFolder.set(objectId, folder);
    write(`${folder}/metadata.json`, json({
      object_id: objectId,
      object_name: o.label,
      object_type: o.types[0] ?? "artwork",
      ...(o.creators.length ? { artist: o.creators.join(", ") } : {}),
      scope: "object",
    }));
    writeText(`${folder}/wikidata.md`, {
      title: o.label,
      source_title: `${o.label} (Wikidata ${o.qid})`,
      source_url: `https://www.wikidata.org/wiki/${o.qid}`,
      source_publisher: "Wikidata",
      license: "CC0",
      retrieved_at: TODAY,
      wikidata: o.qid,
    }, [objectSentence(o, placeName)]);
    const a = o.enwiki ? articleCache.get(o.enwiki) : null;
    if (a) writeArticle(folder, a);
    if (o.image) await writeImage(folder, o, images.get(o.image));
  }
  console.log(`[pull] placed: ${JSON.stringify(placed)}`);

  // room settings: prompt, optional greeting, card blurb + image
  let cards = 0;
  for (const e of manifest.exhibitions) {
    const copy = roomCopy[e.id];
    if (copy?.prompt) write(`${PLACE_DIR}/${e.folder}/prompt.md`, `${copy.prompt}\n`);
    if (plan.room_greetings && copy?.greeting) {
      write(`${PLACE_DIR}/${e.folder}/greeting.txt`, `${copy.greeting}\n`);
    }
    const card = copy?.card;
    if (!card) continue;
    write(`${PLACE_DIR}/${e.folder}/card.txt`, `${card.blurb}\n`);
    cards++;
    if (!card.image_object_id) continue;
    const src = objectFolder.get(card.image_object_id);
    const visionDir = src ? join(STAGE, src, "vision") : null;
    const image = visionDir && existsSync(visionDir)
      ? readdirSync(visionDir).find((f) => /\.(jpe?g|png|webp)$/i.test(f))
      : undefined;
    if (!visionDir || !image) {
      report.errors.push(`card ${e.id}: no staged image for ${card.image_object_id}`);
      continue;
    }
    const ext = image.split(".").pop()!.toLowerCase().replace("jpeg", "jpg");
    cpSync(join(visionDir, image), join(STAGE, PLACE_DIR, e.folder, `card.${ext}`));
    report.files++;
  }
  if (cards) console.log(`[pull] room settings: ${cards} rooms${plan.room_greetings ? " (with greetings)" : ""}`);
  console.log(`[pull] objects: ${objects.length}; images: ${report.images}, skipped ${report.images_skipped.length}`);

  // shared libraries
  write(`${LIBRARY_DIR}/metadata.json`, json({ namespace: "global" }));
  for (const [libId, titles] of Object.entries(plan.libraries)) {
    const lib = libName.get(libId);
    if (!lib) {
      report.errors.push(`pull.json library ${libId} is not in manifest.json`);
      continue;
    }
    const dir = `${LIBRARY_DIR}/${libId.replace(/^lib-/, "")}`;
    write(`${dir}/metadata.json`, json({ library_id: libId, library_name: lib.name, covers: lib.covers }));
    write(`${dir}/wikipedia/metadata.json`, json(WIKIPEDIA_FOLDER_META));
    for (const t of titles) {
      const a = articleCache.get(t);
      if (a) writeArticle(`${dir}/wikipedia`, a);
    }
  }

  if (plan.artists_library) await writeArtists(plan.artists_library, artists, libraryTitles, libName);

  writeFileSync(join(STAGE, `pull-report-${venue}.json`), json({ ...report, http: stats }));
  console.log(`[pull] done: ${report.files} files, ${report.chunks} chunks; http ${JSON.stringify(stats)}`);
  if (report.wikipedia_missing.length) console.log(`[pull] missing on Wikipedia: ${report.wikipedia_missing.join("; ")}`);
  if (report.errors.length) console.log(`[pull] errors:\n  ${report.errors.join("\n  ")}`);
}

/** 2D works get the ingest's "artwork" vision prompt; the rest "artifact". */
const FLAT_TYPES = /painting|drawing|print|pastel|miniature|watercolou?r|etching|engraving|panel|fresco/i;

/**
 * The object's Commons image in <object>/vision/, where the ingest writes a
 * visual description of it. Its metadata.json carries the image's license
 * and attribution onto the description chunks.
 */
async function writeImage(
  folder: string,
  o: ObjectRow,
  img: CommonsImage | undefined,
) {
  if (!img) {
    report.images_skipped.push(`${o.label}: File:${o.image} not found on Commons`);
    return;
  }
  if (!img.free) {
    report.images_skipped.push(`${o.label}: File:${img.file} is ${img.licenseShort || img.license || "unlicensed"}`);
    return;
  }
  const ext = /\.(jpe?g|png|webp)$/i.exec(img.imageUrl)?.[1]?.toLowerCase().replace("jpeg", "jpg");
  if (!ext) {
    report.images_skipped.push(`${o.label}: File:${img.file} has no jpg/png/webp rendition`);
    return;
  }
  try {
    const bytes = await downloadImage(img);
    const flat = o.types.some((t) => FLAT_TYPES.test(t));
    write(`${folder}/vision/metadata.json`, json({
      ...(flat ? { object_type: "artwork" } : {}),
      source_title: `File:${img.file}`,
      source_url: img.pageUrl,
      source_publisher: "Wikimedia Commons",
      license: img.licenseShort || img.license,
      attribution: `${img.artist ?? "Unknown author"}, ${img.licenseShort || img.license}, via Wikimedia Commons`,
      retrieved_at: TODAY,
    }));
    writeBinary(`${folder}/vision/${slugify(o.label)}.${ext}`, bytes);
    report.images++;
  } catch (err) {
    report.errors.push(`commons ${img.file}: ${String(err)}`);
  }
}

/**
 * One folder per artist under _library/artists/: Wikidata facts (CC0) for
 * everyone, the English Wikipedia biography unless a topic library already
 * has that article, and the Getty ULAN biography (ODC-By) for artists with
 * no Wikipedia biography or only a stub (under THIN_ARTICLE_CHARS). Folders are only added or overwritten,
 * never removed, because the library is shared by every venue.
 */
async function writeArtists(
  libId: string,
  artists: ArtistRow[],
  libraryTitles: string[],
  libName: Map<string, Manifest["libraries"][number]>,
) {
  const lib = libName.get(libId);
  if (!lib) {
    report.errors.push(`pull.json artists_library ${libId} is not in manifest.json`);
    return;
  }
  const dir = `${LIBRARY_DIR}/${libId.replace(/^lib-/, "")}`;
  write(`${dir}/metadata.json`, json({ library_id: libId, library_name: lib.name, covers: lib.covers }));

  // canonical titles already staged in a topic library (redirects resolved)
  const inTopics = new Set(
    libraryTitles.map((t) => articleCache.get(t)?.title).filter((t): t is string => !!t),
  );
  const THIN_ARTICLE_CHARS = 1500;
  const articleChars = (a: ArtistRow) => {
    const art = a.enwiki ? articleCache.get(a.enwiki) : null;
    return art ? art.sections.reduce((n, s) => n + s.text.length, 0) : 0;
  };
  const needsUlan = artists.filter((a) => articleChars(a) < THIN_ARTICLE_CHARS);
  const ulan = await loadUlan(
    needsUlan.map((a) => a.ulan).filter((u): u is string => !!u),
  );

  const counts = { artists: 0, wikipedia: 0, in_topic_library: 0, ulan: 0, facts_only: 0 };
  for (const a of artists) {
    const folder = `${dir}/${slugify(a.label)}-${a.qid.toLowerCase()}`;
    write(`${folder}/metadata.json`, json({ artist: a.label, artist_wikidata: a.qid }));
    writeText(`${folder}/wikidata.md`, {
      title: a.label,
      source_title: `${a.label} (Wikidata ${a.qid})`,
      source_url: `https://www.wikidata.org/wiki/${a.qid}`,
      source_publisher: "Wikidata",
      license: "CC0",
      retrieved_at: TODAY,
      wikidata: a.qid,
    }, [artistSentence(a)]);
    counts.artists++;

    const article = a.enwiki ? articleCache.get(a.enwiki) : null;
    if (article && inTopics.has(article.title)) {
      counts.in_topic_library++;
    } else if (article) {
      writeArticle(folder, article);
      counts.wikipedia++;
    }
    const u = a.ulan && articleChars(a) < THIN_ARTICLE_CHARS ? ulan.get(a.ulan) : undefined;
    // scope notes can be curator scraps ("Comment on works: Religious?")
    const note = u?.note && u.note.length >= 60 ? u.note : null;
    const text = [u?.bio && `${a.label}: ${u.bio}.`, note].filter(Boolean).join("\n\n");
    if (text) {
      writeText(`${folder}/ulan.md`, {
        title: a.label,
        source_title: `${a.label} (Getty ULAN ${a.ulan})`,
        source_url: `http://vocab.getty.edu/page/ulan/${a.ulan}`,
        source_publisher: "Getty Union List of Artist Names",
        license: "ODC-By 1.0",
        attribution: "Getty Union List of Artist Names (ULAN), J. Paul Getty Trust, ODC-By 1.0",
        source_type: "reference",
        retrieved_at: TODAY,
      }, [text]);
      counts.ulan++;
    } else if (!article) {
      counts.facts_only++;
    }
  }
  console.log(`[pull] artists: ${JSON.stringify(counts)}`);
  Object.assign(report, { artists: counts });
}

main().catch((err) => {
  console.error("[pull] stopped:", err);
  console.error("Re-run to resume: finished requests are cached.");
  process.exit(1);
});
