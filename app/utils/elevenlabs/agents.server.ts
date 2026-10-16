import type { Session } from "react-router";

/**
 * ElevenLabs agents the app can start, by name. Links and (later) venues
 * refer to the NAME, so agent ids never appear in a URL, and only agents
 * listed here can be used.
 *
 * `default` comes from ELEVENLABS_AGENT so production keeps its current
 * agent without a code change. Add entries as `name: "agent_..."`.
 */
const AGENTS: Record<string, string | undefined> = {
  default: process.env.ELEVENLABS_AGENT,
  agentB: "agent_0201m4yd6fh9f02t9r3dhmmwgq85",
  // guide: "agent_xxxxxxxxxxxxxxxxxxxxxxxx", // copy of production for the guide webhook
};

export type AgentName = keyof typeof AGENTS;

/** Session key holding the chosen agent name. */
const SESSION_KEY = "agent";

/**
 * Picks the agent for this visit:
 *   1. `?agent=<name>` from the URL, if the name is in AGENTS. It's saved in
 *      the session so it survives redirects and reloads; `?agent=default`
 *      clears it.
 *   2. otherwise the name saved in the session
 *   3. otherwise `default`
 *
 * Unknown names are ignored (and logged), never passed through as ids.
 * Venue-based selection can be added here later, between 1 and 3.
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
  // the dictionary may have changed since the name was stored
  const id = (name && AGENTS[name]) || AGENTS.default;

  if (!id) throw new Error("ELEVENLABS_AGENT is not set");
  return id;
}
