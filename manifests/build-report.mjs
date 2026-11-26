#!/usr/bin/env node
/**
 * Builds a venue's human-readable source report from its manifest.
 *
 *   node manifests/build-report.mjs frick
 *
 * Reads manifests/<venue>/manifest.json, embeds it in report.template.html
 * and writes manifests/<venue>/manifest.html. The output is self-contained
 * (no fetch), so the same file works as a published artifact and as the
 * copy kept in the venue's Dropbox `_review/` folder.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const venue = process.argv[2];
if (!venue) {
  console.error("usage: node manifests/build-report.mjs <venue>");
  process.exit(1);
}

const root = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(root, venue, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

for (const key of ["place", "sources", "updated"]) {
  if (!manifest[key]) throw new Error(`${manifestPath}: missing "${key}"`);
}
const ids = new Set(manifest.sources.map((s) => s.id));
const unknown = [
  ...(manifest.libraries ?? []).flatMap((l) => l.sources ?? []),
  ...(manifest.venue_content ?? []).flatMap((v) => v.sources ?? []),
  ...(manifest.outreach ?? []).map((o) => o.source),
].filter((id) => !ids.has(id));
if (unknown.length) {
  throw new Error(`Unknown source ids: ${[...new Set(unknown)].join(", ")}`);
}
const libIds = new Set((manifest.libraries ?? []).map((l) => l.id));
const unknownLibs = [
  ...(manifest.exhibitions ?? []).flatMap((e) => e.libraries ?? []),
  ...(manifest.place_libraries ?? []),
].filter((id) => !libIds.has(id));
if (unknownLibs.length) {
  throw new Error(`Unknown library ids: ${[...new Set(unknownLibs)].join(", ")}`);
}

// Optional draft copy for the Strapi entries (prompt + greeting per entry)
const copyPath = join(root, venue, "strapi-copy.json");
if (existsSync(copyPath)) manifest.strapi_copy = JSON.parse(readFileSync(copyPath, "utf8"));

const template = readFileSync(join(root, "report.template.html"), "utf8");
// "<" escaped so text in the manifest can never close the <script> tag
const json = JSON.stringify(manifest).replace(/</g, "\\u003c");
const title = `${manifest.place.name} Sources`.replace(/[<&]/g, "");
const html = template.replace("__TITLE__", title).replace("__MANIFEST__", () => json);

const out = join(root, venue, "manifest.html");
writeFileSync(out, html);
console.log(`wrote ${out}`);
