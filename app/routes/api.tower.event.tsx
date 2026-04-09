import type { ActionFunction } from "react-router";
import type { LogAppEventProps } from "~/utils/events/appEvents.server";
import { logAppEvent } from "~/utils/events/appEvents.server";

export const action: ActionFunction = async ({ request }) => {
  const body = await request.json();

  if (body?.event_type && body?.event_message && body?.event_details) {
    let obj: LogAppEventProps = {
      event_type: body?.event_type,
      event_message: body?.event_message,
      event_details: body?.event_details,
    };
    await logAppEvent(obj);
  }

  return new Response(null, { status: 204 });
};
