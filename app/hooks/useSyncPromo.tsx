/*
 * the job of this hook is to check if there's a localstorage promo
 * code set and if so, set it on the user profile
 * promo localstorage gets set by the root.tsx if there's a promo prop in the query string
 * we use promo query strings when users sign up at an event, from a postcard etc.
 * promo tells us where the user learned about us
 */
import { useEffect } from "react";
import { SupabaseClient } from "@supabase/supabase-js";

export function useSyncPromo(supabase: SupabaseClient, user_id: string | null) {
  useEffect(() => {
    async function updatePromo() {
      if (!user_id) return;

      const promoCode = localStorage.getItem("promo");
      if (!promoCode) return;

      console.log("has promo code ", promoCode, user_id);

      // check if there's an existing access record for this user with this promo code
      const { data: existing, error: existingError } = await supabase
        .from("access")
        .select()
        .eq("user_id", String(user_id).trim())
        .eq("promo_code", promoCode.trim())
        .maybeSingle();

      console.log("has existing promo ", existing, existingError);

      if (!existing) {
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
            duration: promo?.duration,
          });

          if (!accessError) {
            localStorage.removeItem("promo");
          }
        }
      }
    }
    updatePromo();
  }, [user_id, supabase]);
}
