// app/routes/webhooks/stripe.ts
import type { ActionFunction } from "react-router";
import { data } from "react-router";
import Stripe from "stripe";
import { getSupabaseServiceRoleClient } from "~/utils/supabase.server";
import { validate as isUUID } from "uuid";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-09-30.clover",
});

export const action: ActionFunction = async ({ request }) => {
  const sig = request.headers.get("stripe-signature");
  const body = await request.text();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig!,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error("⚠️ Webhook signature verification failed.", err.message);
    // todo sentry
    return data({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // Your internal user ID
    const userId = session.client_reference_id;

    if (!isUUID(userId)) {
      throw new Error(`Invalid UUID: ${userId}`);
    }

    console.log("user id is ", userId);

    // Product purchased
    const productCode = session.metadata?.productCode;
    const productHours = session.metadata?.productHours;

    if (!userId || !productCode) {
      console.warn("Missing userId or productCode in session metadata");
      return data({ error: "Missing metadata" }, { status: 400 });
    }

    try {
      // Initialize Supabase server admin client
      const { supabase: supabaseAdmin } = getSupabaseServiceRoleClient(request);

      // Create an access record
      const { data: accessRecord, error: accessError } = await supabaseAdmin
        .from("access")
        .insert({
          user_id: userId,
          product_code: productCode,
          hours: productHours,
        })
        .select()
        .single();

      // @todo - user made a purchase but there was an issue creating the access record
      // todo sentry
      if (accessError) {
        console.error(
          "Supabase error: access record error on purchase webhook: ",
          accessError.code,
          accessError.message,
          userId
        );
      }

      // now let's create a purchase record
      const { data: purchase, error: purchaseRecordError } = await supabaseAdmin
        .from("purchases")
        .insert({
          user_id: userId,
          access_id: accessRecord?.access_id ?? 0,
          stripe_payment_intent: session.payment_intent,
          stripe_session_id: session.id,
          stripe_product_code: productCode,
          stripe_amount_total: session.amount_total,
          stripe_currency: session.currency,
          stripe_payment_status: session.payment_status,
          product_hours: productHours,
        })
        .select()
        .single();

      // @todo - user made a purchase but we didn't create an access record
      // todo sentry
      if (purchaseRecordError) {
        console.error(
          "Supbase error: purchase record error on purchase webhook : ",
          purchaseRecordError.code,
          purchaseRecordError.message
        );
      }

      if (accessError || purchaseRecordError) {
        return data({ error: "db error" }, { status: 500 });
      }
    } catch (err: any) {
      console.error("Unexpected error updating access:", err.message);
      return data({ error: err.message }, { status: 500 });
    }
  } else {
    console.log(`Unhandled Stripe event type: ${event.type}`);
  }

  return { received: true };
};
