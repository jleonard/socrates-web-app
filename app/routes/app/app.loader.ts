import { json, redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseServerClient } from "~/utils/supabase.server";

export async function loader({ context, request }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseServerClient(request);
  console.log("loader is here ");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/login");
  } else {
    console.log("bam! ", user.user_metadata);
  }

  return Response.json({
    pageTitle: "App",
    user: user,
  });
}
