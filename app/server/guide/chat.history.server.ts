import type { AgentChatMessage } from "~/types";
import { getRedis } from "~/utils/redis.server";

/**
 * Reads the visitor's stored chat history (`chat:<user_id>`), oldest first.
 *
 * Same key and shape the old webhook and the history-agent webhook
 * (api.agent.history.server.ts) use, so sessions can move between them.
 *
 * Never throws: missing or unreadable history returns [].
 */
export async function getChatHistory(
  userId: string | undefined,
): Promise<AgentChatMessage[]> {
  if (!userId) return [];

  try {
    const redis = await getRedis();
    const raw = await redis.get(`chat:${userId}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("[guide] getChatHistory failed", { userId, err });
    return [];
  }
}

/** Same caps the old webhook uses. */
const MAX_STORED_MESSAGES = 100;
const HISTORY_TTL_SECONDS = 60 * 60 * 24 * 30;

/**
 * Appends one visitor/guide exchange to `chat:<user_id>`. `history` is the
 * history loaded at the start of the request. Throws on a Redis error; the
 * caller logs it.
 */
export async function appendChatHistory(
  userId: string | undefined,
  history: AgentChatMessage[],
  visitorQuery: string,
  reply: string,
): Promise<void> {
  if (!userId || !reply) return;

  const redis = await getRedis();
  const turn: AgentChatMessage[] = [
    { role: "user", content: visitorQuery },
    { role: "assistant", content: reply },
  ];
  const updated = [...history, ...turn].slice(-MAX_STORED_MESSAGES);

  await redis.set(`chat:${userId}`, JSON.stringify(updated), {
    EX: HISTORY_TTL_SECONDS,
  });
}
