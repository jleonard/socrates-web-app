// import Fuse from "fuse.js";
// import { doubleMetaphone } from "double-metaphone";

// ---------- Entities ----------
// @todo - implement this later.
// this was used for more sophisticated phonetic or fuzzy replacements
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

// ---------- Dictionary corrections ----------
const corrections: Record<string, string> = {
  cheebo: "Jibo",
  "gee bo": "Jibo",
  geebo: "Jibo",
  "ma three": "MA-3",
  ma3: "MA-3",
  "m a three": "MA-3",
  "m a 3": "MA-3",
  "boo-lam-weeny": "Buolamwini",
  "bu-lam-wini": "Buolamwini",
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
  "mink see": "Minsky",
  "mink sea": "Minsky",
  "see more paper": "Seymour Papert",
  "alter ego": "AlterEgo",
  "angel us novus": "Angelus Novus",
  "angelous novus": "Angelus Novus",
  "angelus novas": "Angelus Novus",
  "angelus novis": "Angelus Novus",
  "angle us novus": "Angelus Novus",
};

// ---------- Main correction function ----------
export function correctTranscription(raw: string): {
  corrected: string;
  raw: string;
} {
  let corrected = raw;

  // 1️⃣ Apply dictionary corrections first
  Object.keys(corrections)
    .sort((a, b) => b.length - a.length) // longest first
    .forEach((key) => {
      const regex = new RegExp(`\\b${key}\\b`, "gi");
      corrected = corrected.replace(regex, corrections[key]);
    });

  return { corrected, raw };
}
