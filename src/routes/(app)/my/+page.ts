import { redirect } from "@sveltejs/kit";

// My watchfaces is the marketplace with the "Mine" shelf on — the route only redirects
export const load = () => {
  redirect(307, "/?mine");
};
