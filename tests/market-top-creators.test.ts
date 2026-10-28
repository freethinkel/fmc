// "From top creators" lets a creator through on the totals across everything they published —
// downloads and likes added up over all their faces — so the sums are what's worth pinning down.
// Runs in the "unit" (node) vitest project.
import { describe, test, expect } from "vitest";
import {
  TOP_CREATOR_MIN_DOWNLOADS,
  TOP_CREATOR_MIN_LIKES,
  topCreatorIds,
} from "$lib/modules/market/lib/top-creators";

const likesFor = (watchface: string, n: number) => Array.from({ length: n }, () => ({ watchface }));

describe("topCreatorIds", () => {
  test("a creator over both totals is in", () => {
    const faces = [{ id: "a", owner: "u1", downloads: TOP_CREATOR_MIN_DOWNLOADS }];

    expect([...topCreatorIds(faces, likesFor("a", TOP_CREATOR_MIN_LIKES))]).toEqual(["u1"]);
  });

  test("one threshold is not enough", () => {
    const faces = [{ id: "a", owner: "u1", downloads: TOP_CREATOR_MIN_DOWNLOADS * 2 }];

    expect(topCreatorIds(faces, likesFor("a", TOP_CREATOR_MIN_LIKES - 1)).size).toBe(0);
    expect(
      topCreatorIds(
        [{ id: "a", owner: "u1", downloads: TOP_CREATOR_MIN_DOWNLOADS - 1 }],
        likesFor("a", TOP_CREATOR_MIN_LIKES * 2),
      ).size,
    ).toBe(0);
  });

  test("totals add up across a creator's faces", () => {
    const faces = [
      { id: "a", owner: "u1", downloads: 1000 },
      { id: "b", owner: "u1", downloads: 800 },
    ];
    const likes = [...likesFor("a", 60), ...likesFor("b", 40)];

    expect(topCreatorIds(faces, likes).has("u1")).toBe(true);
  });

  test("faces with no owner, and likes on unknown faces, count for nobody", () => {
    const faces = [{ id: "stock", downloads: 99999 }];

    expect(topCreatorIds(faces, likesFor("stock", 999)).size).toBe(0);
    expect(topCreatorIds([], likesFor("ghost", 999)).size).toBe(0);
  });

  test("a missing download count is zero", () => {
    expect(topCreatorIds([{ id: "a", owner: "u1" }], likesFor("a", 999)).size).toBe(0);
  });
});
