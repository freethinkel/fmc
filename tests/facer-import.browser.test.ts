// facerToFace turns a Facer export into a face tree. The export is synthesised here rather
// than checked in — what matters are the byte-level conventions the watch reads (data source
// ids, the frame's alignment byte, meta's auto-width marker), not any particular artwork.
import { test, expect } from "vitest";
import { facerToFace } from "$lib/modules/editor/lib/facer";
import { TAG, type FaceNode } from "$lib/modules/editor/lib/wf";
import { parseFrame, metaInfo } from "$lib/modules/editor/lib/render";

const LAYERS = [
  { type: "shape", shape_type: 1, x: 0, y: 0, width: 320, height: 320, color: -16777216 },
  // #DbZ# — the zero-padded spelling of #Db#, which is what real exports use
  { type: "text", text: "#DbZ#", x: 100, y: 150, size: 60, alignment: 2, color: -1 },
  // one live tag plus a literal unit, alongside a tag with no CMF source
  { type: "text", text: "#WCT#°#WM#", x: 160, y: 90, size: 30, alignment: 1, color: -1 },
  {
    type: "text",
    text: "#ZSC#",
    x: 160,
    y: 250,
    size: 30,
    alignment: 1,
    color: -1,
    low_power: true,
  },
  // rotation bound to a clock tag makes this a hand, even with no hand type_opt
  { type: "dynamic_image", x: 160, y: 160, width: 100, height: 100, r: "#DWFM#", hash_round: "h" },
  { type: "dynamic_image", x: 160, y: 160, width: 100, height: 100, r: "#DWFH#", hash_round: "h" },
  { type: "text", text: "#ZHR#", x: 60, y: 250, size: 30, opacity: "$#WCCI#=09?100:0$" },
];

async function fakeExport(): Promise<File[]> {
  const c = new OffscreenCanvas(8, 8);

  c.getContext("2d")!.fillRect(0, 0, 8, 8);
  const png = new Uint8Array(await (await c.convertToBlob()).arrayBuffer());
  const b64 = (s: string) => btoa(s).replace(/=+$/, ""); // Facer ships its base64 unpadded

  return [
    new File([JSON.stringify({ size: { width: 320 }, title: "Probe" })], "description.json"),
    new File([b64(JSON.stringify(LAYERS))], "watchface.json"),
    new File([b64(String.fromCharCode(...png))], "h"),
  ];
}

const find = (n: FaceNode, p: (x: FaceNode) => boolean): FaceNode | null =>
  p(n) ? n : (n.subs?.map((s) => find(s, p)).find(Boolean) ?? null);
const all = (n: FaceNode, p: (x: FaceNode) => boolean): FaceNode[] =>
  (p(n) ? [n] : []).concat(...(n.subs ?? []).map((s) => all(s, p)));
const idOf = (n: FaceNode) => metaInfo(n.subs!.find((s) => s.tag === TAG.struct)!).id;

test("facerToFace maps tags, hands and alignment", async () => {
  const { face, skipped } = await facerToFace(await fakeExport());
  const [main, aod] = face.screens;

  expect(main.tag).toBe(TAG.main);
  expect(aod.tag).toBe(TAG.aod);

  // #DbZ# resolves through the Z suffix to the 12h hour source
  const nums = all(main, (n) => n.tag === TAG.number);

  const asc = (a: number[]) => [...a].sort((x, y) => x - y);

  expect(asc(nums.map(idOf))).toEqual([0x01, 0x19, 0x5f]);

  // a centred field is a group whose frame asks for main-axis centring, with an auto-width child
  const temp = nums.find((n) => idOf(n) === 0x5f)!;
  const group = all(main, (n) => n.tag === TAG.group).find((g) => find(g, (x) => x === temp))!;
  const fr = parseFrame(group)!;

  expect(fr.main).toBe(2); // CENTER
  expect(metaInfo(temp.subs!.find((s) => s.tag === TAG.struct)!).w).toBe(0x8000);
  // the "°" literal survives as a sibling sprite; #WM# has no data source and is reported
  expect(group.subs!.filter((s) => s.tag !== TAG.frame)).toHaveLength(2);
  expect(skipped.some((s) => s.includes("#WM#"))).toBe(true);

  // hands come from the rotation tag, and carry the corpus-verified sources
  const hands = all(main, (n) => n.tag === TAG.hand);

  expect(asc(hands.map(idOf))).toEqual([0x0a, 0x0e]);

  // conditional opacity can't be expressed on the watch, so that layer is dropped, not baked
  expect(all(main, (n) => n.tag === TAG.number).some((n) => idOf(n) === 0x1a)).toBe(false);
  expect(skipped.some((s) => s.includes("conditional opacity"))).toBe(true);

  // only the low_power field crosses over to the dim screen
  expect(all(aod, (n) => n.tag === TAG.number).map(idOf)).toEqual([0x19]);
});
