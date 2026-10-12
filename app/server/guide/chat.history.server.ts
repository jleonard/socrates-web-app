import type { AgentChatMessage } from "~/types";
import { getRedis } from "~/utils/redis.server";

/**
 * Reads the visitor's stored chat history (`chat:<user_id>`), oldest first.
 *
 * NOTE: read-only for now. The old webhook writes this key after each
 * answer; the guide webhook doesn't write it yet, so guide-only sessions
 * will have no history until that's added.
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
