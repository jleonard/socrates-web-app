// TEMPORARY: retrieval eval harness. Delete after calibrating RERANK_MIN.
// Run locally: npm run dev, then open
//   http://localhost:5173/api/eval-retrieval?token=<EVAL_TOKEN>
// Optional params:
//   &ids=4260,4262   run a subset
//   &c=1             concurrency (default 4; use 1 to rule out rate limits)
//   &topn=20         how many reranked chunks to return per case (default 20)
//   &scope=hall      filter to the hall only (default: hall OR whole museum,
//                    which is what the webhook does today)
import { Pinecone } from "@pinecone-database/pinecone";
import type { LoaderFunctionArgs } from "react-router";
import { rewriteQuery } from "~/server/agent/query.rewrite.server";
import { retrieve } from "~/server/agent/rag.retrieve";
import { getQueryEmbedding } from "~/utils/pinecone";

/**
 * expect:
 *   string[] -> any of these object_ids should be reranked >= MIN_HIT_SCORE
 *   null     -> the corpus has no direct answer; `kind` says how close the topic is:
 *     "clean"   -> unrelated to the corpus (the scores here set the junk ceiling)
 *     "related" -> corpus has topically related chunks that don't answer the
 *                  question. A threshold can't fix these; the prompt rule must.
 */
type Case = {
  id: number;
  query: string;
  expect: string[] | null;
  kind?: "clean" | "related";
};

/** A chunk only counts as a hit if the reranker gave it at least this score. */
const MIN_HIT_SCORE = 0.1;

