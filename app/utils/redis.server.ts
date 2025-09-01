/**
 * Used by routes/api.cache.ts
 */

import { createClient } from "redis";

let client: ReturnType<typeof createClient> | null = null;

export async function getRedis() {
  if (!client) {
    client = createClient({
      socket: {
        host: process.env.REDIS_URL,
        port: parseInt(process.env.REDIS_PORT!),
        tls: false, // Redis Cloud requires TLS for rediss://
      },
      username: "default", // default user
      password: process.env.REDIS_PASSWORD,
    });

    client.on("error", (err) => console.error("Redis error:", err));
    await client.connect();
  }
  return client;
}
