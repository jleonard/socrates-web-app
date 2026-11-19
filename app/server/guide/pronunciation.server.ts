import { getRedis } from "~/utils/redis.server";

/**
 * Fixes speech-to-text mishearings in a visitor's query using the
 * mispronunciation dictionaries managed in Strapi (saved to Redis as
 * `mispronunciations:<id>` by api.strapi.webhook.ts).
 *
 * Replaces app/server/agent/mispronounciations.ts for the guide webhook:
 * - one Redis round trip for every dictionary (mGet)
 * - earlier ids win when the same alias appears in more than one dictionary,
 *   so pass the most specific first: [exhibitionId, placeId]
 * - Unicode-aware word boundaries, so accented aliases match (JS `\b` only
 *   knows ASCII letters)
 * - a single pass, so a correction is never re-corrected by another alias
 * - never throws: bad dictionary data is logged and skipped
 *
 * @returns the corrected query, or null if nothing changed.
 */
export async function correctPronunciations(
  ids: (string | null | undefined)[],
  query: string,
): Promise<string | null> {
  const keys = [...new Set(ids.filter(Boolean) as string[])].map(
    (id) => `mispronunciations:${id}`,
  );
  if (keys.length === 0) return null;

  try {
    const redis = await getRedis();
    const values = await redis.mGet(keys);

    // alias (lowercased) -> canonical spelling. First dictionary wins.
    const aliasToEntry = new Map<string, string>();
    values.forEach((raw, i) => {
      for (const { alias, entry } of parseDictionary(raw, keys[i])) {
        const key = alias.toLowerCase();
        if (!aliasToEntry.has(key)) aliasToEntry.set(key, entry);
      }
    });
    if (aliasToEntry.size === 0) return null;

    // Longest alias first, so multi-word aliases win over the shorter
    // aliases they contain.
    const alternation = [...aliasToEntry.keys()]
      .sort((a, b) => b.length - a.length)
      .map(escapeRegex)
      .join("|");
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{N}])(?:${alternation})(?![\\p{L}\\p{N}])`,
      "giu",
    );

    const original = query.normalize("NFC");
    const corrected = original.replace(
      pattern,
      (match) => aliasToEntry.get(match.toLowerCase()) ?? match,
    );

    return corrected === original ? null : corrected;
  } catch (err) {
    console.error("[guide] correctPronunciations failed", { keys, err });
    return null;
  }
}

/**
 * Reads one stored dictionary. api.strapi.webhook.ts stores the Strapi
 * component as a plain array, `[{ entry, aliases }]`; the wrapped shape
 * `{ mispronunciations: [...] }` is accepted too. `aliases` is a
 * newline-separated string. Skips anything malformed.
 */
function parseDictionary(
  raw: string | null,
  key: string,
): { alias: string; entry: string }[] {
  if (!raw) return [];

  let dictionary;
  try {
    dictionary = JSON.parse(raw);
  } catch {
    console.error("[guide] invalid mispronunciation JSON", { key });
    return [];
  }

  const pairs: { alias: string; entry: string }[] = [];
  const entries = Array.isArray(dictionary)
    ? dictionary
    : Array.isArray(dictionary?.mispronunciations)
      ? dictionary.mispronunciations
      : [];

  for (const item of entries) {
    if (typeof item?.entry !== "string" || typeof item?.aliases !== "string") {
      continue;
    }
    const entry = item.entry.trim().normalize("NFC");
    if (!entry) continue;

    for (const alias of item.aliases.split("\n")) {
      const trimmed = alias.trim().normalize("NFC");
      if (trimmed) pairs.push({ alias: trimmed, entry });
    }
  }
  return pairs;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
