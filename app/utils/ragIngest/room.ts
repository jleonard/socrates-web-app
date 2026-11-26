/**
 * Dropbox-defined rooms (exhibitions)
 * -----------------------------------
 * A folder whose OWN metadata.json sets `exhibition_id` is a room: the
 * ingest writes its location_relationships row (source "dropbox"), with the
 * place inherited from the folders above. Inside that folder these reserved
 * files are room settings, never embedded:
 *
 *   prompt.md               venue context for the guide (prompt:<id>)
 *   greeting.txt            spoken greeting, an mp3 per language
 *   mispronunciations.json  [{ "entry": "Fragonard", "aliases": "frago nard\nfragonard" }]
 *   card.txt                landing-page blurb (location_relationships.description)
 *   card.jpg|png|webp       landing-page image, uploaded to S3 (large_image)
 *
 * In any other folder the same names are ordinary content. Pure helpers
 * here; the side effects live in room.server.ts.
 */

export type RoomFileKind =
  | "prompt"
  | "greeting"
  | "mispronunciations"
  | "card_text"
  | "card_image";

export const ROOM_FILE_KINDS: RoomFileKind[] = [
  "prompt",
  "greeting",
  "mispronunciations",
  "card_text",
  "card_image",
];

const BY_NAME: Record<string, RoomFileKind> = {
  "prompt.md": "prompt",
  "greeting.txt": "greeting",
  "mispronunciations.json": "mispronunciations",
  "card.txt": "card_text",
};

/** The room setting a file name stands for, or null for ordinary files. */
export function roomFileKind(name: string | null | undefined): RoomFileKind | null {
  const lower = (name ?? "").toLowerCase();
  if (BY_NAME[lower]) return BY_NAME[lower];
  if (/^card\.(jpe?g|png|webp)$/.test(lower)) return "card_image";
  return null;
}

/** The exhibition id a metadata.json defines (its own content, not inherited). */
export function roomIdFromMetadata(metadata: unknown): string | null {
  const id = (metadata as Record<string, unknown> | null)?.exhibition_id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

/** A settings file whose content is invalid: report and skip, don't retry. */
export class InvalidRoomFile extends Error {}

export type Mispronunciation = { entry: string; aliases: string };

/**
 * Validates mispronunciations.json: an array (or { mispronunciations: [] })
 * of { entry, aliases } with aliases newline-separated, the shape Strapi
 * stores and pronunciation.server.ts reads. Throws on anything else.
 */
export function parseMispronunciations(json: unknown, path: string): Mispronunciation[] {
  const list = Array.isArray(json)
    ? json
    : Array.isArray((json as { mispronunciations?: unknown })?.mispronunciations)
      ? (json as { mispronunciations: unknown[] }).mispronunciations
      : null;
  if (!list) {
    throw new InvalidRoomFile(`${path}: expected an array of { "entry", "aliases" }`);
  }
  return list.map((item, i) => {
    const entry = (item as Mispronunciation)?.entry;
    const aliases = (item as Mispronunciation)?.aliases;
    if (typeof entry !== "string" || !entry.trim() || typeof aliases !== "string") {
      throw new InvalidRoomFile(`${path}: item ${i} needs a string "entry" and "aliases"`);
    }
    return { entry: entry.trim(), aliases };
  });
}
