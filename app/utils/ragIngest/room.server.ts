/**
 * Side effects for Dropbox-defined rooms (see room.ts for the layout):
 * location_relationships rows, Redis keys the guide reads, greeting mp3s
 * and card images in S3.
 *
 * Ownership: a room is managed by Strapi OR by Dropbox, never both. Rows
 * carry `source`; Dropbox only creates, updates and deletes "dropbox" rows
 * and leaves a room alone (settings files included) while Strapi has one.
 *
 * Errors from Supabase, Redis or S3 throw, so the ingest keeps its cursor
 * and retries; content problems are the caller's to report and skip.
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPPORTED_LOCALES } from "~/utils/i18n/config";
import { getRedis } from "~/utils/redis.server";
import { deleteObjects, publicUrl, saveImageBuffer } from "~/utils/s3/s3";
import { processGreeting } from "./greeting.server";
import {
  InvalidRoomFile,
  type RoomFileKind,
  ROOM_FILE_KINDS,
  parseCardCredit,
  parseMispronunciations,
} from "./room";

export type RoomDefinition = {
  exhibitionId: string;
  placeId: string;
  name: string | null;
};

type RelationshipRow = { child_id: string | null; parent_id: string | null; source: string };

async function rowsFor(supabase: SupabaseClient, ids: string[]): Promise<RelationshipRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("location_relationships")
    .select("child_id, parent_id, source")
    .in("child_id", ids);
  if (error) throw new Error(`location_relationships lookup: ${error.message}`);
  return (data ?? []) as RelationshipRow[];
}

/**
 * Creates or updates the rows for these rooms. Returns the ids Dropbox now
 * owns, the ones it created (no row existed before), and the ones skipped
 * because Strapi defines them.
 */
export async function syncRooms(
  supabase: SupabaseClient,
  rooms: RoomDefinition[],
): Promise<{ owned: Set<string>; created: string[]; strapi: string[] }> {
  const existing = await rowsFor(supabase, rooms.map((r) => r.exhibitionId));
  const owned = new Set<string>();
  const created: string[] = [];
  const strapi: string[] = [];

  for (const room of rooms) {
    const rows = existing.filter((r) => r.child_id === room.exhibitionId);
    if (rows.some((r) => r.source !== "dropbox")) {
      strapi.push(room.exhibitionId);
      continue;
    }
    if (rows.length === 0) created.push(room.exhibitionId);

    const { error } = await supabase.from("location_relationships").upsert(
      {
        child_id: room.exhibitionId,
        parent_id: room.placeId,
        child_type: "exhibition",
        parent_type: "place",
        name: room.name ?? room.exhibitionId,
        source: "dropbox",
      },
      { onConflict: "child_id,parent_id" },
    );
    if (error) throw new Error(`room ${room.exhibitionId}: ${error.message}`);

    // moved to another place: drop the old row (only Dropbox's own)
    if (rows.some((r) => r.parent_id !== room.placeId)) {
      const { error: moveError } = await supabase
        .from("location_relationships")
        .delete()
        .eq("child_id", room.exhibitionId)
        .eq("source", "dropbox")
        .neq("parent_id", room.placeId);
      if (moveError) throw new Error(`room ${room.exhibitionId} move: ${moveError.message}`);
    }
    owned.add(room.exhibitionId);
  }
  return { owned, created, strapi };
}

/** Ids among these that have a Dropbox-owned row. */
export async function dropboxOwned(supabase: SupabaseClient, ids: string[]): Promise<Set<string>> {
  const rows = await rowsFor(supabase, [...new Set(ids)]);
  const strapi = new Set(rows.filter((r) => r.source !== "dropbox").map((r) => r.child_id));
  return new Set(
    rows
      .filter((r) => r.source === "dropbox" && !strapi.has(r.child_id))
      .map((r) => r.child_id as string),
  );
}

/**
 * Removes Dropbox-owned rooms and everything their settings files created.
 * Rooms Strapi owns are left alone. Returns the ids removed.
 */
export async function removeRooms(supabase: SupabaseClient, ids: string[]): Promise<string[]> {
  const owned = [...(await dropboxOwned(supabase, ids))];
  if (owned.length === 0) return [];
  for (const id of owned) {
    for (const kind of ROOM_FILE_KINDS) {
      // the row goes below, so card fields need no update
      if (!kind.startsWith("card_")) await clearRoomFile(supabase, kind, id);
    }
  }
  const { error } = await supabase
    .from("location_relationships")
    .delete()
    .in("child_id", owned)
    .eq("source", "dropbox");
  if (error) throw new Error(`remove rooms: ${error.message}`);
  return owned;
}

