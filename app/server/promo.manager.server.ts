import { SupabaseClient } from "@supabase/supabase-js";
import type { PromoRow } from "~/types";
import * as Sentry from "@sentry/react-router";
import { createAccessRecordFromPromoCode } from "./access.manager.server";

export async function setUserPromo(
  user_id: string,
  promo: string,
  supabase: SupabaseClient,
) {
  try {
    // check if there's an existing access record for this user with this promo code
    const { data: existing, error: existingError } = await supabase
      .from("access")
      .select()
      .eq("user_id", user_id)
      .eq("promo_code", promo.trim())
      .limit(1)
      .maybeSingle();

    if (existingError) {
      Sentry.captureMessage(
        "promo.manager.server : postgres error checking for promo",
        {
          level: "error",
          extra: { user_id, promo_code: promo },
        },
      );
      return { data: null, error: existingError };
    }

    // this user already has (or had) this promo
    if (existing) {
      return { data: existing, error: null };
    }

    if (!existing && !existingError) {
      // get the promo we're applying to the user
      const { data: promoRecord, error: promoError } = await supabase
        .from("promos")
        .select()
        .eq("code", promo)
        .limit(1)
        .maybeSingle();

      if (promoError) {
        Sentry.captureMessage(
          "promo.manager.server : postgres error getting the promo to apply",
          {
            level: "error",
            extra: { user_id, promo_code: promo },
          },
        );
        return { data: null, error: promoError };
      }
      if (!promoRecord)
        return { data: null, error: { message: "Promo code not found" } };

      if (promoRecord) {
        const { data: access, error: accessError } =
          await createAccessRecordFromPromoCode(
            user_id,
            promoRecord.hours,
            promo,
            supabase,
          );
        return { data: access, error: accessError };
      }
    }
  } catch (err: any) {
    Sentry.captureException(err);
    return { data: null, error: { message: err.message } };
  }

  Sentry.captureMessage("promo.manager.server : unexpected error", {
    level: "error",
    extra: { user_id, promo_code: promo },
  });
  return { data: null, error: { message: "Unexpected error" } };
}
