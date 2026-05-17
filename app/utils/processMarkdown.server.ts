/**
 * process markdown files with frontmatter for rag ingest
 */
import matter from "gray-matter";
import removeMarkdown from "remove-markdown";

export interface ProcessedChunk {
  text: string;
  metadata: Record<string, string>;
  index?: string;
  namespace?: string;
}

export interface ProcessResult {
  ignore: boolean;
  chunks: ProcessedChunk[];
}

export function processMarkdown(
  path: string,
  fileContent: string,
): ProcessResult {
  const { data: frontmatter, content } = matter(fileContent);

  // Check ignore flag
  if (frontmatter.ignore) {
    return { ignore: true, chunks: [] };
  }

  // Separate processing-only keys from storable metadata
  const {
    ignore: _,
    index: _index,
    namespace: _namespace,
    ...storedMetadata
  } = frontmatter;

  // Split on --- and filter empty chunks
  const chunks = content
    .split("---")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((text) => ({
      text: removeMarkdown(text).trim(),
      metadata: {
        ...storedMetadata,
        filePath: path,
      },
      index: frontmatter.index,
      namespace: frontmatter.namespace,
    }));

  return { ignore: false, chunks };
}
