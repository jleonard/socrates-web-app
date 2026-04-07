/*
 * Transcription correction util
 * Handles dictionary + phonetic + n-gram corrections safely, works with multilingual input
 * Preserves punctuation and apostrophes
 */

import { doubleMetaphone } from "double-metaphone";
import { franc } from "franc";

// ------------------------------------------------------------
// 1. Known entities (proper nouns)
const entities = [
  "Aurora",
  "Jibo",
  "SIGSALY",
  "Jenga",
  "Belgrade",
  "Aeronautics",
  "Astronautics",
  "Massachusetts",
  "Licklider",
  "Kismet",
  "Breazeal",
  "Angelus Novus",
  "Sensory Tactile Glove",
  "Marvin Minsky",
  "Claude Shannon",
  "Alan Turing",
  "Seymour Papert",
  "Buolamwini",
  "Rajko Tomovic",
  "Julie Shah",
  "MCube",
  "MA-3",
  "AlterEgo",
];

// ------------------------------------------------------------
// 2. Dictionary for common mishears
const corrections: Record<string, string> = {
  "angel us novus": "Angelus Novus",
  "angelous novus": "Angelus Novus",
  "angelus novas": "Angelus Novus",
  "angelus novis": "Angelus Novus",
  "angle us novus": "Angelus Novus",
  cheebo: "Jibo",
  "gee bo": "Jibo",
  geebo: "Jibo",
  "ma three": "MA-3",
  ma3: "MA-3",
  "boo-lam-weeny": "Buolamwini",
  "bu-lam-wini": "Buolamwini",
  "buolam wini": "Buolamwini",
  "boo-lam-winny": "Buolamwini",
  "m cube": "MCube",
  "em cube": "MCube",
  "m-cube": "MCube",
  mcube: "MCube",
  "emc ube": "MCube",
  licklyder: "Licklider",
  "lick litter": "Licklider",
  "lick lidder": "Licklider",
  "kiss met": "Kismet",
  kizzmet: "Kismet",
  kismit: "Kismet",
  kyzmet: "Kismet",
  "alter ago": "AlterEgo",
};

// ------------------------------------------------------------
// 3. Build phonetic map for proper nouns only
const properNounCandidates = new Set(entities);
const phoneticMap = new Map<string, string>();
for (const term of properNounCandidates) {
  const phonetic = doubleMetaphone(term.toLowerCase())[0];
  phoneticMap.set(phonetic, term);
}

// ------------------------------------------------------------
// 4. Helpers
function normalizeForMatching(text: string) {
  // Lowercase and remove symbols for matching, preserve letters/numbers/apostrophes/spaces
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ngrams(words: string[], n: number) {
  const grams: string[] = [];
  for (let i = 0; i <= words.length - n; i++) {
    grams.push(words.slice(i, i + n).join(" "));
  }
  return grams;
}

// ------------------------------------------------------------
// 5. Apply dictionary corrections
function applyDictionary(query: string) {
  let corrected = query;
  const correctedWords = new Set<string>();

  for (const wrong in corrections) {
    const regex = new RegExp(`\\b${wrong}\\b`, "gi");
    corrected = corrected.replace(regex, (match) => {
      correctedWords.add(match.toLowerCase());
      return corrections[wrong];
    });
  }

  return { corrected, correctedWords };
}

// ------------------------------------------------------------
// 6. Phonetic correction (only exact phonetic matches)
function phoneticCorrect(query: string, correctedWords: Set<string>) {
  const words = query.split(/\s+/);
  let corrected = query;

  for (let n = 3; n >= 1; n--) {
    const grams = ngrams(words, n);

    for (const gram of grams) {
      // skip words already corrected
      if (gram.split(" ").some((w) => correctedWords.has(w.toLowerCase())))
        continue;

      const phonetic = doubleMetaphone(gram)[0];
      const match = phoneticMap.get(phonetic);

      if (match) {
        corrected = corrected.replace(new RegExp(`\\b${gram}\\b`, "i"), match);
        gram.split(" ").forEach((w) => correctedWords.add(w.toLowerCase()));
      }
    }
  }

  return corrected;
}

// ------------------------------------------------------------
// 7. Full pipeline
export function correctTranscription(query: string) {
  console.log("query :: ", query);

  // Preserve original punctuation for rendering
  const original = query;

  // Normalize only for matching
  const normalized = normalizeForMatching(query);
  console.log("normalized :: ", normalized);

  const lang = franc(normalized, { minLength: 3 });
  console.log("lang :: ", lang);

  // Apply dictionary corrections
  const { corrected: dictCorrected, correctedWords } =
    applyDictionary(normalized);
  console.log("after dictionary :: ", dictCorrected);

  // Determine if phonetic correction is needed
  const hasCandidateOrCorrection =
    Array.from(properNounCandidates).some((term) =>
      dictCorrected.includes(term.toLowerCase()),
    ) || correctedWords.size > 0;

  if (
    lang !== "eng" &&
    !hasCandidateOrCorrection &&
    normalized.split(" ").length > 5
  ) {
    console.log(
      "Skipping phonetic correction because non-English and no known proper nouns/dictionary corrections",
    );
    return original; // return original text with punctuation
  }

  // Apply phonetic corrections on normalized text
  const phoneticCorrected = phoneticCorrect(dictCorrected, correctedWords);

  // Map corrections back to original punctuation
  let final = original;
  correctedWords.forEach((word) => {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    final = final.replace(
      regex,
      corrections[word] || phoneticMap.get(doubleMetaphone(word)[0]) || word,
    );
  });

  console.log("final :: ", final);
  return final;
}
