import { ControlBar } from "components/ControlBar/ControlBar";
import { ErrorBoundary as RootErrorBoundary } from "components/ErrorBoundary/ErrorBoundary";
import { Nav } from "components/Nav/Nav";
import { OverlayNav } from "components/OverlayNav/OverlayNav";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { LinksFunction } from "react-router";
import {
  data,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useMatches,
} from "react-router";
import { NavOverlayProvider } from "./context/nav-overlay";
import { usePageConfig } from "./hooks/usePageConfig";
import { usePageViews } from "./hooks/usePageViews";
import {
  getLocale,
  i18nextMiddleware,
  localeCookie,
} from "./middleware/i18next.server";

import "./tailwind.css";

export const middleware = [i18nextMiddleware];

export const links: LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Montserrat:ital,wght@0,100..900;1,100..900&display=swap",
  },
];

export const loader = async ({
  request,
  context,
}: {
  request: Request;
  context: any;
}) => {
  const locale = getLocale(context);

  return data(
    {
      GA_TRACKING_ID: process.env.GA_TRACKING_ID,
      locale,
    },
    { headers: { "Set-Cookie": await localeCookie.serialize(locale) } },
  );
};

export function Layout({ children }: { children: React.ReactNode }) {
  const { backgroundClass } = usePageConfig();
  const { i18n } = useTranslation();

  // Handle the case where useLoaderData might fail in error boundaries
  let GA_TRACKING_ID: string | undefined;
  try {
    const loaderData = useLoaderData<typeof loader>();
    GA_TRACKING_ID = loaderData?.GA_TRACKING_ID;
  } catch (error) {
    // If useLoaderData fails (e.g., in error boundary), use undefined
    GA_TRACKING_ID = undefined;
  }

  // ✅ Track route changes with google analytics
  usePageViews(GA_TRACKING_ID);

  const matches = useMatches();
  const scrollable = matches.some((m) => (m.handle as any)?.scrollable);
  console.log(
    "scrollable:",
    scrollable,
    matches.map((m) => m.handle),
  );

  return (
    <html lang={i18n.language} dir={i18n.dir(i18n.language)}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        {GA_TRACKING_ID && (
          <>
            <script
              async
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_TRACKING_ID}`}
            />
            <script
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', '${GA_TRACKING_ID}', {
                    page_path: window.location.pathname,
                  });
                `,
              }}
            />
          </>
        )}
      </head>
      {/* px-8 max-w-[1024px] border border-red-600 w-screen h-screen mx-auto my-0 relative overflow-hidden overflow-x-clip z-0 ${useBackgroundClass()}` */}
      <body className={`m-0 ${backgroundClass}`}>
        <NavOverlayProvider>
          <div className="flex flex-col h-svh w-screen relative overflow-hidden z-0">
            <OverlayNav />

            <Nav />

            <main
              className={`flex-1 min-h-0 pb-safe relative ${
                scrollable
                  ? "overflow-y-auto"
                  : "overflow-hidden overflow-x-clip overflow-y-clip"
              }`}
            >
              {children}
            </main>
            <ControlBar />
            <ScrollRestoration />
            <Scripts />
          </div>
        </NavOverlayProvider>
      </body>
    </html>
  );
}

export default function App() {
  const { locale } = useLoaderData<typeof loader>();
  const { i18n } = useTranslation();

  useEffect(() => {
    if (i18n.language !== locale) i18n.changeLanguage(locale);
  }, [locale, i18n]);

  /*
   * process query string vars here
   *
   * promo = promo codes give users free access to the site.
   * they are processed with the 'useSyncPromo' hook
   *
   * place = used to capture the museum or insitution being visited
  
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);

    console.log("set params : ", params);

    // store promo
    const promoCode = params.get("promo");
    if (promoCode) {
      console.log("promo : ", promoCode);
      localStorage.setItem("promo", promoCode);
    }
  }, [location.search]);
   */

  return <Outlet />;
}

export { RootErrorBoundary as ErrorBoundary };
