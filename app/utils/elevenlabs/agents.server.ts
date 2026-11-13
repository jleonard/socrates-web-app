import type { Language } from "@elevenlabs/react";
import type { Session } from "react-router";

/**
 * ElevenLabs agents the app can start, by name. Links and (later) venues
 * refer to the NAME, so agent ids never appear in a URL, and only agents
 * listed here can be used.
 *
 * `default` comes from ELEVENLABS_AGENT (agentB / prod b), so the default
 * agent can change without a deploy. `legacyMIT` is only used when asked
 * for with `?agent=legacyMIT`: MIT moved to the default agent and the guide
 * in Nov 2026. Add entries as `name: "agent_..."`.
 */
const AGENTS: Record<string, string | undefined> = {
  default: process.env.ELEVENLABS_AGENT,
  legacyMIT: "agent_7401m2tn9ewrfm5rrz73js20ecqw",
  agentB: "agent_0201m4yd6fh9f02t9r3dhmmwgq85",
  // guide: "agent_xxxxxxxxxxxxxxxxxxxxxxxx", // copy of production for the guide webhook
};

/** Places that run on a specific agent instead of `default`. None today. */
const PLACE_AGENTS: Record<string, AgentName> = {};

export type AgentName = keyof typeof AGENTS;

/**
 * Agents that accept a starting-language override (`overrides.agent.language`,
 * allowed in the agent's security settings), keyed by agent id, with the
 * languages they have enabled (default + language presets). Sending a
 * language an agent doesn't allow or doesn't have fails the session, so
 * anything not listed here starts in the agent's default language.
 *
 * Keyed by id, not name, so `default` picks this up once ELEVENLABS_AGENT
 * points at prod b.
 */
const START_LANGUAGES: Record<string, readonly Language[]> = {
  // wonderway - prod b (only languages we're keeping after the trim)
  agent_0201m4yd6fh9f02t9r3dhmmwgq85: ["en", "es", "zh"],
};

/**
 * The language to start this agent's conversation in: the venue's language
 * if the agent can take it, else undefined (the agent's own default).
 * Language detection still switches to whatever the visitor speaks.
 */
export function startLanguageFor(
  agentId: string,
  language: string | null,
): Language | undefined {
  if (!language) return undefined;
  // typed as the SDK's Language, so it can go straight into startSession
  return START_LANGUAGES[agentId]?.find((l) => l === language);
}

/** Session key holding the chosen agent name. */
const SESSION_KEY = "agent";

/**
 * Picks the agent for this visit:
 *   1. `?agent=<name>` from the URL, if the name is in AGENTS. It's saved in
 *      the session so it survives redirects and reloads; `?agent=default`
 *      clears it.
 *   2. otherwise the name saved in the session
 *   3. otherwise the place's agent (PLACE_AGENTS), from the `place` saved
 *      in the session by the loader
 *   4. otherwise `default` (ELEVENLABS_AGENT)
 *
 * Unknown names are ignored (and logged), never passed through as ids.
 * Call it after the loader has saved `?place=` to the session.
 */
export function resolveAgentId(
  requested: string | null,
  session: Session,
): string {
  if (requested === "default") {
    session.unset(SESSION_KEY);
  } else if (requested && AGENTS[requested]) {
    session.set(SESSION_KEY, requested);
  } else if (requested) {
    console.warn("[agents] unknown agent name ignored:", requested);
  }

  const name = session.get(SESSION_KEY);
  const place = session.get("place");
  const placeAgent =
    typeof place === "string" ? PLACE_AGENTS[place] : undefined;
  // the dictionary may have changed since the name was stored
  const id =
    (name && AGENTS[name]) ||
    (placeAgent && AGENTS[placeAgent]) ||
    AGENTS.default;

  if (!id) throw new Error("ELEVENLABS_AGENT is not set");
  return id;
}
