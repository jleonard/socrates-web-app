import { Stripe } from "stripe";
import { redirect, data } from "@remix-run/node";
import { products, productKeys } from "~/server/product.manager.server";
import { getSupabaseServerClient } from "~/utils/supabase.server";

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
    const body = await request.formData();

    const productCode = body.get("productCode");

    /* front end didn't pass day or week */
    if (!productKeys.includes(productCode as any)) {
      return data(
        { error: `Invalid product code: ${productCode}` },
        { status: 400 }
      );
    }

    const product = products[productCode as keyof typeof products];

    /* might be an env var not set in product.manager.server */
    if (!product) {
      return data({ error: "Missing product id" }, { status: 400 });
    }
    console.log("product: ", product);

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
      success_url: `${DOMAIN}/confirmation/${productCode}`,
      cancel_url: `${DOMAIN}/purchase`,
      metadata: {
        productCode: product.code,
        productHours: product.hours,
      },
    });

    return redirect(session.url!, 303);
  } catch (err: any) {
    console.error(err);
    return data({ error: err.message }, { status: 500 });
  }
}
