import type { RecordMetadata } from "@pinecone-database/pinecone";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { AgentChatMessage } from "~/types";
import type { LocationContext } from "./location.server";
import type { RetrievedChunk } from "./retrieval.server";

/** Recent turns sent to the answering model, for follow-ups. */
const HISTORY_MESSAGES = 10;

/**
 * The guide's system prompt. Encodes the source rules agreed for the guide:
 * venue facts come from SOURCES only; general knowledge is allowed with
 * guardrails and framed for factual claims; species-level facts are never
 * stated as facts about the specimen; identification follows the
 * one / several / none rules.
 */
const SYSTEM_PROMPT = `# Role

You are Wonder, a conversational guide to museums, landmarks and cultural institutions. You are talking by voice with a visitor who is there in person.

# How you sound

- Answer the question directly, like a knowledgeable person in conversation. No preamble, no "Great question."
- Match the length to the question: one or two sentences for a simple fact; up to four for an explanation, comparison or identification. Never more than four unless the visitor asks for more detail.
- Use plain spoken language. No lists, headings, markdown, emoji or links: your reply is read aloud.
- Always reply in English, whatever language the visitor used. The voice agent translates your reply for the visitor.
- Don't repeat the question.
- Don't end with an offer such as "Would you like to know more?" The visitor will ask. Ask a question only when you need their answer, for example to tell candidates apart.

# Where your information comes from

You are given SOURCES from the venue. They are the authority on this venue.

Only from the SOURCES. If they don't cover it, say you don't have that information here:
- what is in this exhibition or venue, and what is on display
- which object the visitor is looking at
- facts about a specific object: dates, where it was found or made, by whom, measurements, whether it is a cast or an original (except as allowed below)
- layout, directions, hours, tickets and policies
- what the museum or its curators say or think
- what other institutions hold or display
- exact quotes, and anything about named staff or other living people beyond their widely known public role

The visitor is in the exhibition described under ABOUT THIS EXHIBITION. Never suggest they are somewhere else.

ELSEWHERE IN THIS MUSEUM sections describe other halls in the same museum. Use them when they help, and always name the hall ("In the Hall of Human Origins, there's…"). Never present anything from those sections as being in this hall. If the visitor asks about another hall and there's no section for it, say you don't have information about that hall here.

Don't claim the opposite either: don't say something is not on display here, or that a person is not connected to this exhibition, unless the SOURCES say so.

When the SOURCES answer part of a question (for example where one of several objects was found), give that part first, then say what you don't have, in plain words such as "I don't have that information for the mammoth here." Never say "the sources" out loud.

From your own knowledge, with care:
- well-established science, history and culture, and explaining concepts
- facts about a kind of thing (a species, person, movement or period), worded about the kind and never as a fact about the specific object here. Say "Mastodons generally stood about three metres tall", never "This mastodon stood three metres tall."
- well-known facts about a widely documented object, such as the Mona Lisa or the Rosetta Stone, once the SOURCES have established which object it is. For objects without a public record (most specimens, dioramas, panels and local objects) use only the SOURCES.
- widely known facts about famous objects held elsewhere ("the Mona Lisa is at the Louvre"), but nothing specific about another institution's collection or displays.

Framing applies to each claim, not to the whole answer. Whenever a factual claim comes from your own knowledge rather than the SOURCES, including in an answer that also uses the SOURCES, mark the switch once, briefly and naturally, for example "That's not covered here, but generally…" or "Beyond what's in this hall…". Vary the wording. Plain definitions and explanations need no framing.

Never:
- invent or guess names, dates, numbers, places or quotes. If you're not sure, say so.
- confirm something just because the visitor stated it. Check it against the SOURCES or well-established knowledge.
- present debated questions as settled.
- describe a person who isn't a widely known public figure (most researchers, curators and staff) from your own knowledge. If the SOURCES don't say who they are, say you don't have information about them here.
- mention "sources", "SOURCES", retrieved content or how you get your information. Just answer.
- treat a source that is related but doesn't actually answer the question as if it did.

# Interviews, essays and quotes

Some SOURCES are marked with who is speaking, for example "[Interview with Ross MacPhee]". They are that person's account and views, not established fact:
- attribute views and claims to them ("Ross MacPhee thinks…", "In her interview, Julia Zichello explains…").
- describe who they are only as the SOURCES do. Don't add biography, titles, research or achievements from your own knowledge.

# Identifying what the visitor is looking at

When the visitor asks what something is, or describes it, first check every ABOUT THIS OBJECT section against their description:
1. Exactly one object fits: name it confidently in one or two sentences.
2. More than one object fits: you must not pick one, even if one seems more likely. Name each with one detail that tells them apart, and ask which one they mean. For example, several large skeletons with long tusks are several candidates.
3. None fits: say so plainly and ask for a detail, such as its color, size or what the label says. Don't guess.
Use any detail the visitor gave (color, size, shape, position) to narrow the candidates first. Only mention objects that appear in the SOURCES.`;

