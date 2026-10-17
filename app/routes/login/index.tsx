import { FacebookAuthButton } from "components/FacebookAuthButton/FacebookAuthButton";
import { GoogleAuthButton } from "components/GoogleAuthButton/GoogleAuthButton";
import { useTranslation } from "react-i18next";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { logAppEventFromClient } from "~/utils/events/appEvents.client";
import { getSupabaseBrowserClient } from "~/utils/supabase.client";

export async function loader({ request }: LoaderFunctionArgs) {
  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_KEY: process.env.SUPABASE_BROWSER_KEY,
  };
  return { env };
}

export default function Login() {
  const { t } = useTranslation();
  const { env } = useLoaderData<{
    env: { SUPABASE_URL: string; SUPABASE_KEY: string };
  }>();

  const handleGoogleLogin = async () => {
    const supabase = getSupabaseBrowserClient(
      env.SUPABASE_URL,
      env.SUPABASE_KEY,
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
      env.SUPABASE_KEY,
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
        <div className="mb-[60px] gap-2 flex flex-col items-center">
          <img
            className="w-[196px]"
            src="/logos/WonderWay.svg"
            alt="Wonder Way"
          />
          <p>{t("global.auth_tagline")}</p>
        </div>
        <img
          className="mb-[70px] w-[160px]"
          src="/logos/icon-sm.svg"
          alt="Wonder Way"
        />
        {/* text container */}
        <div className="flex flex-col gap-2 mb-[70px] text-center font-regular items-center">
          <h2 className="text-2xl">{t("global.sign_in")}</h2>
        </div>
        <GoogleAuthButton className="w-full" onClick={handleGoogleLogin} />
        <FacebookAuthButton onClick={handleFacebookLogin}></FacebookAuthButton>
        <p className="mt-3 text-xs text-center ">
          By signing up with Google or Facebook you agree to our <br />
          <Link className="underline" to="/terms">
            {t("nav.terms")}
          </Link>{" "}
          and{" "}
          <Link className="underline" to="/privacy">
            {t("nav.privacy")}
          </Link>
        </p>
      </div>
    </>
  );
}
