import { SupabaseClient } from "@supabase/supabase-js";
import { AccessRecord } from "~/types";

import * as Sentry from "@sentry/react-router";

export async function createAccessRecordFromPromoCode(
  user_id: string,
  hours: number,
  promoCode: string,
  supabase: SupabaseClient,
) {
  try {
    const { data, error } = await supabase
      .from("access")
      .insert({
        user_id,
        promo_code: promoCode,
        hours: hours,
      })
      .select()
      .single();
    if (error) {
      Sentry.captureMessage(
        "access.manager.server : postgres error creating access record",
        {
          level: "error",
          extra: { user_id, promo_code: promoCode, hours, error },
        },
      );
    }
    return { data, error };
  } catch (e) {
    Sentry.captureException(e);
    return { data: null, error: e };
  }
}

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

    const hours = accessRecords.hours ?? 1;
    const now = new Date();
    const expirationDate = new Date(now.getTime() + hours * 60 * 60 * 1000);

    const { data: setData, error: setError } = await supabase
      .from("access")
      .update({ expiration: expirationDate.toISOString() })
      .eq("access_id", access_id);

    if (setError) {
      Sentry.captureMessage(
        "access.manager.server : postgres error setting expiration date for access",
        {
          level: "error",
          extra: { access_id },
        },
      );
    }

    return { data: setData, error: setError };
  } catch (err: any) {
    Sentry.captureException(err);
    return { data: null, error: { message: err.message } };
  }
}

export async function userHasAccess(
  user_id: string,
  supabase: SupabaseClient,
): Promise<AccessRecord | null> {
  // 01. Check for an active access record
  const { data: access, error: accessError } = await supabase
    .from("access")
    .select()
    .eq("user_id", user_id)
    .gte("expiration", new Date().toISOString())
    .order("expiration", { ascending: false })
    .limit(1)
    .single();

  if (accessError) {
    Sentry.captureMessage(
      "access.manager.server : postgres error checking for an active access record",
      {
        level: "error",
        extra: { user_id },
      },
    );
  }

  if (access) {
    const record = { ...access, category: "active" } as AccessRecord;
    return record;
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

  if (unusedAccessError) {
    Sentry.captureMessage(
      "access.manager.server : postgres error checking for unused access",
      {
        level: "error",
        extra: { user_id },
      },
    );
  }

  if (unusedAccess) {
    const record = { ...unusedAccess, category: "unused" } as AccessRecord;
    return record;
  }

  // 03. Check for expired access
  const { data: priorAccess, error: priorAccessError } = await supabase
    .from("access")
    .select()
    .eq("user_id", user_id)
    .order("expiration", { ascending: false })
    .limit(1)
    .single();

  if (priorAccessError) {
    Sentry.captureMessage(
      "access.manager.server : postgres error checking for expired access",
      {
        level: "error",
        extra: { user_id },
      },
    );
  }

  if (priorAccess && !priorAccessError) {
    const record = { ...priorAccess, category: "expired" } as AccessRecord;
    return record;
  }

  // 04. Give this user 20 minutes of free access.
  // the default hours on an access record is 20min
  const { data: newAccess, error: newAccessError } = await supabase
    .from("access")
    .insert({ user_id, promo_code: "trial" })
    .select()
    .single();

  if (newAccessError) {
    if (priorAccessError) {
      Sentry.captureMessage(
        "access.manager.server : postgres error setting trial access",
        {
          level: "error",
          extra: { user_id },
        },
      );
    }
  }

  if (newAccess && !newAccessError) {
    const record = { ...newAccess, category: "trial" } as AccessRecord;
    return record;
  }

  // this really shouldn't happen.
  Sentry.captureMessage("access.manager.server : unknown error", {
    level: "error",
    extra: { user_id },
  });
  return null;
}
