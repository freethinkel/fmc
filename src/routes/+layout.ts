// beacio bootstrap: bridges navigator.bluetooth to the Safari extension on iOS, no-op in Chrome
import "@beacio/core/auto";
import { analyticsModel } from "$lib/modules/analytics/model";

// self-hosted, cookie-free analytics — a no-op build unless VITE_ANALYTICS_* are set
analyticsModel.started();

export const ssr = false;
export const prerender = false;
