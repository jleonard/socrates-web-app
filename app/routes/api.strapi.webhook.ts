/**
 * Parse strapi body into the RAG
 */

import type { ActionFunctionArgs } from "react-router";
import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";

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

  console.log("authorized");

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
  let chunks: Chunk[] = [];

  switch (model) {
    case "place":
      chunks = buildPlaceChunks(entry);
      break;
    case "artwork":
      chunks = buildArtworkChunks(entry);
      break;
    case "artifact":
      chunks = buildArtifactChunks(entry);
      break;
    case "exhibition":
      chunks = buildExhibitionChunks(entry);
      break;
    case "person":
      chunks = buildPersonChunks(entry);
      break;
    case "topic":
      chunks = buildTopicChunks(entry);
      break;
    default:
      console.log(`[webhook] no handler for model: ${model}`);
      return;
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

  for (const ns of ["contextual", "global"] as const) {
    await index.namespace(ns).deleteMany({
      filter: { group_id: { $eq: groupId } },
    });
  }

  console.log(`[webhook] deleted vectors for group_id=${groupId}`);
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
    await index.namespace(ns).deleteMany({
      filter: { group_id: { $eq: groupId } },
    });

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
    metadata: {
      ...chunk.metadata,
      text: chunk.content,
    },
  }));
}

// ─── group id ─────────────────────────────────────────────────────────────────
// checked
function buildGroupId(model: string, entry: Record<string, any>): string {
  const id = entry[`${model}_id`] ?? entry.id;
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
    parent_type: model,
    parent_id: entry[`${model}_id`] ?? String(entry.id),
    place_id: entry.place?.place_id ?? null,
    // @TODO institution_id: entry.institution_id ?? null,
    language: entry.language ?? "en",
    ...extras,
  };
}

// ─── parsers ──────────────────────────────────────────────────────────────────

function parseKnowledge(
  knowledge: string | null,
  groupId: string,
  meta: Record<string, any>,
): Chunk[] {
  if (!knowledge?.trim()) return [];

  return knowledge
    .split("---")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((text, i) => {
      const isQuestion = text.startsWith("Q:");
      const chunkType = isQuestion ? "faq" : "fact";

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
        namespace:
          meta.parent_type === "topic" || meta.parent_type === "person"
            ? "global"
            : "contextual",
        metadata: { ...meta, chunk_type: chunkType },
      };
    });
}

function parseBody(
  body: string | null,
  groupId: string,
  meta: Record<string, any>,
): Chunk[] {
  if (!body?.trim()) return [];

  // split on ## headings
  return body
    .split(/^## /m)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((section) => {
      const [heading, ...lines] = section.split("\n");
      const content = lines.join("\n").trim();
      if (!content) return null;

      const headingSlug = heading.toLowerCase().replace(/\s+/g, "-");

      return {
        chunk_id: `${groupId}:body:${headingSlug}`,
        content: `${heading}\n${content}`,
        namespace:
          meta.parent_type === "topic" || meta.parent_type === "person"
            ? "global"
            : "contextual",
        metadata: {
          ...meta,
          chunk_type: "body_section",
          heading,
        },
      };
    })
    .filter(Boolean) as Chunk[];
}

// ─── place chunks ─────────────────────────────────────────────────────────────

function buildPlaceChunks(entry: Record<string, any>): Chunk[] {
  const groupId = buildGroupId("place", entry);
  const meta = buildBaseMeta("place", entry, {
    place_id: entry.place_id,
    place_type: entry.place_type,
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
      entry.place_type,
      entry.description,
    ]
      .filter(Boolean)
      .join("\n"),
    metadata: { ...meta, chunk_type: "identity" },
  });

  // body sections
  chunks.push(...parseBody(entry.body, groupId, meta));

  // knowledge (facts + faqs)
  chunks.push(...parseKnowledge(entry.knowledge, groupId, meta));

  return chunks;
}

// ─── artwork chunks ───────────────────────────────────────────────────────────

