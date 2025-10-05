import { useLocation } from "@remix-run/react";

export function isDarkPage() {
  const location = useLocation();
  const path = location.pathname;

  const darkPages = ["/login", "/welcome"];

  return darkPages.includes(path);
}

export function useBackgroundClass() {
  return isDarkPage() ? "bg-ayapi-grey text-white" : "bg-paper-background";
}
