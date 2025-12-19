import { redirect, type LoaderFunctionArgs } from "react-router";
import { getSupabaseServerClient } from "~/utils/supabase.server";

export async function loader({ context, request }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseServerClient(request);

  /* debug
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/login");
  } else {
    console.log("auth: ", user.user_metadata);
  }
    */

  const user = "foo";

  return Response.json({
    pageTitle: "WonderWay",
    user: user,
    n8nEndpoint: process.env.N8N_URL!,
    elevenLabsId: process.env.ELEVENLABS_AGENT!,
  });
}
