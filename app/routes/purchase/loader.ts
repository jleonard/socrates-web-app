import { products } from "~/server/product.manager.server";
import { redirect, type LoaderFunctionArgs } from "react-router";
import { getSupabaseServerClient } from "~/utils/supabase.server";
import { upsertUserProfile } from "~/server/user.last-seen.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseServerClient(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/login");
  }

  const { data: profile, error } = await upsertUserProfile(
    { user_id: user.id, email: user.email },
    request
  );

  return Response.json({
    pageTitle: "WonderWay",
    products,
  });
}
