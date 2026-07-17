/**
 * Parse strapi body into the RAG
 */

import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";
import type { ActionFunctionArgs } from "react-router";
import { getRedis } from "~/utils/redis.server";

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
// checked
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
// checked
async function handlePublish(model: string, entry: Record<string, any>) {
  if (!entry.publishedAt) {
    console.log(
      `[webhook] skipping unpublished draft for ${model} id=${entry.id}`,
    );
    return;
  }

  // TODO error handling please
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
      // await storeGeoDataForExhibition(fullEntry);
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

  // save mispronounciations to redis for agent context
  if (entry?.mispronounciations) {
    const groupId = buildGroupId(model, entry);
    console.log("mispronounciations", entry.mispronounciations, groupId);
    const redis = await getRedis();
    await redis.set(
      `mispronounciations:${entry[`${model}_id`]}`,
      JSON.stringify(entry.mispronounciations),
    );
  }

  if (!chunks.length) {
    console.log(`[webhook] no chunks produced for ${model} id=${entry.id}`);
    return;
  }

  await deleteAndReEmbed(chunks);
}

// ─── delete handler ───────────────────────────────────────────────────────────
// checked
async function handleDelete(model: string, entry: Record<string, any>) {
  const groupId = buildGroupId(model, entry);
  await deleteByGroupId(groupId);
  console.log(`[webhook] deleted vectors for group_id=${groupId}`);
}

async function deleteByGroupId(groupId: string) {
  for (const nsName of ["contextual", "global"] as const) {
    const ns = index.namespace(nsName);
    let paginationToken: string | undefined;

    do {
      const res = await ns.listPaginated({
        prefix: `${groupId}:`,
        paginationToken,
      });
      const ids = res.vectors?.map((v) => v.id) ?? [];
      if (ids.length) await ns.deleteMany(ids);
      paginationToken = res.pagination?.next;
    } while (paginationToken);
  }
}

// ─── delete + re-embed ────────────────────────────────────────────────────────

async function deleteAndReEmbed(chunks: Chunk[]) {
  if (!chunks.length) return;

  // group chunks by namespace
  const byNamespace = chunks.reduce(
    (acc, chunk) => {
      (acc[chunk.namespace] ??= []).push(chunk);
      return acc;
    },
    {} as Record<string, Chunk[]>,
  );

  for (const [ns, nsChunks] of Object.entries(byNamespace)) {
    const groupId = nsChunks[0].metadata.group_id;

    // 1. delete prior vectors for this group in this namespace
    await deleteByGroupId(groupId);

    // 2. embed all chunks
    const vectors = await embedChunks(nsChunks);

    // 3. upsert to Pinecone
    await index.namespace(ns).upsert(vectors);

    console.log(
      `[webhook] upserted ${vectors.length} vectors to namespace=${ns} group_id=${groupId}`,
    );
  }
}

// ─── embed ────────────────────────────────────────────────────────────────────
// checked
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
// checked
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
    group_id: buildGroupId(model, entry),
    name: entry.name ?? null,
    parent_type: model,
    parent_id: entry[`${model}_id`] ?? entry.documentId ?? String(entry.id),
    place_id: entry.place?.place_id ?? null,
    // @TODO institution_id: entry.institution_id ?? null,
    language: entry.language ?? "en",
    ...extras,
  };
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

