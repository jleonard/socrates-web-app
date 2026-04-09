import { AppEventLog } from "~/types";
import { LogAppEventType } from "~/utils/events/appEvents.server";
import { FeedBadge } from "../FeedBadge/FeedBadge";
import { FeedChip } from "../FeedChip/FeedChip";

export type FeedRowProps = {
  appEventLog: AppEventLog;
};

export function FeedRow({ appEventLog }: FeedRowProps) {
  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString("en-US", {
      month: "2-digit",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  const details =
    appEventLog?.event_details && typeof appEventLog.event_details == "object"
      ? appEventLog.event_details
      : {};

  const borderMap: Record<LogAppEventType, string> = {
    user_log_in: "",
    user_new: "",
    error: "",
    warning: "",
    info: "",
    log: "",
    conversation_started: "border-l-4 border-l-green-400",
    conversation_ended: "",
    user_spoke: "",
    agent_spoke: "",
    agent_log: "",
    purchase: "border-l-4 border-l-green-400",
  };

  const eventType = appEventLog?.event_type as LogAppEventType | undefined;

  const borderClass = eventType ? borderMap[eventType] : "";

  return (
    <div
      className={`grow flex flex-row gap-3 justify-start items-center p-2 rounded-sm bg-white border border-slate-200 ${borderClass}`}
    >
      <FeedBadge
        className="shrink-0"
        appEventType={appEventLog.event_type as LogAppEventType}
      />
      <div className="flex flex-col gap-2">
        <span className="text-xs text-slate-700 text-left">
          {formatDate(appEventLog.created_at)}
        </span>
        <div className="flex flex-col gap-3 text-left">
          <span>{appEventLog.event_message}</span>
          {/* chip row */}
          <div className="flex flex-row gap-1 justify-start items-center">
            {Object.entries(details).map(([key, value]) => (
              <FeedChip key={key} objKey={key} value={value?.toString()} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
