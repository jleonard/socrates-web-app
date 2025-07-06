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
  console.log("gtag is ", window.gtag);

  window.gtag("event", action, {
    event_category: category,
    event_label: label,
    value,
  });
}
