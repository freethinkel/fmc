import { redirect } from "@sveltejs/kit";

// the marketplace moved to the root; /market stays as a redirect for old links
export const load = () => redirect(308, "/");
