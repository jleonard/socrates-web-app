import type { ElevenLabsConversationTurn } from "~/types";

type ConversationTurnRowProps = {
  turn: ElevenLabsConversationTurn;
  user_id: string;
};

export function ElevenLabsConversationTurnRow({
  turn,
  user_id,
}: ConversationTurnRowProps) {
  const isUser = turn.role === "user";

  // console.log("turn : ", turn);

  return (
    <div className={`flex ${isUser ? "justify-start" : "justify-end"}`}>
      <div
        className={`flex gap-3 px-4 py-3 rounded-lg border text-sm font-mono w-10/12 ${
          isUser
            ? "bg-slate-50 border-slate-200"
            : "bg-indigo-50 border-indigo-200"
        }`}
      >
        {/* Role chip */}
        <div className="flex flex-col gap-1.5 items-start pt-0.5 min-w-fit">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold tracking-wide ${
              isUser
                ? "bg-slate-200 text-slate-700"
                : "bg-indigo-200 text-indigo-800"
            }`}
          >
            {isUser ? user_id : "agent"}
          </span>

          {/* Tool chip */}
          {turn.tool && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
              <svg
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l5.654-4.654m5.879-4.224a3.927 3.927 0 0 0-.68-4.31l-2.859 2.86"
                />
              </svg>
              <span>tool</span>
              {turn.tool}
            </span>
          )}
        </div>

        {/* Message */}
        <p className="text-slate-700 leading-relaxed mt-0.5">
          {turn.message ?? <span className="text-slate-400 italic">empty</span>}
        </p>
      </div>
    </div>
  );
}
