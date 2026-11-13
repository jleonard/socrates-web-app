/**
 * Place ids used in `/app?place=` links. Shared by server and client code.
 */

/** MIT Museum's exhibition (location_relationships: child of mit-museum). */
export const MIT_PLACE = "ex-ai-mind-the-gap-mit";

/**
 * Old ids still in printed links and saved sessions, mapped to the current
 * id. `mit` used to route MIT to the legacy agent and webhook; MIT now runs
 * on the default agent and the guide (Nov 2026).
 */
const PLACE_ALIASES: Record<string, string> = {
  mit: MIT_PLACE,
};

/** The current id for a place, resolving old aliases. */
export function normalizePlace(place: string): string;
export function normalizePlace(place: string | null | undefined): string | null;
export function normalizePlace(place: string | null | undefined) {
  if (!place) return null;
  return PLACE_ALIASES[place] ?? place;
}
