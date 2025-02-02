import { createBrowserClient } from "@supabase/ssr";

export function getSupabaseBrowserClient(url: string, key: string) {
  const supabase = createBrowserClient(url, key);
  return supabase;
}
