import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseServerClient } from "~/utils/supabase.server";

export async function loader({ context, request }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseServerClient(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/login");
  }

  const { error } = await supabase
    .from("profiles")
    .update({ has_onboarded: true })
    .eq("user_id", user.id);

  return Response.json({
    pageTitle: "ayapi",
  });
}
