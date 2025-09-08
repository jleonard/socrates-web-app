// app/routes/auth/callback.tsx
import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { parseCookieHeader } from "@supabase/ssr";
import { getSupabaseServerClient } from "~/utils/supabase.server";
import { sessionStorage } from "~/sessions.server"; // your Remix session

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/";

  if (!code) return redirect("/auth/error");

  // optional: parse cookies if you need them for something
  parseCookieHeader(request.headers.get("Cookie") ?? "");

  // Initialize Supabase server client
  const { supabase, headers } = getSupabaseServerClient(request);

  // Exchange the code for a session
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("Error exchanging code for session:", error.message);
    return redirect("/auth/error");
  }

  // also update your Remix session if you want to store something
  const session = await sessionStorage.getSession(
    request.headers.get("Cookie")
  );
  session.set("loggedInAt", new Date().toISOString());

  // Merge Supabase headers and your Remix session cookie into one response
  return redirect(next, {
    headers: [
      ...headers.entries(), // Supabase cookies
      ["Set-Cookie", await sessionStorage.commitSession(session)], // your cookie
    ],
  });
}

export default function AuthCallback() {
  return (
    <div>
      <h1>Logging you in…</h1>
      <p>Please wait while we handle your login.</p>
    </div>
  );
}