function buildPlaceChunks(entry: Record<string, any>): Chunk[] {
  const groupId = buildGroupId("place", entry);
  const meta = buildBaseMeta("place", entry, {
    city_id: entry.admin_zone?.zone_id ?? null,
    floor_number: entry.location?.floor_number ?? null,
    centroid_lat: entry.location?.centroid_lat ?? null,
    centroid_lng: entry.location?.centroid_lng ?? null,
  });

  const chunks: Chunk[] = [];

  // identity chunk
  chunks.push({
    chunk_id: `${groupId}:identity`,
    namespace: "contextual",
    content: [
      entry.name,
      entry.short_name ? `Also known as: ${entry.short_name}` : null,
      entry.aliases?.length ? `Aliases: ${entry.aliases.join(", ")}` : null,
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

function buildArtworkChunks(entry: Record<string, any>): Chunk[] {
  const groupId = buildGroupId("artwork", entry);
  const meta = buildBaseMeta("artwork", entry, {
    artwork_id: entry.artwork_id,
    artwork_type: entry.artwork_type,
  });

  const chunks: Chunk[] = [];

  // identity chunk
  chunks.push({
    chunk_id: `${groupId}:identity`,
    namespace: "global",
    content: [
      entry.name,
      entry.aliases?.length
        ? `Also known as: ${entry.aliases.join(", ")}`
        : null,
      entry.attribution,
      entry.date,
      entry.medium,
      entry.artwork_type,
    ]
      .filter(Boolean)
      .join("\n"),
    metadata: { ...meta, chunk_type: "identity" },
  });

  // text blocks with --- separators
  if (entry.visual_description) {
    chunks.push(
      ...parseTextBlock(
        entry.visual_description,
        "visual",
        groupId,
        "global",
        meta,
      ),
    );
  }

  // body sections
  chunks.push(...parseBody(entry.body, groupId, "global", meta));

  // knowledge (facts + faqs)
  chunks.push(...parseKnowledge(entry.knowledge, groupId, "global", meta));

  return chunks;
}

// ─── exhibition chunks ────────────────────────────────────────────────────────

async function buildExhibitionChunks(
  entry: Record<string, any>,
): Promise<Chunk[]> {
  const groupId = buildGroupId("exhibition", entry);
  const meta = buildBaseMeta("exhibition", entry, {
    exhibition_id: entry.exhibition_id,
    is_current: entry.is_current ?? true,
    floor_number: entry.place?.location?.floor_number ?? null,
  });

  const chunks: Chunk[] = [];

  // identity chunk
  chunks.push({
    chunk_id: `${groupId}:identity`,
    namespace: "contextual",
    content: [
      entry.name,
      entry.exhibition_type,
      entry.description,
      entry.starts_at ? `Opens: ${entry.starts_at}` : null,
      entry.ends_at ? `Closes: ${entry.ends_at}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    metadata: { ...meta, chunk_type: "identity" },
  });

  // artwork placement chunks
  for (const item of entry.artworks ?? []) {
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

function buildPersonChunks(entry: Record<string, any>): Chunk[] {
  const groupId = buildGroupId("person", entry);
  const meta = buildBaseMeta("person", entry, {
    person_id: entry.person_id,
  });

  const chunks: Chunk[] = [];

  chunks.push({
    chunk_id: `${groupId}:identity`,
    namespace: "global",
    content: [
      entry.name,
      entry.aliases?.length
        ? `Also known as: ${entry.aliases.join(", ")}`
        : null,
      entry.nationality,
      entry.birth_year && entry.death_year
        ? `${entry.birth_year}–${entry.death_year}`
        : (entry.birth_year ?? null),
      entry.bio,
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

function buildTopicChunks(entry: Record<string, any>): Chunk[] {
  const groupId = buildGroupId("topic", entry);
  const meta = buildBaseMeta("topic", entry, {
    topic_id: entry.topic_id,
    topic_type: entry.topic_type,
  });

  const chunks: Chunk[] = [];

  chunks.push({
    chunk_id: `${groupId}:identity`,
    namespace: "global",
    content: [
      entry.name,
      entry.aliases?.length
        ? `Also known as: ${entry.aliases.join(", ")}`
        : null,
      entry.summary,
      entry.keywords?.length ? `Keywords: ${entry.keywords.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    metadata: { ...meta, chunk_type: "identity" },
  });

  chunks.push(...parseBody(entry.body, groupId, "global", meta));
  chunks.push(...parseKnowledge(entry.knowledge, groupId, "global", meta));

  return chunks;
}

// ─── artifact chunks ──────────────────────────────────────────────────────────
// TODO: implement when Artifact collection is defined
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
 */
const PLURAL: Record<string, string> = {
  person: "people",
};
async function fetchStrapiEntry(model: string, documentId: string) {
  const plural = PLURAL[model] ?? `${model}s`;
  const res = await fetch(
    `${process.env.STRAPI_URL}/api/${plural}/${documentId}?populate=*`,
    { headers: { Authorization: `Bearer ${process.env.STRAPI_API_TOKEN}` } },
  );
  const { data } = await res.json();
  return data;
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
