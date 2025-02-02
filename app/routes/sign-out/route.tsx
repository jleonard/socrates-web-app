// app/routes/auth/callback.tsx
import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { getSupabaseServerClient } from "~/utils/supabase.server"; // Import helper to initialize supabase client

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase } = getSupabaseServerClient(request);
  await supabase.auth.signOut();
  return redirect("/login");
}

export default function AuthCallback() {
  return (
    <div>
      <h1>Signing out...</h1>
    </div>
  );
}