const cases: Case[] = [
  {
    id: 4256,
    query:
      "Con un esqueleto de mamut y un esqueleto de mastodonte frente a la persona, ¿en qué museo o exposición podría estar y qué puede ver allí?",
    expect: [
      "amnh-hall-of-advanced-mammals",
      "ex-hall-of-advanced-mammals-artifact-warren-mastadon",
    ],
  },
  {
    id: 4257,
    query:
      "¿Cuál es la diferencia entre un mamut y un mastodonte? Explica rasgos clave y cómo distinguir sus esqueletos y colmillos, de forma breve.",
    expect: ["ex-hall-of-advanced-mammals-article-mammoth-or-mastadon"],
  },
  {
    id: 4259,
    query:
      "¿De dónde provienen específicamente los ejemplares de mamut y mastodonte expuestos en la Sala de Mamíferos Avanzados del Museo Americano de Historia Natural? Lugares de hallazgo u orígenes de esos especímenes concretos.",
    expect: [
      "obj-amnh-hall-of-advanced-mammals-guide",
      "ex-hall-of-advanced-mammals-artifact-warren-mastadon",
    ],
  },
  {
    id: 4260,
    query:
      "¿Cuál es la procedencia del espécimen AMNH 9951 del Museo Americano de Historia Natural? Es un mastodonte. Lugar y contexto de hallazgo si está disponible.",
    expect: [
      "ex-hall-of-advanced-mammals-artifact-warren-mastadon",
      "obj-amnh-hall-of-advanced-mammals-guide",
    ],
  },
  {
    id: 4262,
    query:
      "¿Quién es Ross MacPhee del Museo Americano de Historia Natural? Breve biografía y especialidad.",
    expect: [
      "amnh-interview-ross-macphee",
      "ex-hall-of-advanced-mammals-article-mammoth-or-mastadon",
    ],
  },
  {
    id: 4263,
    query:
      "En la sala con mamut y mastodonte del Museo Americano de Historia Natural, frente a un trozo de piel conservada que parece de un elefante bebé: ¿qué es esa pieza? Identificar si es piel de mamut lanudo juvenil u otro espécimen y describir brevemente qué muestra.",
    expect: ["ex-hall-of-advanced-mammals-artifact-effie"],
  },
  {
    id: 4264,
    query:
      "En la sala con mamut, mastodonte y la pieza momificada Effie en el Museo Americano de Historia Natural, ¿cuál es el tercer conjunto de huesos expuesto junto a ellos? Identificar el taxón y una breve descripción.",
    expect: [
      "obj-amnh-hall-of-advanced-mammals-guide",
      "amnh-hall-of-advanced-mammals",
    ],
  },
  {
    id: 4269,
    query:
      "Why are manatees or sirenians displayed near elephants in museums? Explain their evolutionary relationship and shared traits briefly.",
    expect: [
      "amnh-hall-of-advanced-mammals-sirenians-proboscideans-and-desmostylians",
      "amnh-hall-extinct-mammals-tooth-comparison",
    ],
  },
  {
    id: 4270,
    query:
      "I’m in front of a large Earth display showing an Ice Age map in the same gallery with proboscideans and sirenians at the American Museum of Natural History. What is this display likely to be, and what does it show?",
    expect: [
      "amnh-hall-of-advanced-mammals-intro-globe",
      "amnh-interview-ross-macphee",
    ],
  },
  {
    id: 4272,
    query:
      "Describe the Ice Age around the New York region: extent and timing of Laurentide Ice Sheet, landscape features it left, and how it shaped present-day NYC area, briefly.",
    expect: ["amnh-hall-of-advanced-mammals-intro-globe"],
  },
  {
    id: 4279,
    query:
      "Who is Ross MacPhee or Ross Maxey associated with the American Museum of Natural History, in context of sharing information in a gallery? Provide brief identification if available.",
    expect: [
      "amnh-interview-ross-macphee",
      "ex-hall-of-advanced-mammals-article-mammoth-or-mastadon",
    ],
  },
  {
    id: 4280,
    query:
      "Confirm identity: Ross MacPhee is a mammalogist and curator at the American Museum of Natural History associated with this hall. Provide brief identification if verifiable.",
    expect: [
      "amnh-interview-ross-macphee",
      "ex-hall-of-advanced-mammals-article-mammoth-or-mastadon",
    ],
  },
  {
    id: 4281,
    query:
      "Briefly describe a question Ross MacPhee has explored regarding Ice Age megafaunal extinctions, such as causes and hypotheses.",
    expect: ["amnh-interview-ross-macphee"],
  },
  {
    id: 4282,
    // "Siquelo" is a speech-to-text mishearing of "Zichello"; the corpus has her interview.
    query:
      "Who is Julia Siquelo at the American Museum of Natural History? Provide brief identification if available.",
    expect: ["amnh-interview-julia-zichello"],
  },
  {
    id: 4285,
    query:
      "Were humans present in the New York region when mastodons like the Warren Mastodon lived, and is there evidence of humans hunting mastodons in the Northeast of North America? Provide brief, cautious summary.",
    expect: ["ex-hall-of-advanced-mammals-artifact-warren-mastadon"],
  },

  // ---- No direct answer in the corpus: "clean" (unrelated topic) ----
  {
    id: 4268,
    query:
      "In dogs and horses, where is the bony opening for the nasal passages located relative to the skull? Do they have a central forehead opening like proboscideans, or are the nasal openings positioned at the front of the face near the incisive region? Brief explanation.",
    expect: null,
    kind: "clean",
  },
  {
    id: 4273,
    query:
      "Were the Palisades cliffs along the Hudson River formed by higher water levels, or what is their geologic origin? Brief explanation including diabase sill, columnar jointing, and glacial modification by the Hudson and ice.",
    expect: null,
    kind: "clean",
  },
  {
    id: 4278,
    query:
      "What is the smallest living horse breed or species today? Provide the name and typical adult height range at the withers.",
    expect: null,
    kind: "clean",
  },

  // ---- No direct answer, but the corpus has topically related chunks ----
  {
    id: 4271,
    query:
      "During the last Ice Age, was there glaciation in South America, and where? Briefly explain major ice coverage in South America and why a North Atlantic focused museum map might not show it.",
    expect: null,
    kind: "related",
  },
  {
    id: 4274,
    // best chunk was guide text that doesn't describe any murals
    query:
      "In the Hall with proboscideans and Ice Age displays at the American Museum of Natural History, what paintings or murals are present, and what do they depict? Brief description.",
    expect: null,
    kind: "related",
  },
  {
    id: 4276,
    // best chunk was guide text that doesn't name the painter
    query:
      "Who painted the Ice Age fauna diorama-style murals in the relevant halls at the American Museum of Natural History? Provide artist names if available.",
    expect: null,
    kind: "related",
  },
  {
    id: 4283,
    query:
      "In the American Museum of Natural History, who are the curators associated with the Hall of Human Origins? Is there a curator named Julia Siquelo or similar? Provide brief verified info if available.",
    expect: null,
    kind: "related",
  },
  {
    id: 4284,
    query:
      "Does the Hall of Human Origins at the American Museum of Natural History include mammoth displays or references to mammoths? Provide brief answer.",
    expect: null,
    kind: "related",
  },
  {
    id: 4286,
    query:
      "In the American Museum of Natural History, a giant fossil turtle hanging from the ceiling—what is it likely to be, and what is notable about it? Provide brief identification and description.",
    expect: null,
    kind: "related",
  },
];

