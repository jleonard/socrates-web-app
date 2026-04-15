import { type LoaderFunctionArgs } from "react-router";
import { Link } from "react-router";
import { getSupabaseBrowserClient } from "~/utils/supabase.client";
import { useLoaderData } from "react-router";
import { CircleImage } from "components/CircleImage/CircleImage";
import { GoogleAuthButton } from "components/GoogleAuthButton/GoogleAuthButton";
import { FacebookAuthButton } from "components/FacebookAuthButton/FacebookAuthButton";
import { logAppEventFromClient } from "~/utils/events/appEvents.client";

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
      env.SUPABASE_ANON_KEY,
    );
    logAppEventFromClient({
      event_type: "user_log_in",
      event_message: "Login",
      event_details: { provider: "google" },
    });
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
    logAppEventFromClient({
      event_type: "user_log_in",
      event_message: "Login",
      event_details: { provider: "facebook" },
    });
    const supabase = getSupabaseBrowserClient(
      env.SUPABASE_URL,
      env.SUPABASE_ANON_KEY,
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
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex flex-col gap-2 w-full max-w-96 items-center">
        <img
          className="w-[263px]"
          src="/logos/WonderWay-white.svg"
          alt="Wonder Way"
        />
        {/* text container */}
        <div className="flex flex-col gap-10 mb-28 text-center text-2xl font-regular items-center">
          <h2>
            is your musuem <br />
            companion
          </h2>
          <h2>Ask anything about the exhibition</h2>
          <h2>Follow your curiosity</h2>
        </div>
        <GoogleAuthButton
          className="w-full"
          label="Continue with Google"
          onClick={handleGoogleLogin}
        />
        <FacebookAuthButton
          onClick={handleFacebookLogin}
          label="Continue with Facebook"
        ></FacebookAuthButton>
        <p className="mt-3 text-xs text-center ">
          By signing up with Google or Facebook you agree to our <br />
          <Link className="underline" to="/terms">
            Terms &amp; Conditions
          </Link>{" "}
          and{" "}
          <Link className="underline" to="/privacy">
            Privacy Statement
          </Link>
        </p>
      </div>
    </>
  );
}
