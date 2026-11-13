import type { LogAppEventProps } from "./appEvents.server";

export function logAppEventFromClient({
  event_type,
  event_message = "",
  event_details = {},
}: LogAppEventProps) {
  fetch("/api/tower/event", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ event_type, event_message, event_details }),
    // still sent if the visitor closes or leaves the page right after
    keepalive: true,
  }).catch(() => {
    // logging must never break the app
  });
}
