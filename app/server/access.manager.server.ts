import { SupabaseClient } from "@supabase/supabase-js";

export async function setAccessExpiration(access_id: string, request: Request) {
  try {
    const { getSupabaseServerClient } = await import("~/utils/supabase.server");

    const { supabase } = getSupabaseServerClient(request);

    const { data: accessRecords, error: fetchError } = await supabase
      .from("access")
      .select("*")
      .eq("access_id", access_id)
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      return { data: null, error: fetchError };
    }
    if (!accessRecords) {
      return { data: null, error: { message: "Access record not found" } };
    }

    const hours = accessRecords.hours ?? 4;
    const now = new Date();
    const expirationDate = new Date(now.getTime() + hours * 60 * 60 * 1000);

    const { data: setData, error: setError } = await supabase
      .from("access")
      .update({ expiration: expirationDate })
      .eq("access_id", access_id);

    return { setData, setError };
  } catch (err: any) {
    return { data: null, error: { message: err.message } };
  }
}

export async function userHasAccess(user_id: string, supabase: SupabaseClient) {
  // 01. Check for an active access record
  const { data: access, error: accessError } = await supabase
    .from("access")
    .select()
    .eq("user_id", user_id)
    .gte("expiration", new Date().toISOString())
    .order("expiration", { ascending: false })
    .limit(1)
    .single();

  if (access) {
    access.category = "active";
    return access;
  }

  // 02. check if there's an unused access record
  const { data: unusedAccess, error: unusedAccessError } = await supabase
    .from("access")
    .select()
    .eq("user_id", user_id)
    .is("expiration", null) // 👈 only records with expiration = NULL
    .order("expiration", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (unusedAccess) {
    unusedAccess.category = "unused";
    return unusedAccess;
  }

  // 03. Check for prior access
  const { data: priorAccess, error: priorAccessError } = await supabase
    .from("access")
    .select()
    .eq("user_id", user_id)
    .order("expiration", { ascending: false })
    .limit(1)
    .single();

  if (priorAccess && !priorAccessError) {
    priorAccess.category = "expired";
    return priorAccess;
  }

  // 04. Give this user 20 minutes of free access.
  // the default hours on an access record is 20min
  const { data: newAccess, error: newAccessError } = await supabase
    .from("access")
    .insert({ user_id, promo_code: "trial" })
    .select()
    .single();

  if (newAccess && !newAccessError) {
    newAccess.category = "trial";
    return newAccess;
  }

  // this really shouldn't happen.
  return { category: "none" };
}
