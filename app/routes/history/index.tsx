import ChatMessage from "components/ChatMessage/ChatMessage";
import { Container } from "components/Container/Container";
import React, { useEffect, useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { Link, redirect, useLoaderData, useNavigate } from "react-router";
import type { Json } from "~/types/supabase";
import { getSupabaseServerClient } from "~/utils/supabase.server";

// enables scrolling for the view.
export const handle = { scrollable: true };

const PAGE_SIZE = 25;

// Types
export type TranscriptTurn = {
  role: "user" | "agent";
  tool: string | null;
  message: string;
};

export type Conversation = {
  id: number;
  created_at: string;
  duration: number | null;
  summary: string | null;
  transcript: TranscriptTurn[];
};

// Transcript parser
function parseTranscript(raw: Json | null): TranscriptTurn[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];

  const turns = (raw as { transcript?: Json }).transcript;
  if (!Array.isArray(turns)) return [];

  return turns.filter(
    (turn): turn is TranscriptTurn =>
      turn !== null &&
      typeof turn === "object" &&
      !Array.isArray(turn) &&
      (turn.role === "user" || turn.role === "agent") &&
      typeof turn.message === "string" &&
      turn.message.trim() !== "",
  );
}

// Loader
export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseServerClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/login");
  }

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") ?? "0", 10);
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error } = await supabase
    .from("elevenlabs_history")
    .select("id, created_at, duration, summary, transcript")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    console.error("Failed to fetch elevenlabs_history:", error);
    return { user, conversations: [] as Conversation[], hasMore: false, page };
  }

  const conversations: Conversation[] = (data ?? [])
    .map((row) => ({
      ...row,
      transcript: parseTranscript(row.transcript),
    }))
    .filter((row) => row.transcript.length > 0);

  return {
    user,
    conversations,
    hasMore: data.length === PAGE_SIZE,
    page,
  };
}

// Component
const HistoryPage: React.FC = () => {
  const loaderData = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const [allConversations, setAllConversations] = useState<Conversation[]>(
    loaderData.conversations,
  );

  useEffect(() => {
    if (loaderData.page === 0) {
      setAllConversations(loaderData.conversations);
    } else {
      setAllConversations((prev) => [...prev, ...loaderData.conversations]);
    }
  }, [loaderData]);

  const handleLoadMore = () => {
    navigate(`?page=${loaderData.page + 1}`, { replace: true });
  };

  return (
    <>
      <Container>
        <ul className="max-w-[600px] mx-auto flex flex-1 flex-col gap-3 overflow-scroll">
          {allConversations.map((convo, convoIdx) => {
            const dateStr = new Date(convo.created_at).toLocaleDateString(
              "en-US",
              { year: "numeric", month: "long", day: "numeric" },
            );
            const prevDateStr =
              convoIdx > 0
                ? new Date(
                    allConversations[convoIdx - 1].created_at,
                  ).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })
                : null;
            const showDateHeader = dateStr !== prevDateStr;

            return (
              <React.Fragment key={convo.id}>
                {showDateHeader && (
                  <li className="mt-4 font-bold border-b border-gray-300 pb-1 mb-2 text-sm">
                    {dateStr}
                  </li>
                )}
                {convo.transcript.map((turn, idx) => (
                  <li className="flex flex-row" key={`${convo.id}-${idx}`}>
                    <ChatMessage
                      className={turn.role !== "agent" ? "w-10/12 ml-auto" : ""}
                      messageType={
                        turn.role === "agent" ? "incoming" : "outgoing"
                      }
                      text={turn.message}
                    />
                  </li>
                ))}
              </React.Fragment>
            );
          })}

          {loaderData.hasMore && (
            <li className="flex justify-center pt-4">
              <button
                onClick={handleLoadMore}
                className="py-2 px-5 bg-black text-white rounded-full"
              >
                Load more
              </button>
            </li>
          )}
        </ul>
      </Container>

      <div className="hidden fixed bottom-0 left-0 py-2 z-10 bg-paper-background w-full flex justify-center">
        <div className="px-8 max-w-[1024px] w-full mx-auto relative">
          <Link
            to="/app"
            className="inline-flex flex-row items-center py-2 px-5 bg-black text-white rounded-full"
          >
            <span>Back</span>
          </Link>
        </div>
      </div>
    </>
  );
};

export default HistoryPage;
