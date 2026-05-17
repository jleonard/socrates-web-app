import type { ActionFunctionArgs } from "react-router";
import { createHmac } from "crypto";

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

  for (const path of [...added, ...modified]) {
    const content = await getFileContent(owner, repo, ref, path);
    console.log("TODO: upsert into RAG:", path, content.slice(0, 100));
  }

  for (const path of removed) {
    console.log("TODO: delete from RAG:", path);
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
