import { type LoaderFunctionArgs } from "@remix-run/node";
import { Link } from "@remix-run/react";
import { getSupabaseBrowserClient } from "~/utils/supabase.client";
import { useLoaderData } from "@remix-run/react";
import { Circles } from "components/Circles/Circles";
import { GoogleAuthButton } from "components/GoogleAuthButton/GoogleAuthButton";
import { FacebookAuthButton } from "components/FacebookAuthButton/FacebookAuthButton";

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
    <>
      <div className="fixed w-dvw h-dvh top-0 left-0 pointer-events-none">
        <Circles mode="idle"></Circles>
      </div>
      <div className="fixed bottom-14 left-1/2 transform -translate-x-1/2 flex flex-col gap-3 max-w-96 items-center">
        <h2 className="font-thin text-3xl text-gray-800 text-center mb-9">
          Your AI Companion for
          <br />
          Cultural Exploration
        </h2>
        <GoogleAuthButton
          className="w-full"
          label="Continue with Google"
          onClick={handleGoogleLogin}
        />
        <FacebookAuthButton
          onClick={handleFacebookLogin}
          label="Continue with Facebook"
        ></FacebookAuthButton>
        <p className="mt-5 text-xs">
          By signing in you agree to our{" "}
          <Link to="/terms">Terms &amp; Conditions</Link> and{" "}
          <Link to="/privacy">Privacy Statement</Link>
        </p>
      </div>
    </>
  );
}
