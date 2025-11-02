// utils/wikipedia.ts
export async function fetchWikipedia(query: string): Promise<string | null> {
  try {
    // 1️⃣ Search Wikipedia for the query
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      query
    )}&format=json&utf8=1`;

    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) {
      console.error("Wikipedia search failed:", searchRes.statusText);
      return null;
    }

    const searchData = await searchRes.json();
    const topResult = searchData.query?.search?.[0];
    if (!topResult) return null;

    const title = topResult.title;

    // 2️⃣ Fetch summary for the top result
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const summaryRes = await fetch(summaryUrl);
    if (!summaryRes.ok) {
      console.error("Wikipedia summary fetch failed:", summaryRes.statusText);
      return null;
    }

    const summaryData = await summaryRes.json();
    return summaryData.extract || null;
  } catch (err) {
    console.error("Wikipedia fetch error:", err);
    return null;
  }
}