function buildArtworkChunks(entry: Record<string, any>): Chunk[] {
  const groupId = buildGroupId("artwork", entry);
  const meta = buildBaseMeta("artwork", entry, {
    artwork_id: entry.artwork_id,
    artwork_type: entry.artwork_type,
    place_id: entry.place?.place_id ?? null,
    on_loan: entry.on_loan ?? false,
    floor_number: entry.location?.floor_number ?? null,
    centroid_lat: entry.location?.centroid_lat ?? null,
    centroid_lng: entry.location?.centroid_lng ?? null,
  });

  const chunks: Chunk[] = [];

  // resolve attributions
  const attributions = (entry.attributions ?? [])
    .map((a: any) => {
      const name = a.person?.name ?? a.name_text ?? "Unknown";
      return `${name} (${a.role})`;
    })
    .join(", ");

  // identity chunk
  chunks.push({
    chunk_id: `${groupId}:identity`,
    namespace: "contextual",
    content: [
      entry.title,
      entry.alternate_titles?.length
        ? `Also known as: ${entry.alternate_titles.join(", ")}`
        : null,
      attributions ? `By: ${attributions}` : null,
      entry.date,
      entry.medium,
      entry.artwork_type,
      entry.description,
    ]
      .filter(Boolean)
      .join("\n"),
    metadata: { ...meta, chunk_type: "identity" },
  });

  // visual description chunk
  if (entry.visual_description) {
    chunks.push({
      chunk_id: `${groupId}:visual`,
      namespace: "contextual",
      content: entry.visual_description,
      metadata: { ...meta, chunk_type: "visual_description" },
    });
  }

  // style chunk
  if (entry.style_tags?.length || entry.movements?.length || entry.period) {
    chunks.push({
      chunk_id: `${groupId}:style`,
      namespace: "contextual",
      content: [
        entry.title,
        entry.period ? `Period: ${entry.period}` : null,
        entry.movements?.length
          ? `Movements: ${entry.movements.join(", ")}`
          : null,
        entry.style_tags?.length
          ? `Style: ${entry.style_tags.join(", ")}`
          : null,
        entry.medium ? `Medium: ${entry.medium}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      metadata: { ...meta, chunk_type: "style" },
    });
  }

  // subject chunk
  if (entry.subject_tags?.length || entry.dominant_colors?.length) {
    chunks.push({
      chunk_id: `${groupId}:subject`,
      namespace: "contextual",
      content: [
        entry.title,
        entry.subject_tags?.length
          ? `Subject: ${entry.subject_tags.join(", ")}`
          : null,
        entry.dominant_colors?.length
          ? `Colors: ${entry.dominant_colors.join(", ")}`
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
      metadata: { ...meta, chunk_type: "subject" },
    });
  }

  // body sections
  chunks.push(...parseBody(entry.body, groupId, meta));

  // knowledge (facts + faqs)
  chunks.push(...parseKnowledge(entry.knowledge, groupId, meta));

  return chunks;
}

// ─── exhibition chunks ────────────────────────────────────────────────────────

function buildExhibitionChunks(entry: Record<string, any>): Chunk[] {
  const groupId = buildGroupId("exhibition", entry);
  const meta = buildBaseMeta("exhibition", entry, {
    exhibition_id: entry.exhibition_id,
    place_id: entry.place?.place_id ?? null,
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

  chunks.push(...parseBody(entry.body, groupId, meta));
  chunks.push(...parseKnowledge(entry.knowledge, groupId, meta));

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

  chunks.push(...parseBody(entry.body, groupId, meta));
  chunks.push(...parseKnowledge(entry.knowledge, groupId, meta));

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
    chunk_id: `${groupId}:body`,
    namespace: "global",
    content: [
      entry.name,
      entry.aliases?.length
        ? `Also known as: ${entry.aliases.join(", ")}`
        : null,
      entry.summary,
      entry.keywords?.length ? `Keywords: ${entry.keywords.join(", ")}` : null,
      entry.body,
    ]
      .filter(Boolean)
      .join("\n"),
    metadata: { ...meta, chunk_type: "topic" },
  });

  chunks.push(...parseKnowledge(entry.knowledge, groupId, meta));

  return chunks;
}

// ─── artifact chunks ──────────────────────────────────────────────────────────
// TODO: implement when Artifact collection is defined
function buildArtifactChunks(entry: Record<string, any>): Chunk[] {
  console.log(`[webhook] artifact chunking not yet implemented id=${entry.id}`);
  return [];
}
