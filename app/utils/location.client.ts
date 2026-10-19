/**
 * This file contains utility functions for handling location-related operations on the client side.
 */

export type Coords = { lat: number; long: number };

/**
 * Shared fallback for denial/close-without-choosing.
 * Always returns null coords — local dev behaves the same as prod,
 * no environment-specific auto-grant.
 */
function fallbackOrDenied(): {
  coords: Coords | null;
  status: "granted" | "denied";
} {
  return { coords: null, status: "denied" };
}

/**
 * One-shot fix used to seed the permission modal.
 * Accepts a cached position up to 5 min old.
 */
export function requestInitialLocation(): Promise<{
  coords: Coords | null;
  status: "granted" | "denied";
}> {
  return new Promise((resolve) => {
    // if browser doesn't support geolocation
    if (!navigator.geolocation) {
      resolve({ coords: null, status: "denied" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          coords: {
            lat: position.coords.latitude,
            long: position.coords.longitude,
          },
          status: "granted",
        }),
      () => resolve(fallbackOrDenied()),
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000, // 5 minutes
      },
    );
  });
}

/**
 * Fresh fix, no cache — used right before starting a conversation.
 * Falls back to the previously known coords if geolocation is
 * unavailable or the fresh fix fails.
 */
export function getFreshLocation(
  previous: Coords | null,
): Promise<Coords | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(previous);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          long: position.coords.longitude,
        }),
      () => resolve(previous),
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0, // force a fresh fix, don't accept cache
      },
    );
  });
}

/**
 * Last known location, kept in localStorage so any route (e.g. the map) can
 * start where the user is without asking again. Written by /app and /map.
 */
const LAST_LOCATION_KEY = "wonderway:last-location";
const LAST_LOCATION_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

export function rememberLocation(coords: Coords | null): void {
  if (!coords) return;
  try {
    localStorage.setItem(
      LAST_LOCATION_KEY,
      JSON.stringify({ ...coords, at: Date.now() }),
    );
  } catch {
    // storage blocked (private mode etc.): just don't remember
  }
}

export function getRememberedLocation(): Coords | null {
  try {
    const raw = localStorage.getItem(LAST_LOCATION_KEY);
    if (!raw) return null;
    const { lat, long, at } = JSON.parse(raw);
    if (typeof lat !== "number" || typeof long !== "number") return null;
    if (typeof at !== "number" || Date.now() - at > LAST_LOCATION_MAX_AGE) {
      return null;
    }
    return { lat, long };
  } catch {
    return null;
  }
}

/**
 * Current geolocation permission without prompting. "prompt" means asking
 * would show the browser's permission dialog.
 */
export async function getLocationPermission(): Promise<
  PermissionState | "unsupported"
> {
  if (!navigator.geolocation) return "unsupported";
  try {
    const { state } = await navigator.permissions.query({
      name: "geolocation",
    });
    return state;
  } catch {
    // Permissions API missing (older Safari): unknown, treat as "ask first"
    return "prompt";
  }
}

/**
 * Called when the user closes the permission modal without
 * explicitly granting or denying (e.g. clicking outside it).
 */
export function resolvePendingPermission(): {
  coords: Coords | null;
  status: "granted" | "denied";
} {
  return fallbackOrDenied();
}
