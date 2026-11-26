import matter from "gray-matter";

/**
 * Shared topic library: venue-neutral content stored once and reused by any
 * place or exhibition that lists it in a `libraries.json`.
 *
 *   /wonderway rag/library/<topic>/metadata.json   {"library_id": "lib-…", …}
 *   /wonderway rag/library/<topic>/<source>/…      files (front matter per file)
 *
 * Library chunks carry `library_id` and `scope: universal`, never `place_id`
 * or `exhibition_id`, so the guide's "here"/"elsewhere" filters can't match
 * them; they're retrieved only through the library pool.
 */
export const LIBRARY_ROOT = "/wonderway rag/library";

/** Subscription file: `{"libraries": ["lib-…"]}` in a place or exhibition folder. */
export const LIBRARIES_FILE = "libraries.json";

/** Dropbox paths are compared lowercased (`path_lower`). */
export function isLibraryPath(path: string | null | undefined): boolean {
  return (path ?? "").toLowerCase().startsWith(LIBRARY_ROOT + "/");
}

/**
 * Throws when a file's merged metadata breaks the library rules, so venue
 * content can't leak into the shared pool or the reverse. Sets `scope` to
 * `universal` for library files that don't set it.
 */
export function enforceLibraryRules(
  path: string,
  metadata: Record<string, unknown>,
): void {
  if (isLibraryPath(path)) {
    if (typeof metadata.library_id !== "string" || !metadata.library_id) {
      throw new Error(`Library file without library_id: ${path}`);
    }
    for (const key of ["place_id", "exhibition_id", "object_id"]) {
      if (metadata[key] != null) {
        throw new Error(`Library file must not have ${key}: ${path}`);
      }
    }
    if (metadata.scope == null) metadata.scope = "universal";
    if (metadata.scope !== "universal") {
      throw new Error(`Library file must be scope universal: ${path}`);
    }
  } else if (metadata.library_id != null) {
    throw new Error(`library_id outside ${LIBRARY_ROOT}: ${path}`);
  }
}

/**
 * Keys a text file's front matter may set (per-file source details). Ids
 * and routing keys (place_id, library_id, index, namespace, …) stay in
 * folder metadata.json files.
 */
const FRONT_MATTER_KEYS = new Set([
  "title",
  "source_title",
  "source_url",
  "source_publisher",
  "source_type",
  "source_year",
  "license",
  "attribution",
  "retrieved_at",
  "wikipedia_revision",
  "wikidata",
]);

/**
 * Splits optional front matter off a text file. Front matter counts only
 * when the file opens with a `---` block whose keys are all allowed source
 * keys: a file that merely starts with the `---` chunk separator, or whose
 * first chunk happens to parse as YAML, is left untouched. A block mixing
 * allowed and unknown keys throws, since it was almost certainly meant as
 * front matter with a typo.
 */
export function splitFrontMatter(
  text: string,
  path: string,
): { body: string; data: Record<string, string | number> } {
  if (!/^---\r?\n/.test(text)) return { body: text, data: {} };

  let parsed: { content: string; data: unknown };
  try {
    parsed = matter(text);
  } catch {
    return { body: text, data: {} };
  }
  const raw = parsed.data;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { body: text, data: {} };
  }

  const keys = Object.keys(raw);
  const allowed = keys.filter((k) => FRONT_MATTER_KEYS.has(k));
  if (keys.length === 0 || allowed.length === 0) {
    return { body: text, data: {} };
  }
  if (allowed.length !== keys.length) {
    const unknown = keys.filter((k) => !FRONT_MATTER_KEYS.has(k));
    throw new Error(
      `Unknown front matter keys (${unknown.join(", ")}) in ${path}`,
    );
  }

  const data: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value == null) continue;
    // YAML turns 2026-11-22 into a Date; Pinecone metadata wants strings
    if (value instanceof Date) data[key] = value.toISOString().slice(0, 10);
    else if (typeof value === "number") data[key] = value;
    else data[key] = String(value);
  }
  return { body: parsed.content, data };
}

/** Validates a parsed libraries.json; returns its library ids or throws. */
export function parseLibrariesFile(json: unknown, path: string): string[] {
  const list = (json as { libraries?: unknown } | null)?.libraries;
  if (
    !Array.isArray(list) ||
    !list.every((id) => typeof id === "string" && id.startsWith("lib-"))
  ) {
    throw new Error(
      `${path}: expected {"libraries": ["lib-…", …]} (ids start with "lib-")`,
    );
  }
  return [...new Set(list as string[])];
}
