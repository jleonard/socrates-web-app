import type { LogAppEventType } from "~/utils/events/appEvents.server";

import {
  Bug,
  User,
  CircleDollarSign,
  MessageCircle,
  MessagesSquare,
  BotMessageSquare,
  Flag,
  Info,
  ScrollText,
  LucideIcon,
} from "lucide-react";

const errorTheme = "border-red-300 bg-red-100 text-red-700";
const infoTheme = "border-blue-300 bg-transparent text-blue-700";
const warningTheme = "border-yellow-300 bg-yellow-100 text-yellow-700";
const neutralTheme = "border-slate-300 bg-transparent text-slate-700";
const successTheme = "border-green-300 bg-green-50 text-green-700";

const eventThemeMap: Record<LogAppEventType, string> = {
  user_log_in: infoTheme,
  user_new: infoTheme,
  error: errorTheme,
  warning: warningTheme,
  info: infoTheme,
  log: neutralTheme,
  conversation_started: infoTheme,
  conversation_ended: infoTheme,
  user_spoke: successTheme,
  agent_spoke: neutralTheme,
  agent_log: infoTheme,
  purchase: successTheme,
};

const eventIconMap: Record<LogAppEventType, LucideIcon> = {
  user_log_in: User,
  user_new: User,
  error: Bug,
  warning: Flag,
  info: Info,
  log: ScrollText,
  conversation_started: MessagesSquare,
  conversation_ended: MessagesSquare,
  user_spoke: MessageCircle,
  agent_spoke: BotMessageSquare,
  agent_log: ScrollText,
  purchase: CircleDollarSign,
};

type FeedBadgeProps = {
  appEventType: LogAppEventType;
  className: string;
};

export function FeedBadge({ appEventType = "log", className }: FeedBadgeProps) {
  const Icon = eventIconMap[appEventType];
  const theme = eventThemeMap[appEventType];
  return (
    <div
      className={`size-10 rounded-full border flex flex-col gap-3 justify-center items-center ${theme} ${className}`}
    >
      <Icon size={16} strokeWidth={1}></Icon>
    </div>
  );
}
