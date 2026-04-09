/*
 * logic
 * badge gets an event
 *  component assigns a color theme
 *  component assigns an Icon
 */

import {
  Bug,
  Cog,
  User,
  MessageCircle,
  MessagesSquare,
  BotMessageSquare,
  Flag,
  Info,
  ScrollText,
  LucideIcon,
} from "lucide-react";

export type AppEventType =
  | "user_log_in"
  | "user_new"
  | "error"
  | "warning"
  | "info"
  | "log"
  | "conversation_started"
  | "conversation_ended"
  | "user_spoke"
  | "agent_spoke"
  | "agent_log";

const errorTheme = "border-red-600 bg-red-100 text-red-600";
const infoTheme = "border-blue-800 bg-blue-100 text-blue-700";
const warningTheme = "border-yellow-600 bg-yellow-100 text-yellow-600";
const neutralTheme = "border-slate-800 bg-slate-100 text-slate-700";
const successTheme = "border-green-600 bg-green-100 text-green-600";

const eventThemeMap: Record<AppEventType, string> = {
  user_log_in: infoTheme,
  user_new: infoTheme,
  error: errorTheme,
  warning: warningTheme,
  info: infoTheme,
  log: neutralTheme,
  conversation_started: infoTheme,
  conversation_ended: infoTheme,
  user_spoke: successTheme,
  agent_spoke: successTheme,
  agent_log: infoTheme,
};

type FeedChipProps = {
  objKey: string;
  value?: string | null;
};

export function FeedChip({ objKey, value = " " }: FeedChipProps) {
  const label = objKey == "user_id" ? value?.slice(0, 5) : value;
  return (
    <div
      className={`px-2 py-1 text-xs rounded-sm border-1 flex gap-1 justify-start items-center ${neutralTheme}`}
    >
      {objKey && objKey == "user_id" && <User strokeWidth={2} size={12} />}
      {objKey && objKey.indexOf("tool_") == 0 && (
        <Cog strokeWidth={2} size={12} />
      )}
      <span>{objKey}</span>
      <span>{label}</span>
    </div>
  );
}
