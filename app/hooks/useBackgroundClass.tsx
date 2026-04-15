import { useLocation } from "react-router";

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

const darkPages = [
  "/login",
  "/purchase",
  "/promo/day-pass",
  "/promo/week-pass",
  "/confirmation/day",
  "/confirmation/week",
];

const pinkPages = ["/welcome", "/expiration", "/login"];

const noLogoPage = ["/login"];

type GlobalUIConfig = {
  hiddenLogo: boolean;
  hiddenNav: boolean;
  pageColors: string;
};

export function globalUIConfig(): GlobalUIConfig {
  const location = useLocation();
  const path = location.pathname;
  let config = {
    hiddenLogo: noLogoPage.includes(path),
    hiddenNav: hiddenNavPage.includes(path),
    pageColors: "bg-paper-background",
  };
  if (darkPages.includes(path)) {
    config.pageColors = "bg-ayapi-grey text-white";
  }
  if (pinkPages.includes(path)) {
    config.pageColors = "bg-ayapi-pink text-white";
  }
  return config;
}

export function isHiddenNavPage() {
  const location = useLocation();
  const path = location.pathname;
  return hiddenNavPage.includes(path);
}

export function isDarkPage() {
  const location = useLocation();
  const path = location.pathname;

  return darkPages.includes(path);
}

export function isPinkPage() {
  const location = useLocation();
  const path = location.pathname;

  return pinkPages.includes(path);
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
