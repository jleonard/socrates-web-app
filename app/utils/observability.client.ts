import * as Sentry from "@sentry/react";
import { logAppEventFromClient } from "~/utils/events/appEvents.client";

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
  funnelContext = { user_id: v.userId, place: v.place };
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
  if (funnelContext) funnelContext = { ...funnelContext, place };
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

/*
 * Steps also written to event_log as `funnel` events (event_message = step),
 * so "how far do visitors get?" is a query, not a guess. Breadcrumbs alone
 * only reach Sentry with an error. A guest with no "page shown" never ran
 * the page's JS (link preview, bot, closed before load); one stuck on
 * "page shown" never got past the welcome popup.
 */
const FUNNEL_STEPS: ReadonlySet<AppStep> = new Set<AppStep>([
  "page shown",
  "location allowed",
  "location denied",
  "location dismissed",
  "greeting failed",
  "start pressed",
  "mic allowed",
  "mic denied",
  "conversation connected",
  "conversation start failed",
]);

let funnelContext: { user_id: string; place: string | null } | null = null;

export function step(
  name: AppStep,
  data?: Record<string, unknown>,
  level: Sentry.SeverityLevel = "info",
) {
  Sentry.addBreadcrumb({ category: "app.step", message: name, data, level });
  if (funnelContext && FUNNEL_STEPS.has(name)) {
    logAppEventFromClient({
      event_type: "funnel",
      event_message: name,
      event_details: { ...funnelContext, ...data },
    });
  }
}
