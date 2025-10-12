import { Stripe } from "stripe";
import { redirect, json } from "@remix-run/node";

export async function action({ request }: { request: Request }) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2024-06-20",
  });

  try {
    const body = await request.json();
    const {
      priceId,
      mode = "payment",
      successPath = "/success",
      cancelPath = "/cancel",
    } = body;

    if (!priceId) {
      return json({ error: "Missing priceId" }, { status: 400 });
    }

    const DOMAIN = process.env.BASE_URL;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${DOMAIN}${successPath}`,
      cancel_url: `${DOMAIN}${cancelPath}`,
    });

    return redirect(session.url!, 303);
  } catch (err: any) {
    console.error(err);
    return json({ error: err.message }, { status: 500 });
  }
}
