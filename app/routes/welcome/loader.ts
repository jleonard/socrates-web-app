import { redirect, type LoaderFunctionArgs } from "react-router";
import { getSupabaseServerClient } from "~/utils/supabase.server";
import { upsertUserProfile } from "~/server/user.last-seen.server";

export async function loader({ context, request }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseServerClient(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/login");
  }

  const { data: profile, error } = await upsertUserProfile(
    {
      user_id: user.id,
      email: user.email,
      has_onboarded: true,
    },
    request
  );

  /*
  const { error } = await supabase
    .from("profiles")
    .update({ has_onboarded: true })
    .eq("user_id", user.id);
    */

  return Response.json({
    pageTitle: "ayapi",
  });
}
