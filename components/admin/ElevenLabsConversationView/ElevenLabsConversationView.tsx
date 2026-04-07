import { ElevenLabsConversationTurnRow } from "../ElevenLabsConversationTurnRow/ElevenLabsConversationTurnRow";
import type { ElevenLabsConversationTurn } from "~/types";
import type { ElevenLabsConversation } from "~/types";

type ElevenLabsConversationViewProps = {
  conversation: ElevenLabsConversation;
};

export function ElevenLabsConversationView({
  conversation,
}: ElevenLabsConversationViewProps) {
  const turns =
    (
      conversation.transcript as {
        transcript: ElevenLabsConversationTurn[];
      } | null
    )?.transcript ?? null;

  // add this helper near the bottom with the other helpers
  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <span className="text-slate-800">
        {formatDate(conversation.created_at)}
      </span>
      {/* Meta bar */}
      <div className="flex flex-wrap gap-3 text-sm text-slate-500 font-mono border-b border-slate-200 pb-3">
        <span>
          <span className="text-slate-400">id</span> {conversation.id}
        </span>
        <span>
          <span className="text-slate-400">user</span>{" "}
          {conversation.user_id ?? "—"}
        </span>
        <span>
          <span className="text-slate-400">created</span>{" "}
          {formatDate(conversation.created_at)}
        </span>
        {conversation.duration != null && (
          <span>
            <span className="text-slate-400">duration</span>{" "}
            {conversation.duration}s
          </span>
        )}
        {conversation.elevenlabs_tokens != null && (
          <span>
            <span className="text-slate-400">tokens</span>{" "}
            {conversation.elevenlabs_tokens}
          </span>
        )}
      </div>

      {/* Summary */}
      {conversation.summary && (
        <div className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Summary
          </span>
          <span className="text-lg">{conversation.summary}</span>
        </div>
      )}

      {/* Transcript */}
      {turns && turns.length > 0 ? (
        <div className="flex flex-col gap-2">
          {turns.map((turn, i) => (
            <ElevenLabsConversationTurnRow
              key={i}
              turn={turn}
              user_id={conversation.user_id ?? "unknown"}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400 italic">
          No transcript available.
        </p>
      )}
    </div>
  );
}
