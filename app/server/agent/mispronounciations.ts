import { getRedis } from "~/utils/redis.server";

export async function correctMispronunciations(
  id: string,
  query: string,
): Promise<string | null> {
  const redis = await getRedis();
  const mispronounciations = await redis.get(`mispronounciations:${id}`);
  const dictionary = mispronounciations ? JSON.parse(mispronounciations) : null;

  if (!dictionary?.mispronunciations?.length) {
    return null;
  }

  // Flatten to { alias, entry } pairs across all dictionary entries
  const flatAliases: { alias: string; entry: string }[] = [];

  for (const entry of dictionary.mispronunciations) {
    const aliasList = entry.aliases
      .split("\n")
      .map((a: string) => a.trim())
      .filter(Boolean);

    for (const alias of aliasList) {
      flatAliases.push({ alias, entry: entry.entry });
    }
  }

  // Longest alias first, so multi-word/longer matches win over shorter substrings
  flatAliases.sort((a, b) => b.alias.length - a.alias.length);

  let corrected = query;

  for (const { alias, entry } of flatAliases) {
    const pattern = new RegExp(`\\b${escapeRegex(alias)}\\b`, "gi");
    corrected = corrected.replace(pattern, entry);
  }

  console.log("correctMispronunciations", { id, query, corrected });

  return corrected === query ? null : corrected;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
