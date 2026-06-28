/**
 * Parse strapi into redis geo data
 *
 * understanding the collections
 *
 * exhibitions:members:{exhibition_id} => set of artwork and artifact ids in the exhibition
 * exhibitions:geo:{exhibition_id} => geospatial index of artworks and artifacts in the exhibition
 * place:geo:{place_id} => geospatial index of artworks and artifacts in the place
 */

import type { ActionFunctionArgs } from "react-router";
import { getRedis } from "~/utils/redis.server";

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
    `[geo webhook] ${event} on ${model} entry:`,
    JSON.stringify(entry, null, 2),
  );

  if (model === "exhibition") {
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
        `[geo webhook] error processing ${model} entry: ${JSON.stringify(entry, null, 2)}`,
        err,
      );
      return Response.json({ error: "Processing failed" }, { status: 500 });
    }
  }
}

// ─── publish handler ─────────────────────────────────────────────────────────
async function handlePublish(model: string, entry: Record<string, any>) {
  if (!entry.publishedAt) {
    console.log(
      `[geo webhook] skipping unpublished draft for ${model} id=${entry.id}`,
    );
    return;
  }

  // TODO error handling please
  const fullEntry = await fetchStrapiEntry(model, entry.documentId);

  console.log(
    `[strapi geo webhook] fetched full entry for ${model} fullEntry: ${JSON.stringify(fullEntry, null, 2)}`,
  );

  if (model === "exhibition") {
    await storeGeoDataForExhibition(fullEntry);
  }
}

// ─── delete handler ───────────────────────────────────────────────────────────
async function handleDelete(model: string, entry: Record<string, any>) {
  const redis = await getRedis();

  if (model === "exhibition") {
    // get members before deleting the set
    const memberIds = (await redis.smembers(
      `exhibition:members:${entry.exhibition_id}`,
    )) as string[];

    // remove those members from the place's geo set
    if (memberIds.length > 0) {
      await redis.zrem(`place:geo:${entry.place_id}`, ...memberIds);
    }

    // now delete the membership set itself
    await redis.del(`exhibition:members:${entry.exhibition_id}`);

    // and delete the exhibition's geo set
    await redis.del(`exhibition:geo:${entry.exhibition_id}`);
  }

  if (model === "place") {
    await redis.del(`place:geo:${entry.place_id}`);
  }
}

async function storeGeoDataForExhibition(entry: Record<string, any>) {
  const redis = await getRedis();

  // clear prior geo data for this exhibition's artworks and artifacts

  // exhibition:geo stores geo coorindates for all the art and artiracts in the exhibition.
  await redis.del(`exhibition:geo:${entry.exhibition_id}`);

  // exhibition:members is a set of art and artifact ids only. no geo.
  await redis.del(`exhibition:members:${entry.exhibition_id}`);

  const memberIds: string[] = [];

  for (const item of entry.artworks ?? []) {
    const artwork = item.artwork;
    if (!artwork) continue;
    memberIds.push(artwork.artwork_id);

    // add to geo index if we have coordinates
    if (item?.latitude && item?.longitude) {
      if (entry?.exhibition_id) {
        // add to exhibit
        await redis.geoadd(
          `exhibition:geo:${entry.exhibition_id}`,
          item.longitude,
          item.latitude,
          artwork.artwork_id,
        );
      }
      if (entry?.place_id) {
        // add to place
        await redis.geoadd(
          `place:geo:${entry.place_id}`,
          item.longitude,
          item.latitude,
          artwork.artwork_id,
        );
      }
    }
  }

  for (const item of entry.artifacts ?? []) {
    const artifact = item.artifact;
    if (!artifact) continue;
    memberIds.push(artifact.artifact_id);
    // add to geo index if we have coordinates
    if (item?.latitude && item?.longitude) {
      if (entry?.exhibition_id) {
        // add to exhibition
        await redis.geoadd(
          `exhibition:geo:${entry.exhibition_id}`,
          item.longitude,
          item.latitude,
          artifact.artifact_id,
        );
      }
      if (entry?.place_id) {
        // add to place
        await redis.geoadd(
          `place:geo:${entry.place_id}`,
          item.longitude,
          item.latitude,
          artifact.artifact_id,
        );
      }
    }
  }

  // store exhibition members in a set for easy retrieval later
  const uniqueMembers = [...new Set(memberIds)];
  await redis.sadd(
    `exhibition:members:${entry.exhibition_id}`,
    ...uniqueMembers,
  );
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
