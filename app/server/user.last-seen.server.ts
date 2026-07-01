import { SupabaseClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/react-router";
import type { UserProfileInsert } from "~/types";
import { getSupabaseServiceRoleClient } from "~/utils/supabase.server";

/*
 * todo, refactor out the old upsertUserProfile below.
 * This one is better because it takes an existing supabase client vs a request
 */
export async function betterUpsertUserProfile(
  userObj: UserProfileInsert,
  supabase: SupabaseClient,
) {
  try {
    userObj.last_seen = new Date().toISOString();
    const { data, error } = await supabase
      .from("profiles")
      .upsert(userObj, { onConflict: "user_id" })
      .select()
      .single();

    if (error) {
      Sentry.captureMessage("betterUpsertUserProfile failed", {
        level: "error",
        extra: { user: userObj, error },
      });
    }
    return { data, error };
  } catch (err: any) {
    Sentry.captureMessage("betterUpsertUserProfile unexpected error", {
      level: "error",
      extra: { user: userObj, error: err },
    });
    return { data: null, error: { message: err.message } };
  }
}

export async function upsertUserProfile(userObj: UserProfileInsert) {
  try {
    const { supabase } = getSupabaseServiceRoleClient();

    userObj.last_seen = new Date().toISOString();

    const { data, error } = await supabase
      .from("profiles")
      .upsert(userObj, { onConflict: "user_id" })
      .select()
      .single();

    if (error) {
      Sentry.captureMessage("upsertUserProfile failed", {
        level: "error",
        extra: { user: userObj, error },
      });
      return { data: null, error: error };
    }

    return { data, error: null };
  } catch (err: any) {
    Sentry.captureMessage("upsertUserProfile unexpected error", {
      level: "error",
      extra: { user: userObj, error: err },
    });
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
