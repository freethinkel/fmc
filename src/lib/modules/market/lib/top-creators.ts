// "From top creators": which creators the front page's top-creators sort lets through.
//
// A creator counts by everything they have published, not by one face: their faces' downloads
// are added up, and so are the likes those faces have received.
//
// ponytail: the totals are recomputed from the catalog the page already holds, because the
// backend has no per-creator stats. That is cheap at this size (a couple of hundred faces) —
// if it ever isn't, the totals belong in a PocketBase view, not in the browser.

/** A creator needs at least this many downloads across all their published faces… */
export const TOP_CREATOR_MIN_DOWNLOADS = 1800;
/** …and at least this many likes across them. */
export const TOP_CREATOR_MIN_LIKES = 100;

interface Face {
  id: string;
  owner?: string;
  downloads?: number;
}

interface Like {
  watchface?: string;
  [key: string]: unknown;
}

/**
 * The ids of the creators over both thresholds. Faces with no owner (the stock catalog) count
 * for nobody.
 */
export function topCreatorIds(faces: readonly Face[], likes: readonly Like[]): Set<string> {
  const ownerOf = new Map<string, string>();
  const totals = new Map<string, { downloads: number; likes: number }>();

  for (const face of faces) {
    if (!face.owner) continue;
    ownerOf.set(face.id, face.owner);

    const total = totals.get(face.owner) ?? { downloads: 0, likes: 0 };

    total.downloads += face.downloads || 0;
    totals.set(face.owner, total);
  }

  for (const like of likes) {
    const owner = like.watchface ? ownerOf.get(like.watchface) : undefined;

    if (owner) totals.get(owner)!.likes++;
  }

  return new Set(
    [...totals]
      .filter(
        ([, t]) => t.downloads >= TOP_CREATOR_MIN_DOWNLOADS && t.likes >= TOP_CREATOR_MIN_LIKES,
      )
      .map(([owner]) => owner),
  );
}
