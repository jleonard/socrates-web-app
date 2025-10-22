// app/sessions.server.ts
import { createCookieSessionStorage } from "react-router";
import { v4 as uuidv4 } from "uuid";

// cookie config
export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__remix-session",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: [process.env.SESSION_SECRET ?? "dev-secret"], // keep secret in env
    secure: process.env.NODE_ENV === "production",
    maxAge: 24 * 60 * 60, // 24 hours in seconds
  },
});

// helper to get or create a session id
export async function getSessionId(request: Request) {
  const session = await sessionStorage.getSession(
    request.headers.get("Cookie")
  );

  let sessionId = session.get("sessionId");
  if (!sessionId) {
    sessionId = uuidv4();
    session.set("sessionId", sessionId);
  }

  return { session, sessionId };
}
