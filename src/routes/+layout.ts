// beacio bootstrap: bridges navigator.bluetooth to the Safari extension on iOS, no-op in Chrome
import "@beacio/core/auto";
import { enabled as analyticsEnabled } from "$lib/modules/analytics/lib/aptabase";

// cookie-free analytics — a no-op build unless VITE_APTABASE_KEY is set. Loaded lazily: the
// model subscribes to the editor and market models, which /login shouldn't download.
if (analyticsEnabled) import("$lib/modules/analytics/model");

export const ssr = false;
export const prerender = false;
