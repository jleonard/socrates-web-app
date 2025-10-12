import { Stripe } from "stripe";
import { redirect, json } from "@remix-run/node";
import { products, productKeys } from "~/server/product.manager.server";
import { getSupabaseServerClient } from "~/utils/supabase.server";
import { getSessionId, sessionStorage } from "~/sessions.server";

export async function action({ request }: { request: Request }) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-09-30.clover",
  });

  const { supabase } = getSupabaseServerClient(request);
  //const { session, sessionId } = await getSessionId(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/login");
  }

  try {
    const body = await request.json();

    const {
      productCode,
      successPath = "/success",
      cancelPath = "/cancel",
    } = body;

    /* front end didn't pass day or week */
    if (!productKeys.includes(productCode as any)) {
      return json(
        { error: `Invalid product code: ${productCode}` },
        { status: 400 }
      );
    }

    const product = products[productCode as keyof typeof products];

    /* might be an env var not set in product.manager.server */
    if (!product) {
      return json({ error: "Missing product id" }, { status: 400 });
    }

    const DOMAIN = process.env.BASE_URL;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price: product.code,
          quantity: 1,
        },
      ],
      client_reference_id: user.id,
      success_url: `${DOMAIN}${successPath}`,
      cancel_url: `${DOMAIN}${cancelPath}`,
      metadata: {
        productCode: product.code,
        productHours: product.hours,
      },
    });

    return redirect(session.url!, 303);
  } catch (err: any) {
    console.error(err);
    return json({ error: err.message }, { status: 500 });
  }
}
