// Aptabase (self-hosted at aptabase.freethinkel.dev): cookie-free, anonymous events, sent
// straight from the bundled SDK (no tracker script to load). Unlike Umami it does not count
// pageviews itself — the root layout sends `page_view` on every navigation.
//
// VITE_APTABASE_KEY turns it on; without it every call is a no-op, so dev servers, tests and
// local builds never reach the dashboard. The key is public — it ships in the bundle anyway.
import { init, trackEvent } from "@aptabase/web";

const KEY: string | undefined = import.meta.env.VITE_APTABASE_KEY;

export const enabled = Boolean(KEY);

if (KEY) init(KEY, { host: "https://aptabase.freethinkel.dev" });

export const sendEvent = (name: string, props?: Record<string, string | number | boolean>) => {
  if (enabled) trackEvent(name, props).catch(() => {});
};
