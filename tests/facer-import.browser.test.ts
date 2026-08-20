// facerToFace turns a Facer export into a face tree. The export is synthesised here rather
// than checked in — what matters are the byte-level conventions the watch reads (data source
// ids, the frame's alignment byte, meta's auto-width marker), not any particular artwork.
import { test, expect } from "vitest";
import { facerToFace } from "$lib/modules/editor/core/import/facer";
import { TAG, decodePixels, unhex, type FaceNode } from "$lib/modules/editor/core/format";
import { metaInfo } from "$lib/modules/editor/core/document/sources";
import { CENTER, SCREEN } from "$lib/modules/editor/core/render/screen";

/** Facer authors against its own canvas; the fixture uses the default one. */
const FACER_CANVAS = 320;

const LAYERS = [
  { type: "shape", shape_type: 1, x: 0, y: 0, width: 320, height: 320, color: -16777216 },
  // hour spelled out per digit, a literal colon, then #DmZ# — the zero-padded spelling of
  // #Dm#, which is what real exports use. One row, three widgets.
  {
    type: "text",
    text: "(floor(#Db#/10))(#Db#%10):#DmZ#",
    x: 100,
    y: 150,
    size: 60,
    alignment: 2,
    color: -1,
  },
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
  // a digit-sprite face spells the value out one expression per digit
  {
    type: "text",
    text: "(floor(#Dm#/10))(#Dm#-(10*(floor(#Dm#/10))))",
    x: 220,
    y: 150,
    size: 60,
    color: -1,
  },
  // ...but this one only shows steps / 1000, which no data source can express
  {
    type: "text",
    text: "(floor(#ZSC#/10000))((floor(#ZSC#/1000))-((floor(#ZSC#/10000))*10))K",
    x: 60,
    y: 90,
    size: 30,
    color: -1,
  },
  // rotation bound to a clock tag makes this a hand, even with no hand type_opt
  { type: "dynamic_image", x: 160, y: 160, width: 100, height: 100, r: "#DWFM#", hash_round: "h" },
  { type: "dynamic_image", x: 160, y: 160, width: 100, height: 100, r: "#DWFH#", hash_round: "h" },
  // the smooth spelling of the same tag, on the sweeping second source
  { type: "dynamic_image", x: 160, y: 160, width: 100, height: 100, r: "#DWFSS#", hash_round: "h" },
  { type: "text", text: "#ZHR#", x: 60, y: 250, size: 30, opacity: "$#WCCI#=09?100:0$" },
  // an animated opacity bakes in at full opacity — there is nothing to switch on
  { type: "text", text: "AOD", x: 40, y: 40, size: 20, color: -1, opacity: "(sin(#DWE#)*50+50)" },
  // a month name spelled out as one conditional per value
  {
    type: "text",
    text: "$#DMM#=01?JAN:$$#DMM#=02?FEB:$$#DMM#=12?DEC:$",
    x: 260,
    y: 90,
    size: 20,
    color: -1,
  },
  // a position expression has nothing to place the layer at, and is reported rather than
  // silently drawn at NaN
  { type: "text", text: "-", x: "(86+(#DOW#*24.8))", y: 215, size: 20, color: -1 },
  // an animated conditional keeps both branches alive, so it bakes in instead of dropping
  {
    type: "dynamic_image",
    name: "heart.png",
    x: 30,
    y: 180,
    width: 20,
    height: 20,
    hash_round: "h",
    opacity: "$#ZHR#>0?(50+50*sin(6.28*#Dsm#*#ZHR#/60)):(100-200*((#Dsm#/2)%0.5))$",
  },
  // a weather icon set: no source for the condition, so only the cloud frame (03) bakes in
  ...["01", "03", "10", "13"].map((c) => ({
    type: "dynamic_image",
    name: `wx${c}.png`,
    x: 58,
    y: 229,
    width: 30,
    height: 30,
    opacity: `$#WCCI#=${c}?100:0$`,
    hash_round: "h",
  })),
  // a weekday image set: one sprite per value of the same tag, all at one spot. Each frame
  // gets its own image (hash "d<value>", filled with gray d*20) so the ORDER is checkable:
  // Facer counts #DOWB# from 1 = Sunday, the watch indexes the set with getDay().
  ...[1, 2, 3, 4, 5, 6, 7].map((d) => ({
    type: "dynamic_image",
    x: 160,
    y: 100,
    width: 40,
    height: 20,
    opacity: `$#DOWB#=${d}?100:0$`,
    hash_round: `d${d}`,
  })),
];

const b64 = (s: string) => btoa(s).replace(/=+$/, ""); // Facer ships its base64 unpadded

async function sprite(fill: string): Promise<string> {
  const c = new OffscreenCanvas(8, 8);
  const cx = c.getContext("2d")!;

  cx.fillStyle = fill;
  cx.fillRect(2, 2, 4, 4); // transparent margin — hands must be cropped to the ink
  const png = new Uint8Array(await (await c.convertToBlob()).arrayBuffer());

  return b64(String.fromCharCode(...png));
}

