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
    n8nEndpoint: process.env.N8N_URL!,
    elevenLabsId: "agent_7401k3kkgfyxen4a5a1xy5dphw5e",
  });
}
