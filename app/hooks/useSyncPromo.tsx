/*
 * the job of this hook is to check if there's a localstorage promo
 * code set and if so, set it on the user profile
 * promo localstorage gets set by the root.tsx if there's a promo prop in the query string
 * we use promo query strings when users sign up at an event, from a postcard etc.
 * promo tells us where the user learned about us
 */
import { useEffect, useRef } from "react";
import { SupabaseClient } from "@supabase/supabase-js";

import { useRevalidator } from "react-router";

export function useSyncPromo(supabase: SupabaseClient, user_id: string | null) {
  const hasRunRef = useRef(false);

  const revalidator = useRevalidator();
  useEffect(() => {
    if (hasRunRef.current) return;
    hasRunRef.current = true;

    async function updatePromo() {
      if (!user_id) return;

      const promoCode = localStorage.getItem("promo");

      if (!promoCode) return;

      // check if there's an existing access record for this user with this promo code
      const { data: existing, error: existingError } = await supabase
        .from("access")
        .select()
        .eq("user_id", user_id)
        .eq("promo_code", promoCode.trim())
        .limit(1)
        .maybeSingle();

      // console.log("has existing promo ", existing, existingError);

      if (!existing && !existingError) {
        // get the source data for the promo code
        const { data: promo, error: promoError } = await supabase
          .from("promos")
          .select()
          .eq("code", promoCode)
          .limit(1)
          .maybeSingle();

        if (promo) {
          const { error: accessError } = await supabase.from("access").insert({
            user_id,
            promo_code: promo.code,
            hours: promo?.hours,
          });

          if (!accessError) {
            localStorage.removeItem("promo");
            revalidator.revalidate();
          }
        }
      }
    }
    updatePromo();
  }, [user_id, supabase]);
}
