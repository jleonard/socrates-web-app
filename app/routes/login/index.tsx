import { type LoaderFunctionArgs } from "@remix-run/node";

import { getSupabaseBrowserClient } from "~/utils/supabase.client";
import { useLoaderData } from "@remix-run/react";

export async function loader({ request }: LoaderFunctionArgs) {
  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  };
  return { env };
}

export default function Login() {
  const { env } = useLoaderData<{
    env: { SUPABASE_URL: string; SUPABASE_ANON_KEY: string };
  }>();

  const handleLogin = async () => {
    const supabase = getSupabaseBrowserClient(
      env.SUPABASE_URL,
      env.SUPABASE_ANON_KEY
    );
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/login/callback`, // Redirect back to your server
      },
    });
    if (error) {
      console.error("Login page error:", error.message);
    }
  };

  return (
    <div style={{ textAlign: "center", marginTop: "20px" }}>
      <h1>Login</h1>
      <button
        onClick={handleLogin}
        style={{ padding: "10px 20px", fontSize: "16px" }}
      >
        Sign in with Google
      </button>
    </div>
  );
}
