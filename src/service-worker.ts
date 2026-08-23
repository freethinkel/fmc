/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />
import { build, files, version } from "$service-worker";

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `fmc-${version}`;
// the SPA shell answers every route (adapter-static fallback), so it is the only page to keep
const ASSETS = [...build, ...files, "/"];

sw.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== "GET" || url.origin !== location.origin) return;

  // hashed build assets never change under their name — cache first
  if (build.includes(url.pathname) || files.includes(url.pathname)) {
    event.respondWith(caches.match(event.request).then((hit) => hit ?? fetch(event.request)));
    return;
  }

  // ponytail: everything else is network-first with the shell as the offline fallback.
  // No API caching — PocketBase responses are user-specific and go stale immediately.
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("/") as Promise<Response>));
  }
});
