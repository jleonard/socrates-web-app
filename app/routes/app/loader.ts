import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseServerClient } from "~/utils/supabase.server";
import { getSessionId, sessionStorage } from "~/sessions.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseServerClient(request);
  const { session, sessionId } = await getSessionId(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/login");
  }

  // Upsert profile data on every load
  const { data: profile, error } = await supabase
    .from("profiles")
    .upsert(
      {
        user_id: user.id,
        email: user.email,
        last_seen: new Date(),
      },
      { onConflict: "user_id" }
    )
    .select()
    .single();

  if (error) {
    console.log("sb error: ", error);
  }

  return Response.json(
    {
      pageTitle: "ayapi",
      user: user,
      user_profile: error ? {} : profile,
      sessionId,
      n8nEndpoint:
        "https://leonardalonso.app.n8n.cloud/webhook-test/aa41599c-3236-45a5-8c17-a9702d3a56f7o",
      elevenLabsId: process.env.ELEVENLABS_AGENT!,
    },
    {
      headers: {
        "Set-Cookie": await sessionStorage.commitSession(session),
      },
    }
  );
}
