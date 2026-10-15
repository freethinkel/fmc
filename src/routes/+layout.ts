// beacio bootstrap: bridges navigator.bluetooth to the Safari extension on iOS, no-op in Chrome
import "@beacio/core/auto";
import { enabled as analyticsEnabled } from "$lib/modules/analytics/lib/umami";

// self-hosted, cookie-free analytics — a no-op build unless VITE_ANALYTICS_* are set. Loaded
// lazily: the model subscribes to the editor and market models, which /login shouldn't download.
if (analyticsEnabled)
  import("$lib/modules/analytics/model").then((m) => m.analyticsModel.started());

export const ssr = false;
export const prerender = false;
