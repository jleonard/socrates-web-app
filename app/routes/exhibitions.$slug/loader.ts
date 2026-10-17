import type { LoaderFunctionArgs } from "react-router";
import { data, useLoaderData } from "react-router";
import { getSupabaseServiceRoleClient } from "~/utils/supabase.server";

export async function loader({ params }: LoaderFunctionArgs) {
  const slug = params.slug;

  if (!slug) {
    throw data({ error: "Missing exhibition slug" }, { status: 400 });
  }

  const { supabase } = getSupabaseServiceRoleClient();

  const { data: relationship, error } = await supabase
    .from("location_relationships")
    .select("name, description, large_image, thumbnail, child_id")
    .eq("child_id", slug)
    .eq("child_type", "exhibition")
    .maybeSingle();

  if (error) {
    console.error("[exhibitions/$slug] supabase error:", error);
    throw data({ error: "Failed to load exhibition" }, { status: 500 });
  }

  if (!relationship) {
    throw data({ error: "Exhibition not found" }, { status: 404 });
  }

  return {
    pageTitle: relationship?.name,
    exhibition: relationship,
  };
}
