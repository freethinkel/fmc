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

type Props = Record<string, string | number | boolean>;

interface Umami {
  track(name: string, props?: Props): void;
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
  el.onload = flush;
  el.onerror = () => (queue = null);
  document.head.append(el);
};

// A shared link lands straight on /market/<id> or the editor, and the record can come back before
// the async-inserted script does — so events wait here and are flushed on load. Closed if the
// script never arrives (an ad blocker), so the queue can't grow for the whole session.
let queue: [string, Props?][] | null = enabled ? [] : null;

export const sendEvent = (name: string, props?: Props) => {
  const umami = (window as { umami?: Umami }).umami;

  if (umami) umami.track(name, props);
  else queue?.push([name, props]);
};

const flush = () => {
  const pending = queue ?? [];

  queue = null;
  for (const [name, props] of pending) sendEvent(name, props);
};
