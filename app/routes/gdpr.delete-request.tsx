import type { ActionFunctionArgs } from "@remix-run/node";
import { data } from "@remix-run/node";
import crypto from "crypto";

import { getSupabaseServerClient } from "~/utils/supabase.server"; // Import helper to initialize supabase client

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

// Grab this from your FB Developer Dashboard
const APP_SECRET = process.env.FB_APP_SECRET || "FACEBOOK_APP_SECRET";

function decodeSignedRequest(signedRequest: string) {
  const [encodedSig, payload] = signedRequest.split(".");

  const sig = Buffer.from(encodedSig, "base64");
  const data = JSON.parse(Buffer.from(payload, "base64").toString());

  const expectedSig = crypto
    .createHmac("sha256", APP_SECRET)
    .update(payload)
    .digest();

  const sigIsValid = crypto.timingSafeEqual(sig, expectedSig);
  if (!sigIsValid) throw new Error("Invalid signature");

  return data;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabase } = getSupabaseServerClient(request);

  const formData = await request.formData();
  const signedRequest = formData.get("signed_request")?.toString();

  if (!signedRequest) {
    return data({ error: "Missing signed_request" }, { status: 400 });
  }

  try {
    const data = decodeSignedRequest(signedRequest);
    const facebookUserId = data.user_id;

    // 🔥 Anonymize the user data in supabase
    const anonymizedSessionId =
      "anon_" + crypto.randomBytes(10).toString("hex");

    const { error } = await supabase
      .from("n8n_chat_histories")
      .update({ session_id: anonymizedSessionId })
      .eq("session_id", facebookUserId);

    // Generate a unique confirmation code
    const confirmationCode = crypto.randomBytes(6).toString("hex");

    const statusUrl = `https://pilot.ayapi.ai/gdpr/status?code=${confirmationCode}`;

    // Store confirmationCode/status if you want to support lookups

    return {
      url: statusUrl,
      confirmation_code: confirmationCode,
    };
  } catch (error) {
    console.error("Facebook Deletion Error:", error);
    return data({ error: "Facebook Deletion Error" }, { status: 400 });
  }
};
