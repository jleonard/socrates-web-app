import type { ExpressionSpecification } from "mapbox-gl";

/**
 * Which map_locations are visible at which zoom. The database only stores
 * prominence (0-100); this is the one place zoom is mapped to it, shared by
 * the map layer filter and (later) viewport loading in the loader.
 *
 * Each stop is [zoom, minimum rank]: from that zoom up, places with at least
 * that rank are shown. Mapbox collision then hides lower-ranked labels/pins
 * that would overlap.
 */
export const PROMINENCE_ZOOM_STOPS: readonly [zoom: number, minRank: number][] = [
  [0, 80], // globe: a city's one or two icons
  [5, 70], // country
  [8, 60], // region
  [10, 45], // city
  [11, 35],
  [12, 25], // district
  [13, 15],
  [14, 0], // neighborhood: everything
];

export function minProminenceForZoom(zoom: number): number {
  let min = PROMINENCE_ZOOM_STOPS[0][1];
  for (const [z, rank] of PROMINENCE_ZOOM_STOPS) if (zoom >= z) min = rank;
  return min;
}

// Mapbox only allows ["zoom"] as the input of a top-level step/interpolate,
// so the filter is a step whose outputs are the per-zoom comparisons.
export function prominenceFilter(rankProperty = "rank"): ExpressionSpecification {
  const [[, first], ...rest] = PROMINENCE_ZOOM_STOPS;
  const atLeast = (min: number) => [">=", ["get", rankProperty], min];
  return [
    "step",
    ["zoom"],
    atLeast(first),
    ...rest.flatMap(([z, min]) => [z, atLeast(min)]),
  ] as ExpressionSpecification;
}
