// "Top creators" lets a creator through on the totals across everything they published —
// downloads and likes added up over all their faces — and hands the page a shelf sorted by
// those totals, so the sums, the thresholds and the order are what's worth pinning down.
// Runs in the "unit" (node) vitest project.
import { describe, test, expect } from "vitest";
import {
  TOP_CREATOR_MIN_DOWNLOADS,
  TOP_CREATOR_MIN_LIKES,
  topCreators,
} from "$lib/modules/market/lib/top-creators";

const likesFor = (watchface: string, n: number) => Array.from({ length: n }, () => ({ watchface }));

describe("topCreators", () => {
  test("a creator over both totals is in, with their faces and sums", () => {
    const faces = [
      { id: "a", owner: "u1", downloads: TOP_CREATOR_MIN_DOWNLOADS },
      { id: "b", owner: "u1", downloads: 500 },
    ];
    const [creator] = topCreators(faces, likesFor("a", TOP_CREATOR_MIN_LIKES));

    expect(creator).toMatchObject({
      id: "u1",
      faces: [{ id: "a" }, { id: "b" }],
      downloads: TOP_CREATOR_MIN_DOWNLOADS + 500,
      likes: TOP_CREATOR_MIN_LIKES,
    });
  });

  test("one threshold is not enough", () => {
    const faces = [{ id: "a", owner: "u1", downloads: TOP_CREATOR_MIN_DOWNLOADS * 2 }];

    expect(topCreators(faces, likesFor("a", TOP_CREATOR_MIN_LIKES - 1))).toHaveLength(0);
    expect(
      topCreators(
        [{ id: "a", owner: "u1", downloads: TOP_CREATOR_MIN_DOWNLOADS - 1 }],
        likesFor("a", TOP_CREATOR_MIN_LIKES * 2),
      ),
    ).toHaveLength(0);
  });

  test("likes count toward the threshold from every face", () => {
    const faces = [
      { id: "a", owner: "u1", downloads: 1000 },
      { id: "b", owner: "u1", downloads: 800 },
    ];
    const likes = [...likesFor("a", 60), ...likesFor("b", 40)];

    expect(topCreators(faces, likes).some((c) => c.id === "u1")).toBe(true);
  });

  test("faces with no owner, and likes on unknown faces, count for nobody", () => {
    const faces = [{ id: "stock", downloads: 99999 }];

    expect(topCreators(faces, likesFor("stock", 999))).toHaveLength(0);
    expect(topCreators([], likesFor("ghost", 999))).toHaveLength(0);
  });

  test("a missing download count is zero", () => {
    expect(topCreators([{ id: "a", owner: "u1" }], likesFor("a", 999))).toHaveLength(0);
  });

  test("creators sort by downloads, ties on likes; faces sort by downloads too", () => {
    const over = (downloads: number, id: string) => ({ id, owner: id, downloads });

    const creators = topCreators(
      [over(2000, "rich"), over(3000, "poor"), over(2500, "tie-a"), over(2500, "tie-b")].flatMap(
        (c) => [c, { ...c, id: `${c.id}-2`, downloads: 0 }],
      ),
      [
        ...likesFor("rich", TOP_CREATOR_MIN_LIKES),
        ...likesFor("poor", TOP_CREATOR_MIN_LIKES),
        ...likesFor("tie-a-2", TOP_CREATOR_MIN_LIKES),
        ...likesFor("tie-b-2", TOP_CREATOR_MIN_LIKES + 10),
        ...likesFor("tie-a", 1000),
        ...likesFor("tie-b", 1000),
      ],
    );

    expect(creators.map((c) => c.id)).toEqual(["poor", "tie-b", "tie-a", "rich"]);
    expect(creators[1].faces.map((f) => f.id)).toEqual(["tie-b", "tie-b-2"]);
  });
});
