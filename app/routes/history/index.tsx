import React, { useEffect, useState } from "react";
import { useLoaderData } from "@remix-run/react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseServerClient } from "~/utils/supabase.server";
import { redirect } from "@remix-run/node";

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

  return (
    <div>
      <h1>History</h1>
      <ul>
        {historial.map((item, idx) => {
          const message = (item as any).message;
          const timestampStr = message?.timestamp;
          const content = message?.content;

          // Gracefully skip items with no timestamp
          if (!timestampStr) return null;

          const timestamp = new Date(timestampStr);
          const currentDate = timestamp.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          });

          const prevMessage = (historial[idx - 1] as any)?.message;
          const prevTimestampStr = prevMessage?.timestamp;
          const prevDate = prevTimestampStr
            ? new Date(prevTimestampStr).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })
            : null;

          const showDateHeader = currentDate !== prevDate;

          return (
            <React.Fragment key={idx}>
              {showDateHeader && (
                <li style={{ fontWeight: "bold", marginTop: "1em" }}>
                  {currentDate}
                </li>
              )}
              <li>
                <span
                  style={{
                    color: "#999",
                    fontSize: "0.9em",
                    marginRight: "0.5em",
                  }}
                >
                  {timestamp.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                {typeof content === "string" ? content : "[Missing content]"}
              </li>
            </React.Fragment>
          );
        })}
      </ul>
    </div>
  );
};

export default HistoryPage;