/** Added when retrieval found nothing relevant. */
const NO_SOURCES_INSTRUCTION = `No retrieved content matched this question. (Any exhibition overview in the SOURCES still applies.)
If the question is about this venue or a specific object here and the SOURCES don't answer it, say you don't have that information here; if it helps, mention what you can talk about instead.
Otherwise, answer from your own knowledge within the rules above. Begin by saying briefly, in your own words, that this isn't covered here (for example "That's not something this hall covers, but…").`;

export type AnswerMode = "grounded" | "general";

type Section = "exhibition" | "object" | "background" | "elsewhere";

export type AnswerPrompt = {
  messages: ChatCompletionMessageParam[];
  /** grounded = retrieval returned chunks; general = it returned none. */
  mode: AnswerMode;
  /** Which chunks went into which section, for logging. */
  sections: Record<Section, string[]>;
};

export function buildAnswerPrompt(opts: {
  visitorQuery: string;
  history: AgentChatMessage[];
  chunks: RetrievedChunk[];
  venueContext: string[];
  location: LocationContext;
}): AnswerPrompt {
  const { chunks, venueContext, location } = opts;
  const mode: AnswerMode = chunks.length > 0 ? "grounded" : "general";

  // Group chunks by what they're about. Objects keep their own heading so
  // the model can tell which object each fact belongs to.
  const sections: Record<Section, string[]> = {
    exhibition: [],
    object: [],
    background: [],
    elsewhere: [],
  };
  const exhibitionTexts: string[] = [...venueContext];
  const objectGroups = new Map<string, { title: string; texts: string[] }>();
  const backgroundTexts: string[] = [];
  // other halls in this venue, grouped by hall
  const elsewhereGroups = new Map<string, string[]>();

  for (const chunk of chunks) {
    const md = chunk.metadata;
    const body = String(md.text ?? "").trim();
    if (!body) continue;
    const text = sourceLabel(md) + body;

    if (chunk.pool === "elsewhere") {
      sections.elsewhere.push(chunk.id);
      const hall = hallName(md);
      const texts = elsewhereGroups.get(hall) ?? [];
      texts.push(withTitle(md, text));
      elsewhereGroups.set(hall, texts);
      continue;
    }

    const section = sectionFor(md, location);
    sections[section].push(chunk.id);

    if (section === "exhibition") {
      exhibitionTexts.push(text);
    } else if (section === "background") {
      backgroundTexts.push(withTitle(md, text));
    } else {
      const key = String(md.object_id ?? chunk.id);
      const group = objectGroups.get(key) ?? {
        title: objectTitle(md, key),
        texts: contextNote(md),
      };
      group.texts.push(text);
      objectGroups.set(key, group);
    }
  }

  const blocks: string[] = [];
  if (exhibitionTexts.length) {
    blocks.push(`## ABOUT THIS EXHIBITION\n${exhibitionTexts.join("\n\n")}`);
  }
  for (const { title, texts } of objectGroups.values()) {
    blocks.push(`## ABOUT THIS OBJECT: ${title}\n${texts.join("\n\n")}`);
  }
  for (const [hall, texts] of elsewhereGroups) {
    blocks.push(
      `## ELSEWHERE IN THIS MUSEUM: ${hall} (another hall, NOT where the visitor is)\n${texts.join("\n\n")}`,
    );
  }
  if (backgroundTexts.length) {
    blocks.push(
      `## BACKGROUND (general reference, not claims about what is on display)\n${backgroundTexts.join("\n\n")}`,
    );
  }

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];
  if (blocks.length) {
    messages.push({
      role: "system",
      content: `# SOURCES\n\n${blocks.join("\n\n")}`,
    });
  }
  if (mode === "general") {
    messages.push({ role: "system", content: NO_SOURCES_INSTRUCTION });
  }
  for (const m of opts.history.slice(-HISTORY_MESSAGES)) {
    messages.push({ role: m.role, content: m.content });
  }
  messages.push({ role: "user", content: opts.visitorQuery });

  return { messages, mode, sections };
}

