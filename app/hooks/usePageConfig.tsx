import { useLocation } from "react-router";

type PageTheme = "default" | "dark" | "pink";

type PageConfig = {
  hiddenControlBar?: boolean;
  hiddenLogo?: boolean;
  hiddenNav?: boolean;
  theme?: PageTheme;
};

const pageOverrides: Record<string, PageConfig> = {
  "/login": {
    hiddenNav: true,
    hiddenLogo: true,
    hiddenControlBar: true,
    theme: "pink",
  }, // pink wins over dark, decide explicitly here
  "/welcome": { hiddenNav: true, hiddenControlBar: true, hiddenLogo: true },
  "/purchase": { hiddenNav: true, hiddenControlBar: true, theme: "dark" },
  "/promo/day-pass": { hiddenNav: true, hiddenControlBar: true, theme: "dark" },
  "/promo/week-pass": {
    hiddenNav: true,
    hiddenControlBar: true,
    theme: "dark",
  },
  "/expiration": { hiddenNav: true, hiddenControlBar: true, theme: "pink" },
  "/confirmation/day": {
    hiddenNav: true,
    hiddenControlBar: true,
    theme: "dark",
  },
  "/confirmation/week": {
    hiddenNav: true,
    hiddenControlBar: true,
    theme: "dark",
  },
};

const themeClasses: Record<PageTheme, string> = {
  default: "bg-paper-background",
  dark: "bg-ayapi-grey text-white",
  pink: "bg-ayapi-pink text-white",
};

export function usePageConfig() {
  const { pathname } = useLocation();
  const override = pageOverrides[pathname] ?? {};
  const theme = override.theme ?? "default";

  return {
    hiddenControlBar: override.hiddenControlBar ?? false,
    hiddenLogo: override.hiddenLogo ?? false,
    hiddenNav: override.hiddenNav ?? false,
    backgroundClass: themeClasses[theme],
  };
}
