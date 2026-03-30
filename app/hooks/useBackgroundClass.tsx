import { useLocation } from "react-router";

export function isHiddenNavPage() {
  const location = useLocation();
  const path = location.pathname;

  const hiddenNavPage = [
    "/login",
    "/welcome",
    "/purchase",
    "/promo/day-pass",
    "/promo/week-pass",
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
    "/purchase",
    "/promo/day-pass",
    "/promo/week-pass",
    "/confirmation/day",
    "/confirmation/week",
  ];

  return darkPages.includes(path);
}

export function isPinkPage() {
  const location = useLocation();
  const path = location.pathname;

  const pages = ["/welcome", "/expiration"];

  return pages.includes(path);
}

export function useBackgroundClass() {
  let colors = "bg-paper-background";
  if (isDarkPage()) {
    colors = "bg-ayapi-grey text-white";
  }
  if (isPinkPage()) {
    colors = "bg-ayapi-pink text-white";
  }
  return colors;
}
