import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseServerClient } from "~/utils/supabase.server";

export async function loader({ context, request }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseServerClient(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/login");
  } else {
    console.log("auth: ", user.user_metadata);
  }

  return Response.json({
    pageTitle: "Eleven",
    user: user,
    n8nEndpoint: process.env.N8N_URL!,
  });
}