/** Content language of a place (`language:<place_id>`, from Strapi); English when unset. */
async function placeLanguage(placeId: string): Promise<string> {
  const redis = await getRedis();
  const lang = await redis.get(`language:${placeId}`);
  return typeof lang === "string" && lang.trim() ? lang.trim().toLowerCase() : "en";
}

async function updateRow(
  supabase: SupabaseClient,
  exhibitionId: string,
  fields: {
    description?: string | null;
    large_image?: string | null;
    image_credit?: string | null;
    image_credit_url?: string | null;
  },
) {
  const { error } = await supabase
    .from("location_relationships")
    .update(fields)
    .eq("child_id", exhibitionId)
    .eq("source", "dropbox");
  if (error) throw new Error(`room ${exhibitionId} card: ${error.message}`);
}

/**
 * Applies one settings file to a Dropbox-owned room. Throws InvalidRoomFile
 * on invalid content (the caller reports and skips it) and other errors on
 * infrastructure failures.
 * Returns a note when something was skipped on purpose.
 */
export async function applyRoomFile(
  supabase: SupabaseClient,
  file: { kind: RoomFileKind; exhibitionId: string; placeId: string; path: string; content: Buffer },
): Promise<string | null> {
  const { kind, exhibitionId, content, path } = file;
  const text = () => content.toString("utf-8").trim();
  const redis = await getRedis();

  switch (kind) {
    case "prompt":
      if (text()) await redis.set(`prompt:${exhibitionId}`, text());
      else await redis.del(`prompt:${exhibitionId}`);
      return null;

    case "mispronunciations": {
      let json: unknown = [];
      try {
        if (text()) json = JSON.parse(text());
      } catch {
        throw new InvalidRoomFile(`${path}: not valid JSON`);
      }
      const list = parseMispronunciations(json, path);
      if (list.length) await redis.set(`mispronunciations:${exhibitionId}`, JSON.stringify(list));
      else await redis.del(`mispronunciations:${exhibitionId}`);
      return null;
    }

    case "greeting":
      if (!text()) {
        await clearRoomFile(supabase, "greeting", exhibitionId);
        return null;
      }
      // unchanged text is a no-op inside processGreeting (fingerprint key)
      await processGreeting(text(), exhibitionId, await placeLanguage(file.placeId));
      return null;

    case "card_text":
      await updateRow(supabase, exhibitionId, { description: text() || null });
      return null;

    case "card_image": {
      const ext = path.split(".").pop()!.toLowerCase().replace("jpeg", "jpg");
      const hash = createHash("sha1").update(content).digest("hex").slice(0, 12);
      const key = `cards/${exhibitionId}-${hash}.${ext}`;
      const url = publicUrl(key);
      if (!url) return `CLOUDFRONT_URL is not set: card image for ${exhibitionId} skipped`;
      await saveImageBuffer(content, key);
      await updateRow(supabase, exhibitionId, { large_image: url });
      return null;
    }

    case "card_credit": {
      const credit = parseCardCredit(text());
      await updateRow(supabase, exhibitionId, {
        image_credit: credit.text,
        image_credit_url: credit.url,
      });
      return null;
    }
  }
}

/** Undoes one settings file (file deleted, or the room is taken over or removed). */
export async function clearRoomFile(
  supabase: SupabaseClient,
  kind: RoomFileKind,
  exhibitionId: string,
) {
  const redis = await getRedis();
  switch (kind) {
    case "prompt":
      await redis.del(`prompt:${exhibitionId}`);
      return;
    case "mispronunciations":
      await redis.del(`mispronunciations:${exhibitionId}`);
      return;
    case "greeting":
      // the app plays greetings/<id>-<locale>.mp3 directly, so remove those too
      await deleteObjects(SUPPORTED_LOCALES.map((l) => `greetings/${exhibitionId}-${l}.mp3`));
      await redis.del(`greeting:${exhibitionId}`);
      return;
    case "card_text":
      await updateRow(supabase, exhibitionId, { description: null });
      return;
    case "card_image":
      // old images stay in S3 (their keys are unique); only the link goes
      await updateRow(supabase, exhibitionId, { large_image: null });
      return;
    case "card_credit":
      await updateRow(supabase, exhibitionId, { image_credit: null, image_credit_url: null });
      return;
  }
}
