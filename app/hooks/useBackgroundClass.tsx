import { useLocation } from "@remix-run/react";

export function isHiddenNavPage() {
  const location = useLocation();
  const path = location.pathname;

  const hiddenNavPage = [
    "/login",
    "/welcome",
    "/purchase",
    "/promo/day-pass",
    "/expiration",
    "/confirmation/day",
    "/confirmation/week",
  ];

  return hiddenNavPage.includes(path);
}

export function isDarkPage() {
  const location = useLocation();
  const path = location.pathname;

  const darkPages = [
    "/login",
    "/welcome",
    "/purchase",
    "/promo/day-pass",
    "/expiration",
    "/confirmation/day",
    "/confirmation/week",
  ];

  return darkPages.includes(path);
}

export function useBackgroundClass() {
  return isDarkPage() ? "bg-ayapi-grey text-white" : "bg-paper-background";
}
