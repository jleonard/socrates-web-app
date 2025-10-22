import { products } from "~/server/product.manager.server";
import { redirect, type LoaderFunctionArgs } from "react-router";
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
    products,
  });
}
