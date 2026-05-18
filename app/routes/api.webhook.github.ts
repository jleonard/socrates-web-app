import type { ActionFunctionArgs } from "react-router";
import { createHmac } from "crypto";
import { deleteByMetadata, upsertChunk } from "~/utils/pinecone";
import { processMarkdown } from "~/utils/processMarkdown.server";

export async function action({ request }: ActionFunctionArgs) {
  // Verify it's actually from GitHub
  const signature = request.headers.get("x-hub-signature-256");
  const rawBody = await request.text();
  const expected =
    "sha256=" +
    createHmac("sha256", process.env.GITHUB_WEBHOOK_SECRET!)
      .update(rawBody)
      .digest("hex");

  if (signature !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = JSON.parse(rawBody);
  const commits = body.commits ?? [];

  const owner = body.repository.owner.login;
  const repo = body.repository.name;
  const ref = body.after;

  const added = commits.flatMap((c: any) => c.added);
  const modified = commits.flatMap((c: any) => c.modified);
  const removed = commits.flatMap((c: any) => c.removed);

  const isMd = (path: string) => path.endsWith(".md");

  await Promise.all(
    [...added, ...modified].filter(isMd).map(async (path) => {
      const content = await getFileContent(owner, repo, ref, path);
      const { ignore, chunks } = processMarkdown(path, content);
      if (ignore) return;
      await deleteByMetadata("mit-rag", "filePath", path);
      await deleteByMetadata("wonderway", "filePath", path);
      await Promise.all(
        chunks.map((chunk) =>
          upsertChunk(chunk.text, chunk.metadata, chunk.index, chunk.namespace),
        ),
      );
    }),
  );

  for (const path of removed.filter(isMd)) {
    console.log("TODO: delete from RAG:", path);

    // TODO remove this after retiring the mit-rag
    await deleteByMetadata("mit-rag", "filePath", path);
    await deleteByMetadata("wonderway", "filePath", path);
  }

  return new Response("OK", { status: 200 });
}

async function getFileContent(
  owner: string,
  repo: string,
  ref: string,
  path: string,
) {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  return res.text();
}
