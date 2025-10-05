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

      const promo = localStorage.getItem("promo");
      if (!promo) return;

      const { error } = await supabase
        .from("profiles")
        .update({ promo_code: promo })
        .eq("user_id", user_id);

      if (!error) {
        localStorage.removeItem("promo");
      } else {
        //console.log("error ", error);
      }
    }
    updatePromo();
  }, [user_id, supabase]);
}
