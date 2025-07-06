// app/routes/auth/callback.tsx
import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseServerClient } from "~/utils/supabase.server"; // Import helper to initialize supabase client

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseServerClient(request);
  await supabase.auth.signOut();
  return {};
}

export default function AuthCallback() {
  return (
    <div>
      <h1>You've been signed out.</h1>
      <a href="/login">Sign in</a>
    </div>
  );
}
