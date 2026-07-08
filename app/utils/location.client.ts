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
 * Called when the user closes the permission modal without
 * explicitly granting or denying (e.g. clicking outside it).
 */
export function resolvePendingPermission(): {
  coords: Coords | null;
  status: "granted" | "denied";
} {
  return fallbackOrDenied();
}