async function fakeExport(): Promise<File[]> {
  return [
    new File([JSON.stringify({ size: { width: 320 }, title: "Probe" })], "description.json"),
    new File([b64(JSON.stringify(LAYERS))], "watchface.json"),
    new File([await sprite("#000")], "h"),
    // one distinguishable sprite per weekday value: red channel = value * 20
    ...(await Promise.all(
      [1, 2, 3, 4, 5, 6, 7].map(
        async (d) => new File([await sprite(`rgb(${d * 20},0,0)`)], `d${d}`),
      ),
    )),
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

  // #DmZ# resolves through the Z suffix to the minute source; the per-digit spellings
  // collapse back into one field each (0x01 hour, 0x0b minute twice)
  const nums = all(main, (n) => n.tag === TAG.number);

  const asc = (a: number[]) => [...a].sort((x, y) => x - y);

  expect(asc(nums.map(idOf))).toEqual([0x01, 0x0b, 0x0b, 0x19, 0x5f]);
  expect(skipped.some((s) => s.includes("K"))).toBe(true);
  expect(skipped.some((s) => s.includes("position expression"))).toBe(true);
  expect(skipped.some((s) => s.includes("heart.png"))).toBe(false); // animated, so baked
  // the cloud frame is the one kept; the other three conditions are reported
  expect(skipped.filter((s) => s.startsWith("wx")).sort()).toEqual(
    ["wx01.png", "wx10.png", "wx13.png"].map(
      (n) => `${n} (weather set — only the cloud frame is baked)`,
    ),
  );

  // "HH:MM" is one row: two number widgets with the colon sprite between them
  const hm = all(main, (n) => n.tag === TAG.group).find((g) =>
    find(g, (x) => x.tag === TAG.number && idOf(x) === 0x01),
  )!;

  expect(hm.subs!.filter((s) => s.tag !== TAG.frame)).toHaveLength(3);

  // the month name chain becomes a select on the month source, one label per value
  const mon = all(main, (n) => n.tag === TAG.image).find((n) => idOf(n) === 0x16)!;

  expect(mon.subs![0].images).toHaveLength(12);

  // a centred field is a group whose frame asks for main-axis centring, with an auto-width child
  const temp = nums.find((n) => idOf(n) === 0x5f)!;
  const group = all(main, (n) => n.tag === TAG.group).find((g) => find(g, (x) => x === temp))!;
  // frame byte 8, low 2 bits: the main-axis alignment of the auto-laid-out children
  const frameMain = unhex(group.subs!.find((s) => s.tag === TAG.frame)!.hex!)[8] & 3;

  expect(frameMain).toBe(2); // CENTER
  expect(metaInfo(temp.subs!.find((s) => s.tag === TAG.struct)!).w).toBe(0x8000);
  // "°" and #WM# (the unit, always Celsius here) merge into one sibling sprite: value + "°C"
  expect(group.subs!.filter((s) => s.tag !== TAG.frame)).toHaveLength(2);
  expect(skipped.some((s) => s.includes("#WM#"))).toBe(false);

  // the seven weekday layers collapse into one image-select widget on the weekday source
  const sel = all(main, (n) => n.tag === TAG.image).find((n) => idOf(n) === 0x18)!;

  expect(sel.subs![0].images).toHaveLength(7);
  expect(skipped.some((s) => s.includes("#DOWB#"))).toBe(false);

  // ...in the order the WATCH indexes them: images[getDay()], so frame 0 is Facer's
  // #DOWB#=1 (Sunday). The fixture's sprites brighten with the Facer value, so a set built
  // Monday-first (the old order, a day off on the device) breaks the sort. Opaque pixels
  // only: the scaled sprite's faint edge pixels carry un-premultiply noise (r=1, a=1 reads as
  // 255), and how faint they are differs between Chromium builds.
  const red = (ri: number) => {
    const px = decodePixels(face.resources[ri])!;
    let m = 0;

    for (let i = 0; i < px.length; i += 4) if (px[i + 3] === 255) m = Math.max(m, px[i]);
    return m;
  };
  const reds = sel.subs![0].images!.map(red);

  expect(reds).toEqual([...reds].sort((a, b) => a - b));
  expect(new Set(reds).size).toBe(7);

  // hands come from the rotation tag, and carry the corpus-verified sources
  const hands = all(main, (n) => n.tag === TAG.hand);

  expect(asc(hands.map(idOf))).toEqual([0x0a, 0x0e, 0x12]);

  // ...and are cropped to their ink: a full-canvas 466×466 cf 5 hand costs 650 KB of RAM on
  // the watch and reboots it. x + pivot must still land on the layer centre (Facer's own 160,
  // scaled from its 320 canvas to ours), otherwise the hand rotates around the wrong point.
  const hst = hands[0].subs!.find((s) => s.tag === TAG.struct)!;
  const hres = face.resources[hst.images![0]];

  expect(hres.w).toBeLessThan(Math.round((100 * SCREEN) / FACER_CANVAS));
  expect(hst.x! + hands[0].subs!.find((s) => s.tag === TAG.pivot)!.pivotX!).toBe(CENTER);

  // conditional opacity can't be expressed on the watch, so that layer is dropped, not baked
  expect(all(main, (n) => n.tag === TAG.number).some((n) => idOf(n) === 0x1a)).toBe(false);
  expect(skipped.some((s) => s.includes("conditional opacity"))).toBe(true);

  // only the low_power field crosses over to the dim screen
  expect(all(aod, (n) => n.tag === TAG.number).map(idOf)).toEqual([0x19]);

  // a full-screen JPEG (cf 1) background reboots the watch when it leaves AOD — cf 4 only
  const bgs = face.resources.filter((r) => r.w === SCREEN && r.h === SCREEN);

  expect(bgs).toHaveLength(2); // one per screen
  expect(bgs.map((r) => r.cf)).toEqual([4, 4]);
});
