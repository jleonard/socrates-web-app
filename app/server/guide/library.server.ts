import { LIBRARIES_FILE } from "~/utils/ragIngest/library";
import { getSupabaseServiceRoleClient } from "~/utils/supabase.server";
import type { LocationContext } from "./location.server";

/**
 * Shared libraries the guide may search at a location, from the
 * `libraries.json` rows the Dropbox ingest stores (each row carries the
 * place_id, and the exhibition_id when the file sits in an exhibition).
 *
 * - In an exhibition: the place's own list plus that exhibition's list.
 *   Other halls' libraries stay out, so Greek vase background never
 *   reaches the Egyptian wing.
 * - At the place level (no hall chosen): the place's list plus every
 *   exhibition's list, so a visitor in the lobby can ask about any topic
 *   the venue covers.
 *
 * Never throws: libraries are background, so a failed lookup means no
 * library pool for this turn (logged), not a failed answer.
 */

type Subscription = { exhibitionId: string | null; libraries: string[] };

/** Per-instance cache: subscriptions change rarely, lookups happen every turn. */
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; rows: Subscription[] }>();

export async function getLocationLibraries(
  location: LocationContext,
): Promise<string[]> {
  const rows = await subscriptionsForPlace(location.placeId);
  const ids = new Set<string>();
  for (const row of rows) {
    const applies =
      !location.exhibitionId ||
      row.exhibitionId === null ||
      row.exhibitionId === location.exhibitionId;
    if (applies) row.libraries.forEach((id) => ids.add(id));
  }
  // sorted: the list is part of the cache version key
  return [...ids].sort();
}

async function subscriptionsForPlace(placeId: string): Promise<Subscription[]> {
  const hit = cache.get(placeId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.rows;

  try {
    const { supabase } = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("dropbox_assets")
      .select("metadata")
      .eq("name", LIBRARIES_FILE)
      .eq("metadata->>place_id", placeId);
    if (error) throw new Error(error.message);

    const rows: Subscription[] = (data ?? []).map((r) => {
      const md = (r.metadata ?? {}) as Record<string, unknown>;
      return {
        exhibitionId:
          typeof md.exhibition_id === "string" ? md.exhibition_id : null,
        libraries: Array.isArray(md.libraries)
          ? md.libraries.filter((x): x is string => typeof x === "string")
          : [],
      };
    });
    cache.set(placeId, { at: Date.now(), rows });
    return rows;
  } catch (err) {
    console.error("[guide] library lookup failed", { placeId, err });
    return [];
  }
}
