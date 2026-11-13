import * as Sentry from "@sentry/react";

/**
 * Sentry context for the main /app view.
 *
 * - setVisitorScope: who and where, so every error from this session can be
 *   filtered by visitor, place, promo or agent (Nov 2026: matching MIT errors
 *   to visitors by timestamp was slow and error-prone).
 * - step: a breadcrumb per first-screen step (popup, greeting, Start, mic,
 *   ElevenLabs connection). Breadcrumbs cost nothing until an error happens;
 *   then the error shows how far the visitor got.
 */

type VisitorScope = {
  userId: string;
  role: "guest" | "user";
  place: string | null;
  promo: string | null;
  agentId: string;
  access: string | null;
  locale: string;
  startLanguage: string | null;
};

export function setVisitorScope(v: VisitorScope) {
  // id only: no email or name
  Sentry.setUser({ id: v.userId });
  Sentry.setTags({
    role: v.role,
    place: v.place ?? "none",
    promo: v.promo ?? "none",
    agent: v.agentId,
    access: v.access ?? "none",
    locale: v.locale,
    start_language: v.startLanguage ?? "agent-default",
  });
}

/** Updates the place tag when the active place changes mid-session. */
export function setPlaceTag(place: string | null) {
  Sentry.setTag("place", place ?? "none");
}

/** Tags the current ElevenLabs conversation, to jump between Sentry and ElevenLabs. */
export function setConversationTag(conversationId: string | null) {
  Sentry.setTag("conversation_id", conversationId ?? "none");
}

export type AppStep =
  | "page shown"
  | "location allowed"
  | "location denied"
  | "location dismissed"
  | "greeting started"
  | "greeting finished"
  | "greeting failed"
  | "start pressed"
  | "stop pressed"
  | "mic allowed"
  | "mic denied"
  | "conversation connecting"
  | "conversation connected"
  | "conversation start failed"
  | "conversation disconnected";

export function step(
  name: AppStep,
  data?: Record<string, unknown>,
  level: Sentry.SeverityLevel = "info",
) {
  Sentry.addBreadcrumb({ category: "app.step", message: name, data, level });
}
