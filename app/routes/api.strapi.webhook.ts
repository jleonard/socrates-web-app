/**
 * Parse strapi body into the RAG
 */
import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";
import qs from "qs";
import type { ActionFunctionArgs } from "react-router";
import { bumpContentVersions } from "~/utils/cache/content.version.server";
import { processGreeting } from "~/utils/ragIngest/greeting.server";
import { getRedis } from "~/utils/redis.server";
import { getSupabaseServiceRoleClient } from "~/utils/supabase.server";

// ─── clients ────────────────────────────────────────────────────────────────

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const index = pinecone.index("wonderway");
const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY! });

// ─── types ───────────────────────────────────────────────────────────────────

type StrapiEvent =
  | "entry.publish"
  | "entry.update"
  | "entry.unpublish"
  | "entry.delete";

type StrapiWebhookPayload = {
  event: StrapiEvent;
  model: string; // "place" | "artwork" | "artifact" | "exhibition" | "person" | "topic"
  entry: Record<string, any>;
};

type Chunk = {
  chunk_id: string;
  content: string;
  namespace: "contextual" | "global";
  metadata: Record<string, any>;
};

// ─── route action ────────────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  // verify webhook secret
  const secret = request.headers.get("x-webhook-secret");

  if (secret !== process.env.STRAPI_WEBHOOK_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload: StrapiWebhookPayload = await request.json();
  const { event, model, entry } = payload;

  console.log(
    `[webhook] ${event} on ${model} entry:`,
    JSON.stringify(entry, null, 2),
  );

  try {
    switch (event) {
      case "entry.publish":
      case "entry.update":
        await handlePublish(model, entry);
        break;

      case "entry.unpublish":
      case "entry.delete":
        await handleDelete(model, entry);
        break;
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error(
      `[webhook] error processing ${model} entry: ${JSON.stringify(entry, null, 2)}`,
      err,
    );
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }
}

// ─── publish handler ─────────────────────────────────────────────────────────

async function handlePublish(model: string, entry: Record<string, any>) {
  if (!entry.publishedAt) {
    console.log(
      `[webhook] skipping unpublished draft for ${model} id=${entry.id}`,
    );
    return;
  }

  const fullEntry = await fetchStrapiEntry(model, entry.documentId);

  await storePromptInRedis(model, fullEntry);

  console.log(
    `[strapi webhook] fetched full entry for ${model} fullEntry: ${JSON.stringify(fullEntry, null, 2)}`,
  );

  let chunks: Chunk[] = [];

  switch (model) {
    case "place":
      chunks = buildPlaceChunks(fullEntry);
      break;
    case "artwork":
      chunks = buildArtworkChunks(fullEntry);
      break;
    case "artifact":
      chunks = buildArtifactChunks(fullEntry);
      break;
    case "exhibition":
      chunks = await buildExhibitionChunks(fullEntry);
      await buildLocationRelationship(fullEntry);
      break;
    case "person":
      chunks = buildPersonChunks(fullEntry);
      break;
    case "topic":
      chunks = buildTopicChunks(fullEntry);
      break;
    default:
      console.log(`[webhook] no handler for model: ${model}`);
      return;
  }

  // save mispronunciations to redis for agent context
  if (entry?.mispronunciations) {
    const groupId = buildGroupId(model, entry);
    console.log("mispronunciations", entry.mispronunciations, groupId);
    const redis = await getRedis();
    await redis.set(
      `mispronunciations:${entry[`${model}_id`]}`,
      JSON.stringify(entry.mispronunciations),
    );
  }

  if (!chunks.length) {
    // Still clear out anything previously ingested for this entry.
    await deleteEntryVectors(model, fullEntry);
    await bumpContentVersions(locationIdsFor(model, fullEntry, chunks));
    console.log(`[webhook] no chunks produced for ${model} id=${entry.id}`);
    return;
  }

  await deleteAndReEmbed(model, fullEntry, chunks);

  // Content (and possibly the CMS prompt or mispronunciations) changed for
  // these locations: retire their cached guide answers.
  await bumpContentVersions(locationIdsFor(model, fullEntry, chunks));

  if (fullEntry?.greeting) {
    console.log("has greeting");
    try {
      await processGreeting(fullEntry.greeting, fullEntry[`${model}_id`]);
      console.log("greeing processed");
    } catch (err) {
      console.log(
        `[webhook] error processing greeting for id=${entry.id}`,
        err,
      );
    }
  }
}

// ─── delete handler ───────────────────────────────────────────────────────────

async function handleDelete(model: string, entry: Record<string, any>) {
  await deleteEntryVectors(model, entry);

  // Its content is gone, so drop it from its place too; publishing again
  // recreates the row.
  if (model === "exhibition" && entry.exhibition_id) {
    await deleteExhibitionRelationships(entry.exhibition_id);
  }

  await bumpContentVersions(locationIdsFor(model, entry, []));
}

/**
 * Location ids whose cached guide answers this entry can affect: the entry
 * itself if it is a place or exhibition, its place, and every place and
 * exhibition its chunks are tagged with.
 */
function locationIdsFor(
  model: string,
  entry: Record<string, any>,
  chunks: Chunk[],
): (string | null | undefined)[] {
  return [
    model === "place" ? entry.place_id : null,
    model === "exhibition" ? entry.exhibition_id : null,
    entry.place?.place_id,
    ...chunks.flatMap((c) => [c.metadata.place_id, c.metadata.exhibition_id]),
  ];
}

const NAMESPACES = ["contextual", "global"] as const;

/** text-embedding-3-large. Only used to build the lookup vector below. */
const EMBEDDING_DIMENSION = 3072;

/**
 * Arbitrary non-zero vector for metadata-only lookups. Pinecone queries
 * need a vector; the filter decides what matches, not similarity.
 */
const LOOKUP_VECTOR = new Array(EMBEDDING_DIMENSION).fill(0.001);

/** Pinecone's max ids per deleteMany call. */
const DELETE_BATCH = 1000;

/**
 * Deletes every vector previously ingested for a Strapi entry, in both
 * namespaces. Matches on two keys so nothing is left behind:
 *
 * 1. id prefix `${model}:${slug}:` (buildGroupId). Covers chunks written
 *    before `strapi_id` was stored in metadata.
 * 2. `strapi_id` = entry.documentId. Strapi's documentId never changes, so
 *    this catches chunks written under an OLD slug, which the prefix misses
 *    (e.g. place:mit-musuem:* after the slug was fixed to mit-museum).
 */
async function deleteEntryVectors(model: string, entry: Record<string, any>) {
  const groupId = buildGroupId(model, entry);
  const documentId: string | undefined = entry.documentId;

  for (const nsName of NAMESPACES) {
    const ns = index.namespace(nsName);
    const ids = new Set<string>();

    // 1. by id prefix
    let paginationToken: string | undefined;
    do {
      const res = await ns.listPaginated({
        prefix: `${groupId}:`,
        paginationToken,
      });
      for (const v of res.vectors ?? []) if (v.id) ids.add(v.id);
      paginationToken = res.pagination?.next;
    } while (paginationToken);

    // 2. by stable Strapi id (scoped to this model, in case ids ever collide)
    if (documentId) {
      const res = await ns.query({
        vector: LOOKUP_VECTOR,
        topK: 10000,
        includeMetadata: false,
        includeValues: false,
        filter: {
          strapi_id: { $eq: documentId },
          parent_type: { $eq: model },
        },
      });
      for (const m of res.matches) ids.add(m.id);
    }

    const all = [...ids];
    for (let i = 0; i < all.length; i += DELETE_BATCH) {
      await ns.deleteMany(all.slice(i, i + DELETE_BATCH));
    }

    if (all.length) {
      console.log(
        `[webhook] deleted ${all.length} vectors from namespace=${nsName} for group_id=${groupId} strapi_id=${documentId}`,
      );
    }
  }
}

// ─── delete + re-embed ────────────────────────────────────────────────────────

async function deleteAndReEmbed(
  model: string,
  entry: Record<string, any>,
  chunks: Chunk[],
) {
  if (!chunks.length) return;

  // group chunks by namespace
  const byNamespace = chunks.reduce(
    (acc, chunk) => {
      (acc[chunk.namespace] ??= []).push(chunk);
      return acc;
    },
    {} as Record<string, Chunk[]>,
  );

  // 1. embed everything first, so an OpenAI failure leaves the existing
  //    vectors in place instead of deleting them with nothing to replace them
  const embedded = await Promise.all(
    Object.entries(byNamespace).map(
      async ([ns, nsChunks]) => [ns, await embedChunks(nsChunks)] as const,
    ),
  );

  // 2. delete prior vectors ONCE, across both namespaces. Deleting inside
  //    the per-namespace loop would wipe vectors upserted on an earlier pass.
  await deleteEntryVectors(model, entry);

  // 3. upsert
  for (const [ns, vectors] of embedded) {
    await index.namespace(ns).upsert(vectors);
    console.log(
      `[webhook] upserted ${vectors.length} vectors to namespace=${ns} group_id=${buildGroupId(model, entry)}`,
    );
  }
}

// ─── embed ────────────────────────────────────────────────────────────────────

async function embedChunks(chunks: Chunk[]) {
  // batch embed for efficiency
  const response = await openai.embeddings.create({
    model: "text-embedding-3-large",
    input: chunks.map((c) => c.content),
  });

  return chunks.map((chunk, i) => ({
    id: chunk.chunk_id,
    values: response.data[i].embedding,
    metadata: stripNullMetadata({
      ...chunk.metadata,
      text: chunk.content,
    }),
  }));
}

// ─── group id ─────────────────────────────────────────────────────────────────

function buildGroupId(model: string, entry: Record<string, any>): string {
  const id = entry[`${model}_id`] ?? entry.documentId;
  return `${model}:${id}`;
}

// ─── base metadata ────────────────────────────────────────────────────────────

function buildBaseMeta(
  model: string,
  entry: Record<string, any>,
  extras: Record<string, any> = {},
) {
  return {
    doc_source: "strapi",
    strapi_id: entry.documentId,
    object_id: entry[`${model}_id`] ?? null,
    group_id: buildGroupId(model, entry),
    name: entry.name ?? null,
    parent_type: model,
    parent_id: entry[`${model}_id`] ?? entry.documentId ?? String(entry.id),
    // A place record has no `place` relation to itself, so use its own id.
    place_id:
      model === "place"
        ? (entry.place_id ?? null)
        : (entry.place?.place_id ?? null),
    // @TODO institution_id: entry.institution_id ?? null,
    language: entry.language ?? "en",
    scope: scopeFor(model, entry),
    ...extras,
  };
}

const SCOPES = ["venue", "object", "universal"] as const;
type Scope = (typeof SCOPES)[number];

/**
 * The entry's `scope` enum from Strapi when an editor set it; otherwise the
 * default for its content type, matching what the guide infers for
 * untagged chunks (see sectionFor in app/server/guide/prompt.server.ts):
 *   place, exhibition -> venue (about the visit)
 *   artwork, artifact -> object (about one thing on display)
 *   person, topic     -> universal (true anywhere)
 * Unknown types get "venue", the narrowest scope.
 */
function scopeFor(model: string, entry: Record<string, any>): Scope {
  if (SCOPES.includes(entry.scope)) return entry.scope;

  switch (model) {
    case "artwork":
    case "artifact":
      return "object";
    case "person":
    case "topic":
      return "universal";
    default:
      return "venue";
  }
}

// ─── aliases helper ────────────────────────────────────────────────────────────
// `aliases` is stored as a comma-separated string in Strapi (artwork, person),
// not an array — split before joining anywhere it's used for display.

function splitAliases(aliases: string | null | undefined): string[] {
  if (!aliases?.trim()) return [];
  return aliases
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
}

// ─── parsers ──────────────────────────────────────────────────────────────────

function parseTextBlock(
  textBlock: string | null,
  chunkType: string,
  groupId: string,
  namespace: "contextual" | "global",
  meta: Record<string, any>,
): Chunk[] {
  if (!textBlock?.trim()) return [];

  return textBlock
    .split("---")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((text, i) => {
      return {
        chunk_id: `${groupId}:${chunkType}:${i}`,
        content: text,
        namespace,
        metadata: { ...meta, chunk_type: chunkType },
      };
    });
}

/*
 * 'knowledge' is for short facts or FAQs. As in, common knowledge.
 */
function parseKnowledge(
  knowledge: string | null,
  groupId: string,
  namespace: "contextual" | "global",
  meta: Record<string, any>,
): Chunk[] {
  if (!knowledge?.trim()) return [];

  return knowledge
    .split("---")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((text, i) => {
      const isQuestion = text.startsWith("Q:");
      const chunkType = isQuestion ? "faq" : "factual";

      // format Q/A for embedding
      const content = isQuestion
        ? text
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .join("\n")
        : text;

      return {
        chunk_id: `${groupId}:${chunkType}:${i}`,
        content,
        namespace,
        metadata: { ...meta, chunk_type: chunkType },
      };
    });
}

function parseBody(
  body: string | null,
  groupId: string,
  namespace: "contextual" | "global",
  meta: Record<string, any>,
): Chunk[] {
  if (!body?.trim()) return [];

  return body
    .split("---")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((section, i) => {
      const heading = section.match(/^## (.+)/m)?.[1] ?? null;

      return {
        chunk_id: `${groupId}:body:${i}`,
        content: section, // keep as-is, heading and all
        namespace,
        metadata: {
          ...meta,
          chunk_type: "body_section",
          ...(heading ? { heading } : {}),
        },
      };
    });
}

// ─── place chunks ─────────────────────────────────────────────────────────────
// place schema: place_id, name, alternate_name, prompt, body, knowledge,
// location (component: blocks.location), child_place, parent_place,
// operational_info, mispronunciations, greeting

function buildPlaceChunks(entry: Record<string, any>): Chunk[] {
  const groupId = buildGroupId("place", entry);
  const meta = buildBaseMeta("place", entry, {
    // admin_zone lives inside the `location` component, not top-level
    city_id: entry.location?.admin_zone?.zone_id ?? null,
    floor_number: entry.location?.floor_number ?? null,
    // blocks.location's fields are `latitude`/`longitude`, not `centroid_lat/lng`
    centroid_lat: entry.location?.latitude ?? null,
    centroid_lng: entry.location?.longitude ?? null,
  });

  const chunks: Chunk[] = [];

  // identity chunk
  chunks.push({
    chunk_id: `${groupId}:identity`,
    namespace: "contextual",
    content: [
      entry.name,
      entry.alternate_name ? `Also known as: ${entry.alternate_name}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    metadata: { ...meta, chunk_type: "identity" },
  });

  // operational chunk (hours, tickets, accessibility, policies)
  if (entry.operational_info) {
    chunks.push(
      ...parseTextBlock(
        entry.operational_info,
        "operational",
        groupId,
        "contextual",
        meta,
      ),
    );
  }

  // body sections
  chunks.push(...parseBody(entry.body, groupId, "contextual", meta));

  // knowledge (facts + faqs)
  chunks.push(...parseKnowledge(entry.knowledge, groupId, "contextual", meta));

  return chunks;
}

// ─── artwork chunks ───────────────────────────────────────────────────────────
// artwork schema: artwork_id, name, aliases, date, medium, artwork_type,
// body, knowledge, attribution

function buildArtworkChunks(entry: Record<string, any>): Chunk[] {
  const groupId = buildGroupId("artwork", entry);
  const meta = buildBaseMeta("artwork", entry, {
    artwork_id: entry.artwork_id,
    artwork_type: entry.artwork_type,
  });

  const chunks: Chunk[] = [];
  const aliasList = splitAliases(entry.aliases);

  // identity chunk
  chunks.push({
    chunk_id: `${groupId}:identity`,
    namespace: "global",
    content: [
      entry.name,
      aliasList.length ? `Also known as: ${aliasList.join(", ")}` : null,
      entry.attribution,
      entry.date,
      entry.medium,
      entry.artwork_type,
    ]
      .filter(Boolean)
      .join("\n"),
    metadata: { ...meta, chunk_type: "identity" },
  });

  // body sections
  chunks.push(...parseBody(entry.body, groupId, "global", meta));

  // knowledge (facts + faqs)
  chunks.push(...parseKnowledge(entry.knowledge, groupId, "global", meta));

  return chunks;
}

// ─── exhibition chunks ────────────────────────────────────────────────────────
// exhibition schema: exhibition_id, name, place, greeting, prompt, body,
// knowledge, artworks (component: blocks.exhibition-item, repeatable),
// mispronunciations, card (component: blocks.detail-card)

async function buildExhibitionChunks(
  entry: Record<string, any>,
): Promise<Chunk[]> {
  console.log(
    `[webhook] building exhibition chunks for id=${entry.id} ${entry.place}`,
  );
  const groupId = buildGroupId("exhibition", entry);
  const meta = buildBaseMeta("exhibition", entry, {
    exhibition_id: entry.exhibition_id,
    floor_number: entry.place?.location?.floor_number ?? null,
  });

  const chunks: Chunk[] = [];

  // identity chunk
  chunks.push({
    chunk_id: `${groupId}:identity`,
    namespace: "contextual",
    content: [entry.name].filter(Boolean).join("\n"),
    metadata: { ...meta, chunk_type: "identity" },
  });

  // artwork placement chunks
  for (const item of entry.artworks ?? []) {
    if (!item) continue;
    const artwork = item.artwork;
    if (!artwork) continue;

    const title = artwork.name ?? artwork.title;

    chunks.push({
      chunk_id: `${groupId}:placement:${artwork.artwork_id}`,
      namespace: "contextual",
      content: [`${title} is on display at ${entry.name}.`]
        .filter(Boolean)
        .join(" "),
      metadata: {
        ...meta,
        chunk_type: "exhibition_placement",
        artwork_id: artwork.artwork_id,
      },
    });
  }

  chunks.push(...parseBody(entry.body, groupId, "contextual", meta));
  chunks.push(...parseKnowledge(entry.knowledge, groupId, "contextual", meta));

  return chunks;
}

// ─── person chunks ────────────────────────────────────────────────────────────
// person schema: person_id, name, aliases, birth_year, death_year, body, knowledge

function buildPersonChunks(entry: Record<string, any>): Chunk[] {
  const groupId = buildGroupId("person", entry);
  const meta = buildBaseMeta("person", entry, {
    person_id: entry.person_id,
  });

  const chunks: Chunk[] = [];
  const aliasList = splitAliases(entry.aliases);

  // identity chunk
  chunks.push({
    chunk_id: `${groupId}:identity`,
    namespace: "global",
    content: [
      entry.name,
      aliasList.length ? `Also known as: ${aliasList.join(", ")}` : null,
      entry.birth_year && entry.death_year
        ? `${entry.birth_year}-${entry.death_year}`
        : (entry.birth_year ?? null),
    ]
      .filter(Boolean)
      .join("\n"),
    metadata: { ...meta, chunk_type: "identity" },
  });

  chunks.push(...parseBody(entry.body, groupId, "global", meta));
  chunks.push(...parseKnowledge(entry.knowledge, groupId, "global", meta));

  return chunks;
}

// ─── topic chunks ─────────────────────────────────────────────────────────────
// topic schema: topic_id, name, body, knowledge

function buildTopicChunks(entry: Record<string, any>): Chunk[] {
  const groupId = buildGroupId("topic", entry);
  const meta = buildBaseMeta("topic", entry, {
    topic_id: entry.topic_id,
  });

  const chunks: Chunk[] = [];

  // identity chunk
  chunks.push({
    chunk_id: `${groupId}:identity`,
    namespace: "global",
    content: [entry.name].filter(Boolean).join("\n"),
    metadata: { ...meta, chunk_type: "identity" },
  });

  // NOTE: `body` on the topic content type must be a "richtext" field
  // (markdown string) for parseBody to work — change it from "blocks"
  // in Strapi and re-save existing entries before relying on this.
  chunks.push(...parseBody(entry.body, groupId, "global", meta));
  chunks.push(...parseKnowledge(entry.knowledge, groupId, "global", meta));

  return chunks;
}

// ─── artifact chunks ──────────────────────────────────────────────────────────
// artifact schema confirmed: artifact_id, name, body, knowledge
// TODO: implement when ready — left as a stub for now

function buildArtifactChunks(entry: Record<string, any>): Chunk[] {
  console.log(`[webhook] artifact chunking not yet implemented id=${entry.id}`);
  return [];
}

/**
 * When a strapi object has a prompt field
 * we store that in redis so we can pull it into the agent context when needed.
 */
async function storePromptInRedis(model: string, entry: Record<string, any>) {
  if (!entry?.prompt) return;

  const groupId = buildGroupId(model, entry);
  if (!groupId) return;

  const redis = await getRedis();

  const id = entry[`${model}_id`] ?? entry.documentId;
  if (!id) return; // nothing to key on

  try {
    await redis.set(`prompt:${id}`, entry.prompt);
  } catch (err) {
    // TODO sentry error
  }
}

/**
 * Get the full strapi entry with all relations populated.
 *
 * Populate is defined per-model because each content type only declares
 * the fields/relations it actually has — Strapi returns a 400
 * ("Invalid key ...") if you ask it to populate a field that doesn't
 * exist on that model. Do not merge these into one shared object.
 */
const PLURAL: Record<string, string> = {
  person: "people",
};

const POPULATE_BY_MODEL: Record<string, Record<string, any>> = {
  place: {
    // admin_zone is nested inside the location component, kept shallow
    // to avoid cascading into admin-zone's self-referencing parent/child relations
    location: { populate: { admin_zone: true } },
  },
  exhibition: {
    card: { populate: "*" },
    place: {
      populate: { location: { populate: { admin_zone: true } } },
    },
    artworks: { populate: { artwork: { populate: "*" } } },
  },
  artwork: {},
  person: {},
  topic: {},
  artifact: {},
};

async function fetchStrapiEntry(model: string, documentId: string) {
  const plural = PLURAL[model] ?? `${model}s`;
  const populate = POPULATE_BY_MODEL[model] ?? {};
  const hasPopulate = Object.keys(populate).length > 0;

  const query = hasPopulate
    ? `?${qs.stringify({ populate }, { encodeValuesOnly: true })}`
    : "";

  const res = await fetch(
    `${process.env.STRAPI_URL}/api/${plural}/${documentId}${query}`,
    { headers: { Authorization: `Bearer ${process.env.STRAPI_API_TOKEN}` } },
  );

  const json = await res.json();

  if (!res.ok || !json?.data) {
    console.error(
      `[fetchStrapiEntry] failed for ${model}/${documentId} status=${res.status}:`,
      JSON.stringify(json),
    );
    throw new Error(
      `Strapi fetch failed for ${model}/${documentId}: ${json?.error?.message ?? res.statusText}`,
    );
  }

  return json.data;
}

/**
 * Pinecone metadata only accepts: string, number, boolean, or string[].
 * null/undefined values, empty strings, empty arrays, and non-string arrays
 * either get rejected at upsert or silently corrupt the request — so we
 * strip/normalize them here rather than finding out at upsert time.
 */
function stripNullMetadata(metadata: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (value === null || value === undefined) continue;

    if (typeof value === "string") {
      if (value.trim() === "") continue; // empty string — nothing to filter/boost on
      result[key] = value;
      continue;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      result[key] = value;
      continue;
    }

    if (Array.isArray(value)) {
      const strArray = value.filter(
        (v) => typeof v === "string" && v.trim() !== "",
      );
      if (strArray.length === 0) continue; // empty array — drop the key entirely
      result[key] = strArray;
      continue;
    }

    // objects, dates, anything else Pinecone metadata doesn't support —
    // log it so a bad value surfaces in monitoring instead of failing
    // silently or erroring deep inside the Pinecone SDK
    console.warn(
      `[stripNullMetadata] dropping unsupported metadata value for key "${key}":`,
      value,
    );
  }

  return result;
}

async function buildLocationRelationship(entry: Record<string, any>) {
  const { supabase: supabaseAdmin } = getSupabaseServiceRoleClient();

  const childId = entry?.exhibition_id;
  const parentId = entry?.place?.place_id;

  if (childId && parentId) {
    const childType = "exhibition";
    const parentType = "place";

    let payload: any = {
      child_id: childId,
      parent_id: parentId,
      child_type: childType,
      parent_type: parentType,
    };

    if (entry?.card?.large_image) {
      payload.large_image = entry.card.large_image?.url;
    }
    if (entry?.card?.thumbnail) {
      payload.thumbnail = entry.card.thumbnail.url;
    }
    if (entry?.card?.blurb) {
      payload.description = entry.card.blurb;
    }
    if (entry?.name) {
      payload.name = entry.name;
    }

    const { error } = await supabaseAdmin
      .from("location_relationships")
      .upsert(payload, {
        onConflict: "child_id,parent_id",
      });

    if (error) {
      console.error("Failed to upsert content relationship:", error);
      throw error;
    }

    // An exhibition re-pointed to another place in Strapi would otherwise
    // keep its old row too, and readers expect one parent per child
    // (resolveLocation uses maybeSingle and fails on two). Done after the
    // upsert so a failed write never leaves the exhibition with no row.
    await deleteExhibitionRelationships(childId, parentId);
  }
}

/**
 * Deletes the exhibition's location_relationships rows, except the one
 * under keepParentId when given.
 */
async function deleteExhibitionRelationships(
  exhibitionId: string,
  keepParentId?: string,
) {
  const { supabase: supabaseAdmin } = getSupabaseServiceRoleClient();

  let query = supabaseAdmin
    .from("location_relationships")
    .delete()
    .eq("child_id", exhibitionId)
    .eq("child_type", "exhibition");

  if (keepParentId) {
    // neq alone would skip rows with a null parent_id
    query = query.or(`parent_id.neq."${keepParentId}",parent_id.is.null`);
  }

  const { error } = await query;

  if (error) {
    console.error(
      `Failed to delete location relationships for ${exhibitionId}:`,
      error,
    );
    throw error;
  }
}
