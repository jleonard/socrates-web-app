import { type LoaderFunctionArgs } from "@remix-run/node";
import { Link } from "@remix-run/react";
import { getSupabaseBrowserClient } from "~/utils/supabase.client";
import { useLoaderData } from "@remix-run/react";

import { GoogleAuthButton } from "components/GoogleAuthButton/GoogleAuthButton";

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

  const handleGoogleLogin = async () => {
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
      console.error("Login page error:", error?.message);
    }
  };

  const handleFacebookLogin = async () => {
    const supabase = getSupabaseBrowserClient(
      env.SUPABASE_URL,
      env.SUPABASE_ANON_KEY
    );
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "facebook",
      options: {
        redirectTo: `${window.location.origin}/login/callback`, // Redirect back to your server
      },
    });
    if (error) {
      console.error("Login page error:", error?.message);
    }
  };

  return (
    <div className="flex flex-col max-w-96 mx-auto items-center">
      <div className="mt-80 pb-28 flex flex-col gap-3 items-center">
        <GoogleAuthButton
          className="w-full"
          label="Continue with Google"
          onClick={handleGoogleLogin}
        />
        <button onClick={handleFacebookLogin}>Continue with Facebook</button>
        <p className="mt-5 text-xs">
          By signing in you agree to our{" "}
          <Link to="/terms">Terms &amp; Conditions</Link> and{" "}
          <Link to="/privacy">Privacy Statement</Link>
        </p>
      </div>
    </div>
  );
}
