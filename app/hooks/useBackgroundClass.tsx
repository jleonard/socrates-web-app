import { useLocation } from "@remix-run/react";

export function isHiddenNavPage() {
  const location = useLocation();
  const path = location.pathname;

  const hiddenNavPage = ["/login", "/welcome", "/promo/day-pass"];

  return hiddenNavPage.includes(path);
}

export function isDarkPage() {
  const location = useLocation();
  const path = location.pathname;

  const darkPages = ["/login", "/welcome", "/promo/day-pass"];

  return darkPages.includes(path);
}

export function useBackgroundClass() {
  return isDarkPage() ? "bg-ayapi-grey text-white" : "bg-paper-background";
}