const HALL = "amnh-hall-of-advanced-mammals";
const PLACE = "amnh-nyc";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  // Guard: this route spends OpenAI + Pinecone credits. Disabled unless EVAL_TOKEN is set.
  const expected = "bang";
  if (!expected || url.searchParams.get("token") !== expected) {
    return new Response("Not found", { status: 404 });
  }

  const idFilter = url.searchParams.get("ids")?.split(",").map(Number);
  const concurrency = Math.max(1, Number(url.searchParams.get("c") ?? 4));
  const topN = Math.max(1, Number(url.searchParams.get("topn") ?? 20));
  const hallOnly = url.searchParams.get("scope") === "hall";

  // hallOnly drops the museum-wide clause so other halls can't outrank this one.
  const filter = hallOnly
    ? { exhibition_id: { $eq: HALL } }
    : { $or: [{ exhibition_id: { $eq: HALL } }, { place_id: { $eq: PLACE } }] };

  const selected = cases.filter((c) => !idFilter || idFilter.includes(c.id));
  const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });

  async function runCase(c: Case) {
    try {
      const rw = await rewriteQuery(c.query, []); // no chat history in the eval
      const embedding = await getQueryEmbedding(rw.searchQuery);
      const r = await retrieve({
        pc,
        embedding,
        searchQuery: rw.searchQuery,
        filter,
        ctxTopK: 8,
        globalTopK: 6,
        topN, // see all reranked candidates, not just the final 5
      });

      // r.rerank holds pre-gate scores, best first, so RERANK_MIN doesn't affect this.
      const best = r.rerank[0];

      // Where the expected chunk landed, ignoring the score floor (diagnostic).
      const anyIdx = c.expect
        ? r.rerank.findIndex((x: any) => c.expect!.includes(x.object_id))
        : -1;
      // A real hit: expected chunk exists AND scored at least MIN_HIT_SCORE.
      const hitIdx = c.expect
        ? r.rerank.findIndex(
            (x: any) =>
              c.expect!.includes(x.object_id) && x.rerank >= MIN_HIT_SCORE,
          )
        : -1;

      return {
        id: c.id,
        rewritten: rw.searchQuery,
        type: rw.type,
        rewrite_fallback: rw.fallback,
        expect: c.expect ? "doc" : "none",
        kind: c.kind ?? null,
        hit: c.expect ? hitIdx >= 0 : null,
        expected_rank: hitIdx >= 0 ? hitIdx + 1 : null,
        // for misses: did the expected doc appear at all, and how low?
        expected_rank_any: anyIdx >= 0 ? anyIdx + 1 : null,
        expected_rerank_any: anyIdx >= 0 ? r.rerank[anyIdx].rerank : null,
        best_rerank: best?.rerank ?? null,
        best_obj: best?.object_id ?? null,
        best_expected_rerank: hitIdx >= 0 ? r.rerank[hitIdx].rerank : null,
        dense_candidates: r.candidates,
        rerank_failed: r.rerankFailed,
        rerank_error: r.rerankError,
        ranked: r.rerank.map((x: any) => ({
          object_id: x.object_id ?? null,
          dense: x.dense,
          rerank: x.rerank,
        })),
      };
    } catch (err) {
      return { id: c.id, error: String(err) };
    }
  }

  // Simple concurrency pool.
  const results: any[] = [];
  for (let i = 0; i < selected.length; i += concurrency) {
    const batch = selected.slice(i, i + concurrency);
    results.push(...(await Promise.all(batch.map(runCase))));
  }

  const max = (xs: number[]) => (xs.length ? Math.max(...xs) : null);
  const min = (xs: number[]) => (xs.length ? Math.min(...xs) : null);
  const bestOf = (kind: string) =>
    results
      .filter((r) => r.kind === kind && r.best_rerank != null)
      .map((r) => r.best_rerank as number);

  // RERANK_MIN must sit above the clean ceiling and below the relevant floor.
  // "related" cases are reported separately: a threshold can't separate them,
  // that's the prompt's job.
  const clean_ceiling = max(bestOf("clean"));
  const related_ceiling = max(bestOf("related"));
  const relevant_floor = min(
    results
      .filter((r) => r.hit && r.best_expected_rerank != null)
      .map((r) => r.best_expected_rerank as number),
  );

  return Response.json({
    config: { scope: hallOnly ? "hall" : "hall_or_place", concurrency, topN },
    summary: {
      cases: results.length,
      errors: results.filter((r) => r.error).length,
      rerank_failures: results.filter((r) => r.rerank_failed).map((r) => r.id),
      hits: results.filter((r) => r.hit === true).length,
      expected_cases: results.filter((r) => r.expect === "doc").length,
      misses: results.filter((r) => r.hit === false).map((r) => r.id),
      clean_ceiling,
      related_ceiling,
      relevant_floor,
      separable_from_clean:
        clean_ceiling != null && relevant_floor != null
          ? relevant_floor > clean_ceiling
          : null,
    },
    results,
  });
}
