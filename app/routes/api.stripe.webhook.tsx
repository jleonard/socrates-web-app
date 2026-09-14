// app/routes/webhooks/stripe.ts
import * as Sentry from "@sentry/react-router";
import type { ActionFunction } from "react-router";
import { data } from "react-router";
import Stripe from "stripe";
import { validate as isUUID } from "uuid";
import { sendPurchaseToGA } from "~/utils/googleAnalytics.server";
import { getSupabaseServiceRoleClient } from "~/utils/supabase.server";

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
      process.env.STRIPE_WEBHOOK_SECRET!,
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

    if (!userId || !isUUID(userId)) {
      return data({ error: "Missing or invalid userId" }, { status: 400 });
    }

    // Product purchased
    const productCode = session.metadata?.productCode;

    if (!productCode) {
      console.warn("Missing productCode in session metadata");
      return data({ error: "Missing metadata" }, { status: 400 });
    }

    // set product hours and error if not there
    const productHours = session.metadata?.productHours;
    const productHoursNum = productHours ? Number(productHours) : NaN;
    // error if not prouct hours
    if (!Number.isFinite(productHoursNum)) {
      Sentry.captureException(
        new Error("Missing or invalid productHours in Stripe session metadata"),
        {
          level: "error",
          tags: {
            source: "api.stripe.webhook",
            feature: "post_purchase",
            action: "validate_metadata",
          },
          extra: { userId, productCode, productHours, sessionId: session.id },
        },
      );
      return data(
        { error: "Missing or invalid productHours" },
        { status: 400 },
      );
    }

    // set payment intent and error if not avail
    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent?.id ?? null);

    if (!paymentIntentId) {
      Sentry.captureException(
        new Error("Missing payment_intent on Stripe session"),
        {
          level: "error",
          tags: {
            source: "api.stripe.webhook",
            feature: "post_purchase",
            action: "validate_metadata",
          },
          extra: { userId, productCode, sessionId: session.id },
        },
      );
      return data({ error: "Missing payment_intent" }, { status: 400 });
    }

    // set amountTotal and error if not there
    const amountTotal = session.amount_total;
    // error if no amount total
    if (amountTotal == null) {
      Sentry.captureException(
        new Error("Missing amount_total on Stripe session"),
        {
          level: "error",
          tags: {
            source: "api.stripe.webhook",
            feature: "post_purchase",
            action: "validate_metadata",
          },
          extra: { userId, productCode, sessionId: session.id },
        },
      );
      return data({ error: "Missing amount_total" }, { status: 400 });
    }

    let gaClientId = session.metadata?.gaClientId; // google analtyics client id tracking

    if (!gaClientId) {
      gaClientId = "unknown";
    }

    sendPurchaseToGA({
      clientId: gaClientId,
      transactionId: session.id,
      value: amountTotal,
    });

    try {
      // Initialize Supabase server admin client
      const { supabase: supabaseAdmin } = getSupabaseServiceRoleClient();

      // Create an access record
      const { data: accessRecord, error: accessError } = await supabaseAdmin
        .from("access")
        .insert({
          user_id: userId,
          product_code: productCode,
          hours: productHoursNum,
        })
        .select()
        .single();

      // user made a purchase but there was an issue creating the access record
      if (accessError) {
        Sentry.captureException(accessError, {
          level: "error",
          tags: {
            source: "api.stripe.webhook",
            feature: "post_purchase",
            action: "access_record",
          },
          extra: {
            userId,
            productCode,
            productHours,
          },
        });
      }

      // now let's create a purchase record
      const { data: purchase, error: purchaseRecordError } = await supabaseAdmin
        .from("purchases")
        .insert({
          user_id: userId,
          access_id: accessRecord?.access_id ?? null,
          stripe_payment_intent: paymentIntentId,
          stripe_session_id: session.id,
          stripe_product_code: productCode,
          stripe_amount_total: amountTotal,
          stripe_currency: session.currency ?? "unknown",
          stripe_payment_status: session.payment_status,
          product_hours: productHoursNum,
        })
        .select()
        .single();

      // user made a purchase but we didn't create a record of it
      if (purchaseRecordError) {
        Sentry.captureException(purchaseRecordError, {
          level: "error",
          tags: {
            source: "api.stripe.webhook",
            feature: "post_purchase",
            action: "purchase_record",
          },
          extra: {
            userId,
            productCode,
            productHours,
            stripePaymentIntent: paymentIntentId,
            stripeSessionId: session.id,
            stripeAmountTotal: amountTotal,
            stripeCurrency: session.currency,
          },
        });
      }

      if (accessError || purchaseRecordError) {
        return data({ error: "db error" }, { status: 500 });
      }
    } catch (err: any) {
      return data({ error: err.message }, { status: 500 });
    }
  } else {
    console.log(`Unhandled Stripe event type: ${event.type}`);
  }
  return { received: true };
};
