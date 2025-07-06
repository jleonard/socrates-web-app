import { useLocation } from "@remix-run/react";
import { useEffect } from "react";

declare global {
  interface Window {
    gtag: (
      command: "config" | "event" | "js",
      targetId: string,
      config?: Record<string, any>
    ) => void;
  }
}

export function usePageViews(trackingId: string | undefined) {
  const location = useLocation();

  useEffect(() => {
    if (!trackingId) return;
    if (typeof window.gtag !== "function") return;

    window.gtag("config", trackingId, {
      page_path: location.pathname,
    });
  }, [location, trackingId]);
}
