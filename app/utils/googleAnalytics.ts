interface Window {
  gtag?: (...args: any[]) => void;
}

export function trackEvent({
  action,
  category,
  label,
  value,
}: {
  action: string; // what happened
  category: string; // category
  label?: string; // more detail
  value?: number; // a value like currency
}) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") {
    console.warn("gtag not available");
    return;
  }

  window.gtag("event", action, {
    event_category: category,
    event_label: label,
    value,
  });
}

export function getGAClientId(GA_TRACKING_ID: string): Promise<string> {
  return new Promise((resolve) => {
    if (!window.gtag) return resolve(" ");

    (window.gtag as any)(
      "get",
      GA_TRACKING_ID,
      "client_id",
      (clientId: string) => {
        resolve(clientId);
      }
    );
  });
}
