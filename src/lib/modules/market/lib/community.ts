// The links on the "Join Community" tab of the front page.
//
// A link with a `url` is a live tile that opens in a new tab. A link with `url: null` is a
// "Coming soon" placeholder: to publish one, fill in its `url` (and change the title,
// description and icon as you like) — no other file needs to change. Add or remove entries
// to taste; they are shown in this order.
//
// `icon` is any Material Symbols name: https://fonts.google.com/icons

export interface CommunityLink {
  id: string;
  title: string;
  description: string;
  icon: string;
  url: string | null;
}

export const COMMUNITY_LINKS: readonly CommunityLink[] = [
  {
    id: "reddit",
    title: "r/CMFWatchMods on Reddit",
    description: "Share your watchfaces, ask questions and see what others are making.",
    icon: "forum",
    url: "https://www.reddit.com/r/CMFWatchMods/s/XLyTkrw57o",
  },
  { id: "slot-2", title: "More links", description: "", icon: "link", url: null },
  { id: "slot-3", title: "More links", description: "", icon: "link", url: null },
  { id: "slot-4", title: "More links", description: "", icon: "link", url: null },
];
