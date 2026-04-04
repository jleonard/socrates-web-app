// app/routes/auth/callback.tsx
import { redirect, type LoaderFunctionArgs } from "react-router";
import { parseCookieHeader } from "@supabase/ssr";
import { getSupabaseServerClient } from "~/utils/supabase.server";
import { sessionStorage } from "~/sessions.server"; // your Remix session
import * as Sentry from "@sentry/react-router";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/";

  if (!code) {
    Sentry.captureMessage(
      "login.callback : no code param in the query string",
      {
        level: "error",
      },
    );
    return redirect("/auth/error");
  }

  // optional: parse cookies if you need them for something
  parseCookieHeader(request.headers.get("Cookie") ?? "");

  // Initialize Supabase server client
  const { supabase, headers } = getSupabaseServerClient(request);

  // Exchange the code for a session
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    Sentry.captureMessage("login.callback : error exchaning code for session", {
      level: "error",
      extra: { error },
    });
    return redirect("/auth/error");
  }

  // also update your Remix session if you want to store something
  const session = await sessionStorage.getSession(
    request.headers.get("Cookie"),
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
