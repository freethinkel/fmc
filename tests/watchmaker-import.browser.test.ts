// watchmakerToFace turns a WatchMaker (Wear OS) export into a face tree. Like the Facer test,
// the export is synthesised here rather than checked in — what matters are the conventions the
// importer has to get right: the two obfuscation layers, hand grouping, and which widgets land
// on which screen.
import { test, expect } from "vitest";
import { watchmakerToFace } from "$lib/modules/editor/core/import/watchmaker";
import { TAG, type FaceNode } from "$lib/modules/editor/core/format";
import { metaInfo } from "$lib/modules/editor/core/document/sources";
import { CENTER, SCREEN } from "$lib/modules/editor/core/render/screen";

const LAYERS = `
 <Layer type="shape" x="0" y="0" width="512" height="512" shape="Circle" color="000000" opacity="100" display="bd"/>
 <Layer type="markers" x="0" y="0" rotation="0" radius="256" m_width="2" m_height="15" m_count="12" color="ffffff" opacity="100" display="bd"/>
 <Layer type="text" x="0" y="-60" text="&apos;PROBE&apos;" text_size="15" font="Nope" color="ffffff" opacity="100" display="bd"/>
 <Layer type="text_curved" x="0" y="40" radius="200" curve_dir="Down" text="ARC" text_size="10" font="Nope" color="ffffff" opacity="100" display="bd"/>
 <Layer type="text" x="0" y="80" text="{dh}:{dm}" text_size="15" font="Nope" color="ffffff" opacity="100" display="bd"/>
 <Layer type="image" x="0" y="4" rotation="{drh}" path=".imgA.ppng" width="40" height="200" color="ffffff" opacity="60" display="bd" shader="HSV" u_1="0" u_2="-100" u_3="-100"/>
 <Layer type="image" x="0" y="0" rotation="{drh}" path=".imgA.ppng" width="40" height="200" color="ffffff" opacity="100" display="bd"/>
 <Layer type="image" x="0" y="0" rotation="{drm}" path=".imgA.ppng" width="40" height="220" color="ffffff" opacity="100" display="bd"/>
 <Layer type="image" x="0" y="0" rotation="math.floor({drss}/0.75)*0.75" path=".imgA.ppng" width="20" height="240" color="ffffff" opacity="100" display="b"/>
 <Layer type="image" x="0" y="0" rotation="{br}" path=".imgA.ppng" width="20" height="180" color="ffffff" opacity="100" display="d"/>
 <Layer type="image" x="0" y="0" rotation="0" path=".imgA.ppng" width="16" height="16" color="ffffff" opacity="100" display="bd"/>
 <Layer type="shape" x="0" y="0" width="512" height="512" shape="Circle" color="000000" opacity="var_clr2[var_daydim]" display="bd"/>
`;

// the two obfuscation layers, applied in reverse: base64 with 'D'<->'g' and 'L'<->'4' swapped
// for the layer list, a repeating-key XOR over the PNG bytes for every image
const SWAP: Record<string, string> = { D: "g", g: "D", L: "4", "4": "L" };
const scramble = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/[DgL4]/g, (c) => SWAP[c]);
const xor = (b: Uint8Array) => b.map((v, i) => v ^ "SWHn-".charCodeAt(i % 5));

async function fakeExport(): Promise<File[]> {
  const c = new OffscreenCanvas(8, 8);

  c.getContext("2d")!.fillRect(0, 0, 8, 8);
  const png = new Uint8Array(await (await c.convertToBlob()).arrayBuffer());
  const xml = `<Watch name="Probe Face">${LAYERS}</Watch>`;

  return [new File([scramble(xml)], "watch.pxml"), new File([xor(png)], "images/.imgA.ppng")];
}

const all = (n: FaceNode, p: (x: FaceNode) => boolean): FaceNode[] =>
  (p(n) ? [n] : []).concat(...(n.subs ?? []).map((s) => all(s, p)));
const structOf = (n: FaceNode) => n.subs!.find((s) => s.tag === TAG.struct)!;
const idOf = (n: FaceNode) => metaInfo(structOf(n)).id;

test("watchmakerToFace decodes the export and maps hands, screens and skips", async () => {
  const { face, skipped } = await watchmakerToFace(await fakeExport());
  const [main, aod] = face.screens;

  expect(main.tag).toBe(TAG.main);
  expect(aod.tag).toBe(TAG.aod);
  expect(face.name).toBe("Probe Face");
  // a full-screen JPEG (cf 1) background reboots the watch when it leaves AOD — cf 4 only
  const bgs = face.resources.filter((r) => r.w === SCREEN && r.h === SCREEN);

  expect(bgs).toHaveLength(2); // one per screen
  expect(bgs.map((r) => r.cf)).toEqual([4, 4]);

  // Two consecutive {drh} layers are one hand's stack (art + shadow), not two hands — and a
  // role change must not swallow the hand before it.
  const hands = all(main, (n) => n.tag === TAG.hand);

  expect(hands.map(idOf)).toEqual([0x0a, 0x0e, 0x12]);
  expect(hands.map((h) => structOf(h)._kind)).toEqual(["hour", "minute", "second"]);

  // every hand rotates about the dial centre, wherever its crop landed
  for (const h of hands) {
    const st = structOf(h);
    const pv = h.subs!.find((s) => s.tag === TAG.pivot)!;

    expect(Math.abs(st.x! + pv.pivotX! - CENTER)).toBeLessThanOrEqual(1);
    expect(Math.abs(st.y! + pv.pivotY! - CENTER)).toBeLessThanOrEqual(1);
  }

  // display="b" keeps the second hand off the AOD; display="d" is what the battery hand is for
  const aodHands = all(aod, (n) => n.tag === TAG.hand);

  expect(aodHands.map(idOf)).toEqual([0x0a, 0x0e, 0x24]);

  // both screens get a preview, a background and the post-hand overlay (the centre cap)
  for (const s of [main, aod]) {
    expect(all(s, (n) => n.tag === TAG.preview)).toHaveLength(1);
    expect(all(s, (n) => n.tag === TAG.image)).toHaveLength(2);
  }

  // neither live text nor a Lua-gated layer has an equivalent on the watch — both reported
  expect(skipped.some((x) => x.includes("live text"))).toBe(true);
  expect(skipped.some((x) => x.includes("opacity is a script expression"))).toBe(true);
});
