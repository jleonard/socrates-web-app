import React, { useEffect, useState } from "react";
import { useLoaderData, Link } from "@remix-run/react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseServerClient } from "~/utils/supabase.server";
import { redirect } from "@remix-run/node";
import ChatMessage from "components/ChatMessage/ChatMessage";
import { ChevronLeft } from "lucide-react";

type HistoryItem = Record<string, unknown>;

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseServerClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/login");
  }

  return {
    user,
  };
}

const HistoryPage: React.FC = () => {
  const loaderData = useLoaderData<{ user?: { id: string } } | null>();
  const userId = loaderData?.user?.id;
  const [historial, setHistorial] = useState<HistoryItem[]>([]);

  useEffect(() => {
    if (!userId) return;
    fetch(
      `https://leonardalonso.app.n8n.cloud/webhook/f4140ee1-ae3d-487a-8487-028196f983b1?session=${encodeURIComponent(
        userId
      )}`
    )
      .then((res) => res.json())
      .then((data) => {
        setHistorial(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        setHistorial([]);
      });
  }, [userId]);

  if (!userId) {
    return <div>404 not found. Try to login.</div>;
  }

  // Helper: group by date with sorting
  const groupAndSortHistory = (items: HistoryItem[]) => {
    const sorted = [...items].sort((a, b) => {
      const aTime = new Date((a as any).message?.timestamp).getTime();
      const bTime = new Date((b as any).message?.timestamp).getTime();
      return aTime - bTime;
    });

    // Group by formatted date string
    const groups: Record<string, HistoryItem[]> = {};
    for (const item of sorted) {
      const timestampStr = (item as any).message?.timestamp;
      if (!timestampStr) continue;

      const dateStr = new Date(timestampStr).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      if (!groups[dateStr]) groups[dateStr] = [];
      groups[dateStr].push(item);
    }

    // Return array sorted by date descending (newest dates first)
    return Object.entries(groups).sort(
      ([dateA], [dateB]) =>
        new Date(dateB).getTime() - new Date(dateA).getTime()
    );
  };

  const groupedHistory = groupAndSortHistory(historial);

  return (
    <div>
      <ul className="max-w-[600px] pb-9 flex flex-col gap-3">
        {groupedHistory.map(([date, entries]) => (
          <React.Fragment key={date}>
            <li className="mt-4 font-bold border-b border-gray-300 pb-1 mb-2">
              {date}
            </li>
            {entries.map((item, idx) => {
              const message = (item as any).message;
              const content = message?.content;
              const messageType =
                message?.type && message.type === "ai"
                  ? "incoming"
                  : "outgoing";

              return (
                <li className="flex flex-row" key={idx}>
                  <ChatMessage
                    className={
                      messageType !== "incoming" ? "w-8/12 ml-auto" : ""
                    }
                    messageType={messageType}
                    text={content}
                  />
                </li>
              );
            })}
          </React.Fragment>
        ))}
      </ul>
      <Link
        to="/app"
        className="fixed left-6 bottom-3 z-10 flex flex-row items-center p-2 bg-black text-white rounded-xs"
      >
        <ChevronLeft size={20} />
        <span>Back</span>
      </Link>
    </div>
  );
};

export default HistoryPage;
