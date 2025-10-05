import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useLocation,
} from "@remix-run/react";
import { useEffect } from "react";
import type { LinksFunction, LoaderFunction } from "@remix-run/node";
import { usePageViews } from "./hooks/usePageViews";
import { useBackgroundClass } from "./hooks/useBackgroundClass";

import { Nav } from "components/Nav/Nav";

import "./tailwind.css";

export const links: LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

export const loader: LoaderFunction = () => {
  return {
    GA_TRACKING_ID: process.env.GA_TRACKING_ID, // Load from .env
  };
};

export function Layout({ children }: { children: React.ReactNode }) {
  // Handle the case where useLoaderData might fail in error boundaries
  let GA_TRACKING_ID: string | undefined;
  try {
    const data = useLoaderData<typeof loader>();
    GA_TRACKING_ID = data?.GA_TRACKING_ID;
  } catch (error) {
    // If useLoaderData fails (e.g., in error boundary), use undefined
    GA_TRACKING_ID = undefined;
  }

  // ✅ Track route changes with google analytics
  usePageViews(GA_TRACKING_ID);

  const location = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const promoCode = params.get("promo");
    if (promoCode) {
      localStorage.setItem("promo", promoCode);
    }
  }, [location.search]);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        {/* font */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,100..900;1,100..900&display=swap"
          rel="stylesheet"
        />
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
      <body className={`m-0 overflow-hidden ${useBackgroundClass()}`}>
        <div
          className={`px-8 max-w-[1024px] w-screen h-screen h-svh mx-auto my-0 relative overflow-hidden overflow-x-clip overflow-y-clip z-0 pb-safe`}
        >
          <Nav />
          {children}
          <ScrollRestoration />
          <Scripts />
          <footer className="hidden absolute left-0 right-0 bottom-0 text-center py-2 text-sm text-gray-500 bg-paper-background">
            © {new Date().getFullYear()} ayapi.ai
          </footer>
        </div>
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}