/**
 * Which section a chunk belongs in. Uses the `scope` tag when the chunk has
 * one (venue | object | universal); otherwise infers it from existing
 * metadata. Never infers `universal` except from content types that are
 * general by definition, so the mistakes it can make are the safe ones.
 */
function sectionFor(md: RecordMetadata, location: LocationContext): Section {
  if (md.scope === "venue") return "exhibition";
  if (md.scope === "object") return "object";
  if (md.scope === "universal") return "background";

  // Strapi chunks: by content type
  if (md.parent_type === "place" || md.parent_type === "exhibition") {
    return "exhibition";
  }
  if (md.parent_type === "artwork" || md.parent_type === "artifact") {
    return "object";
  }
  if (md.parent_type === "person" || md.parent_type === "topic") {
    return "background";
  }

  const objectId = md.object_id;
  if (
    typeof objectId === "string" &&
    objectId !== location.exhibitionId &&
    objectId !== location.placeId
  ) {
    return "object";
  }
  return "exhibition";
}

function objectTitle(md: RecordMetadata, fallback: string): string {
  const name = md.name ?? md.title ?? md.object_name ?? fallback;
  const kind = md.object_subtype ?? md.object_type;
  return kind ? `${name} (${kind})` : String(name);
}

/** The folder-level description, once per object (e.g. where it's displayed). */
function contextNote(md: RecordMetadata): string[] {
  return typeof md.description === "string" && md.description.trim()
    ? [`Context: ${md.description.trim()}`]
    : [];
}

/**
 * "[Interview with Ross MacPhee] " for chunks whose `source_type` says who is
 * speaking, so the model attributes their views (see the system prompt).
 * Uses `interviewee` (or name/title) from the folder metadata.
 */
function sourceLabel(md: RecordMetadata): string {
  const type = typeof md.source_type === "string" ? md.source_type : null;
  if (!type) return "";

  const who = [md.interviewee, md.author, md.name, md.title].find(
    (v): v is string => typeof v === "string" && v.trim() !== "",
  );
  const kind = type.charAt(0).toUpperCase() + type.slice(1);
  if (!who) return `[${kind}] `;
  return type === "interview"
    ? `[Interview with ${who.trim()}] `
    : `[${kind} by ${who.trim()}] `;
}

/** A hall's display name, e.g. "Hall of Human Origins". */
function hallName(md: RecordMetadata): string {
  if (typeof md.exhibition_name === "string" && md.exhibition_name.trim()) {
    return md.exhibition_name.trim();
  }
  // e.g. "amnh-hall-of-human-origins" -> "hall of human origins"
  return String(md.exhibition_id ?? "another exhibition")
    .replace(/^[a-z]+-(?=hall)/, "")
    .replace(/-/g, " ");
}

function withTitle(md: RecordMetadata, text: string): string {
  const title = md.name ?? md.title;
  return title ? `${title}: ${text}` : text;
}
