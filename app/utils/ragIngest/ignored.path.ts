/**
 * True when any folder or file in a Dropbox path starts with "_" (e.g.
 * `/wonderway rag/places/_frick/...` or `.../_review/manifest.json`).
 *
 * Those are staging and review areas that are never ingested. Renaming
 * `_frick` to `frick` publishes it (Dropbox reports the new paths as added
 * files), and renaming a live folder to `_name` unpublishes it (the old
 * paths arrive as deletions, which remove their vectors).
 */
export function isIgnoredPath(path: string | null | undefined): boolean {
  return (path ?? "").split("/").some((part) => part.startsWith("_"));
}
