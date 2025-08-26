import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseServerClient } from "~/utils/supabase.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseServerClient(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/login");
  }

  return Response.json({
    pageTitle: "ayapi",
    user: user,
    n8nEndpoint:
      "https://leonardalonso.app.n8n.cloud/webhook-test/aa41599c-3236-45a5-8c17-a9702d3a56f7",
    elevenLabsId: "agent_7401k3kkgfyxen4a5a1xy5dphw5e",
  });
}
