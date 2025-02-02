// app/routes/auth/callback.tsx
import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { parseCookieHeader } from "@supabase/ssr";
import { getSupabaseServerClient } from "~/utils/supabase.server"; // Import helper to initialize supabase client

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/app"; // Redirect to a specific page after login (optional)

  if (code) {
    // Parse cookies from the request
    const cookies = parseCookieHeader(request.headers.get("Cookie") ?? "");

    // Initialize Supabase server client
    const { supabase, headers } = getSupabaseServerClient(request);

    // Exchange the code for a session
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("Error exchanging code for session:", error.message);
      return redirect("/auth/error"); // Redirect to an error page
    } else {
      console.log("no error on callback");
    }

    // Redirect to the intended page (or home page by default)
    return redirect(next, { headers });
  }

  // If no code is present, redirect to login or error page
  return redirect("/auth/error");
}

export default function AuthCallback() {
  return (
    <div>
      <h1>Logging you in...</h1>
      <p>Please wait while we handle your login.</p>
    </div>
  );
}
