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
          const timestamp = new Date(item.timestamp as string);
          const currentDate = timestamp.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          });
          const prevItem = historial[idx - 1];
          const prevDate = prevItem
            ? new Date(prevItem.timestamp as string).toDateString()
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
                {typeof item === "object" ? JSON.stringify(item) : String(item)}
              </li>
            </React.Fragment>
          );
        })}
      </ul>
      <ul>
        {historial.map((item, idx) => (
          <li key={idx}>
            {typeof item === "object" ? JSON.stringify(item) : String(item)}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default HistoryPage;
