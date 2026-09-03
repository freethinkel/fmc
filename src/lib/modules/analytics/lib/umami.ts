// Umami's tracker script: cookie-free, no consent banner, 4.7 KB over the wire / 2.3 KB gzipped
// (measured against cloud.umami.is/script.js). It counts pageviews itself — it patches
// history.pushState/replaceState, so SvelteKit's client-side navigations are covered without any
// code here — and everything else arrives through window.umami.track(name, props).
//
// Two env vars turn it on; without both, every call below is a no-op, so dev servers, preview
// builds and anyone running the app locally never reach the founder's dashboard:
//   VITE_ANALYTICS_HOST     base URL of the Umami instance — "/stats" when it sits behind the
//                           same Caddy as PocketBase, or "https://stats.example.com"
//   VITE_ANALYTICS_SITE_ID  the website id Umami mints when the site is added
//
// The tracker defaults its ingest endpoint to Umami's own cloud gateway, so data-host-url is
// not optional for a self-hosted instance — it is what keeps our numbers on our box.
const HOST: string | undefined = import.meta.env.VITE_ANALYTICS_HOST;
const SITE: string | undefined = import.meta.env.VITE_ANALYTICS_SITE_ID;

interface Umami {
  track(name: string, props?: Record<string, string | number | boolean>): void;
}

export const enabled = Boolean(HOST && SITE);

/** Append the tracker once. Deferred, so it never competes with the editor's first paint. */
export const loadTracker = () => {
  if (!enabled || document.querySelector("script[data-website-id]")) return;

  const el = document.createElement("script");

  el.defer = true;
  el.src = `${HOST!.replace(/\/$/, "")}/script.js`;
  el.dataset.websiteId = SITE!;
  el.dataset.hostUrl = HOST!;
  document.head.append(el);
};

// ponytail: an event fired before the deferred script finishes loading is dropped rather than
// queued. Every event we send follows a click that cannot plausibly beat it. Upgrade path if one
// ever can: buffer into an array here and flush it from the script's onload.
export const sendEvent = (name: string, props?: Record<string, string | number | boolean>) =>
  (window as { umami?: Umami }).umami?.track(name, props);
