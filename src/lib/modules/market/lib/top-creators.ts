// "Top creators": the creators the front page's top-creators view lets through, with the faces
// to show under each.
//
// A creator counts by everything they have published, not by one face: their faces' downloads
// are added up, and so are the likes those faces have received.
//
// ponytail: the totals are recomputed from the catalog the page already holds, because the
// backend has no per-creator stats. That is cheap at this size (a couple of hundred faces) —
// if it ever isn't, the totals belong in a PocketBase view, not in the browser.

/** A creator needs at least this many downloads across all their published faces… */
export const TOP_CREATOR_MIN_DOWNLOADS = 800;
/** …and at least this many likes across them. */
export const TOP_CREATOR_MIN_LIKES = 50;

interface Face {
  id: string;
  owner?: string;
  downloads?: number;
}

interface Like {
  watchface?: string;
  [key: string]: unknown;
}

export interface TopCreator<F extends Face = Face> {
  /** the creator's user id — the card header links to /user/id */
  id: string;
  /** everything they have published, most downloaded first */
  faces: F[];
  /** totals across every face, not just the ones the current filter leaves on the rail */
  downloads: number;
  likes: number;
}

const byDownloads = (a: Face, b: Face) => (b.downloads || 0) - (a.downloads || 0);

/**
 * The creators over both thresholds, richest first; faces with no owner (the stock catalog)
 * count for nobody.
 */
export function topCreators<F extends Face>(
  faces: readonly F[],
  likes: readonly Like[],
): TopCreator<F>[] {
  const ownerOf = new Map<string, string>();
  const groups = new Map<string, TopCreator<F>>();

  for (const face of faces) {
    if (!face.owner) continue;
    ownerOf.set(face.id, face.owner);

    let group = groups.get(face.owner);

    if (!group) {
      group = { id: face.owner, faces: [], downloads: 0, likes: 0 };
      groups.set(face.owner, group);
    }

    group.faces.push(face);
    group.downloads += face.downloads || 0;
  }

  for (const like of likes) {
    const owner = like.watchface ? ownerOf.get(like.watchface) : undefined;

    if (owner) groups.get(owner)!.likes++;
  }

  return [...groups.values()]
    .filter((g) => g.downloads >= TOP_CREATOR_MIN_DOWNLOADS && g.likes >= TOP_CREATOR_MIN_LIKES)
    .map((g) => ({ ...g, faces: g.faces.toSorted(byDownloads) }))
    .toSorted((a, b) => b.downloads - a.downloads || b.likes - a.likes);
}
