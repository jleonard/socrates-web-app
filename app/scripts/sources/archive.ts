/**
 * Internet Archive full texts (OCR). Each item's _djvu.txt is downloaded
 * once and cached; the metadata call that finds the file name is cached
 * too, since items don't change.
 */
import { politeGet, politeJson } from "./http";
import { clean } from "./wikipedia";

export type ArchiveText = {
  id: string;
  title: string;
  year: string | null;
  url: string;
  text: string;
};

export async function fetchArchiveText(id: string): Promise<ArchiveText> {
  type Meta = {
    metadata?: { title?: string; date?: string; year?: string };
    files?: { name: string }[];
  };
  const meta = await politeJson<Meta>(`https://archive.org/metadata/${id}`);
  const file = meta.files?.find((f) => f.name.endsWith("_djvu.txt"));
  if (!file) throw new Error(`No OCR text (_djvu.txt) in archive.org item ${id}`);
  const raw = await politeGet(
    `https://archive.org/download/${id}/${encodeURIComponent(file.name)}`,
  );
  return {
    id,
    title: meta.metadata?.title ?? id,
    year: meta.metadata?.year ?? meta.metadata?.date?.slice(0, 4) ?? null,
    url: `https://archive.org/details/${id}`,
    text: cleanOcr(raw),
  };
}

/** Joins hyphenated line breaks and single newlines inside paragraphs. */
function cleanOcr(raw: string): string {
  return clean(
    raw
      .replace(/\r/g, "")
      // "propor-\n tion" and "propor- \ntion": rejoin words split at line ends
      .replace(/(\w)-[ \t]*\n[ \t]*(\w)/g, "$1$2")
      .replace(/([^\n])\n(?!\n)/g, "$1 ")
      .replace(/ {2,}/g, " "),
  );
}

/** Groups paragraphs into chunks of about `size` characters. */
export function chunkParagraphs(text: string, size = 3000): string[] {
  const chunks: string[] = [];
  let current = "";
  // OCR often loses paragraph breaks: split anything too long by sentence
  const paras = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) =>
      p.length <= size ? [p] : (p.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [p]),
    )
    .map((p) => p.trim())
    // OCR debris from covers and plates ("H j ^ ^ C>:"): mostly non-letters
    .filter((p) => {
      const letters = (p.match(/\p{L}/gu) ?? []).length;
      return p.length >= 3 && letters / p.length >= 0.6;
    });
  for (const para of paras) {
    if (current && current.length + para.length > size) {
      chunks.push(current);
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
