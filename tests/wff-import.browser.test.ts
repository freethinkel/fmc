// wffToFace turns a Wear OS bundle (.aab) into a face tree. The bundle is synthesised here
// rather than checked in — a real one is half a megabyte of art, and what matters is the
// translation: which user-configuration branch gets baked, which sources the clock lands on,
// what makes a part a hand, and what is dropped because the watch can't express it.
import { test, expect } from "vitest";
import { wffToFace } from "$lib/modules/editor/core/import/wff";
import { TAG, decodePixels, unhex, u16, type FaceNode } from "$lib/modules/editor/core/format";
import { metaInfo } from "$lib/modules/editor/core/document/sources";
import { CENTER, SCREEN } from "$lib/modules/editor/core/render/screen";

/** WFF faces are authored against their own canvas; this one uses the common 450px square. */
const WFF_CANVAS = 450;

const SCENE = `<?xml version="1.0" encoding="UTF-8"?>
<WatchFace clipShape="CIRCLE" width="450" height="450">
 <Metadata key="CLOCK_TYPE" value="ANALOG"/>
 <UserConfigurations>
  <ColorConfiguration id="themeColor" defaultValue="1">
   <ColorOption id="0" colors="#ff0000 #ff0000"/>
   <ColorOption id="1" colors="#ffffff #00ff00"/>
  </ColorConfiguration>
  <BooleanConfiguration id="showRing" defaultValue="FALSE"/>
  <ListConfiguration id="aod" defaultValue="0">
   <ListOption id="0"/><ListOption id="1"/>
  </ListConfiguration>
 </UserConfigurations>
 <Scene>
  <PartDraw x="0" y="0" width="450" height="450">
   <Rectangle x="0" y="0" width="450" height="450"><Fill color="#ff101010"/></Rectangle>
  </PartDraw>
  <!-- defaultValue is FALSE, so the magenta disc must never reach the baked art -->
  <BooleanConfiguration id="showRing">
   <BooleanOption id="TRUE">
    <PartDraw x="0" y="0" width="450" height="450">
     <Ellipse x="0" y="0" width="450" height="450"><Fill color="#ff00ff"/></Ellipse>
    </PartDraw>
   </BooleanOption>
   <BooleanOption id="FALSE"/>
  </BooleanConfiguration>
  <Group name="clock" x="0" y="100" width="450" height="120">
   <Variant mode="AMBIENT" target="y" value="[CONFIGURATION.aod] == 0 ? 140 : 100"/>
   <DigitalClock x="0" y="0" width="450" height="120">
    <TimeText format="HH:mm" x="0" y="0" width="450" height="120">
     <Font family="probe" size="60" color="[CONFIGURATION.themeColor.0]"/>
    </TimeText>
   </DigitalClock>
  </Group>
  <!-- the same two sources over the same box: the second half of a two-font clock, where one
       family draws the digits and the other only the colon -->
  <PartText x="0" y="100" width="450" height="120">
   <Text>
    <Font family="probe" size="60" color="#ffffff">
     <Template>%s:%s<Parameter expression="[IS_24_HOUR_MODE] ? [HOUR_0_23_Z] : [HOUR_1_12_Z]"/><Parameter expression="[MINUTE_Z]"/></Template>
    </Font>
   </Text>
  </PartText>
  <PartText x="10" y="300" width="200" height="40">
   <Text align="START">
    <Font family="probe" size="30" color="#ffffff">
     <Upper><Template>%d%% <Parameter expression="[BATTERY_PERCENT]"/></Template></Upper>
    </Font>
   </Text>
  </PartText>
  <PartText x="240" y="300" width="200" height="40">
   <Text align="START">
    <Font family="probe" size="30" color="#ffffff">
     <Template>%s<Parameter expression="[MOON_PHASE_POSITION]"/></Template>
    </Font>
   </Text>
  </PartText>
  <PartImage x="215" y="25" width="20" height="200" pivotX="0.5" pivotY="1.0">
   <Transform target="angle" value="[MINUTE] * 6"/>
   <Image resource="hand"/>
  </PartImage>
  <ComplicationSlot slotId="0" x="0" y="0" width="10" height="10">
   <Complication type="EMPTY"/>
  </ComplicationSlot>
  <Condition>
   <Expressions><Expression name="hasTitle">[COMPLICATION.TITLE] != null</Expression></Expressions>
   <Compare expression="hasTitle">
    <PartText x="0" y="400" width="450" height="40">
     <Text><Font family="probe" size="20" color="#ffffff">
      <Template>%d<Parameter expression="[HEART_RATE]"/></Template>
     </Font></Text>
    </PartText>
   </Compare>
   <Default>
    <PartText x="0" y="400" width="450" height="40">
     <Text><Font family="probe" size="20" color="#ffffff">
      <Template>%d<Parameter expression="[STEP_COUNT]"/></Template>
     </Font></Text>
    </PartText>
   </Default>
  </Condition>
 </Scene>
</WatchFace>`;

const deflate = async (b: Uint8Array) =>
  new Uint8Array(
    await new Response(
      new Blob([b as BlobPart]).stream().pipeThrough(new CompressionStream("deflate-raw")),
    ).arrayBuffer(),
  );

/** A zip with one deflated entry and one stored one, so the reader's both paths are exercised. */
async function bundle(entries: [string, Uint8Array, boolean][]): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const dir: Uint8Array[] = [];
  let off = 0;

  for (const [name, data, packed] of entries) {
    const body = packed ? await deflate(data) : data;
    const n = enc.encode(name);
    const local = new Uint8Array(30 + n.length);
    const lv = new DataView(local.buffer);

    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, packed ? 8 : 0, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, n.length, true);
    local.set(n, 30);

    const cd = new Uint8Array(46 + n.length);
    const cv = new DataView(cd.buffer);

    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, packed ? 8 : 0, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, n.length, true);
    cv.setUint32(42, off, true);
    cd.set(n, 46);

    chunks.push(local, body);
    dir.push(cd);
    off += local.length + body.length;
  }
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  const dirSize = dir.reduce((a, c) => a + c.length, 0);

  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, dirSize, true);
  ev.setUint32(16, off, true);

  const all = [...chunks, ...dir, eocd];
  const out = new Uint8Array(all.reduce((a, c) => a + c.length, 0));
  let at = 0;

  for (const c of all) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

async function handPng(): Promise<Uint8Array> {
  const c = new OffscreenCanvas(20, 200);
  const cx = c.getContext("2d")!;

  cx.fillStyle = "#fff";
  cx.fillRect(4, 10, 12, 180); // transparent margin — the hand must be cropped to its ink
  return new Uint8Array(await (await c.convertToBlob()).arrayBuffer());
}

const all = (n: FaceNode, p: (x: FaceNode) => boolean): FaceNode[] =>
  (p(n) ? [n] : []).concat(...(n.subs ?? []).map((s) => all(s, p)));
const idOf = (n: FaceNode) => metaInfo(n.subs!.find((s) => s.tag === TAG.struct)!).id;
const asc = (a: number[]) => [...a].sort((x, y) => x - y);
/** frame 0x48: x, y, w, h as u16 LE. */
const frameY = (g: FaceNode) => u16(unhex(g.subs!.find((s) => s.tag === TAG.frame)!.hex!), 2);

test("wffToFace bakes the default configuration and maps the live sources", async () => {
  const zip = await bundle([
    ["base/res/raw/watchface.xml", new TextEncoder().encode(SCENE), true],
    ["base/res/drawable-nodpi-v4/hand.png", await handPng(), false],
    ["BundleConfig.pb", new Uint8Array([1, 2, 3]), false],
  ]);
  const { face, skipped } = await wffToFace(new File([zip as BlobPart], "Probe.aab"));
  const [main, aod] = face.screens;

  expect(main.tag).toBe(TAG.main);
  expect(aod.tag).toBe(TAG.aod);
  expect(face.name).toBe("Probe");

  // HH:mm resolves through the format letters, the nested "[IS_24_HOUR_MODE] ? … : …" through
  // its first recognised source, the battery template through its parameter — and the Condition
  // falls through to <Default>, because no complication ever supplies a title. Both spellings of
  // the clock are kept: a WFF face stacks two fonts to draw one, and dropping either as a
  // duplicate loses half its glyphs.
  expect(asc(all(main, (n) => n.tag === TAG.number).map(idOf))).toEqual([
    0x07, 0x07, 0x0b, 0x0b, 0x19, 0x24,
  ]);
  // ...so the <Compare> branch's heart rate is not in the face at all
  expect(all(main, (n) => n.tag === TAG.number).some((n) => idOf(n) === 0x1a)).toBe(false);

  // a source the watch has no data for drops out of its row and is reported
  expect(skipped.some((s) => s.includes("MOON_PHASE_POSITION"))).toBe(true);
  expect(skipped.some((s) => s.includes("complication slot 0"))).toBe(true);

  // the rotation transform makes the image a hand on the minute source, cropped to its ink and
  // still pivoting about the point the fractional pivotX/pivotY named — the dial centre
  const hands = all(main, (n) => n.tag === TAG.hand);

  expect(hands.map(idOf)).toEqual([0x0e]);
  const st = hands[0].subs!.find((s) => s.tag === TAG.struct)!;
  const pivot = hands[0].subs!.find((s) => s.tag === TAG.pivot)!;

  expect(st.x! + pivot.pivotX!).toBe(CENTER);
  expect(st.y! + pivot.pivotY!).toBe(CENTER);
  expect(face.resources[st.images![0]].w).toBeLessThan(Math.round((20 * SCREEN) / WFF_CANVAS));

  // the FALSE branch of a BooleanConfiguration is what the face ships, so the magenta disc in
  // its TRUE branch must not have been baked
  const bg = face.resources.find((r) => r.w === SCREEN && r.h === SCREEN)!;
  const px = decodePixels(bg)!;
  const mid = ((SCREEN / 2) * SCREEN + SCREEN / 2) * 4;

  expect(bg.cf).toBe(4); // a full-screen cf 1 (JPEG) reboots the watch leaving AOD
  expect([px[mid], px[mid + 1], px[mid + 2]].every((c) => c < 0x40)).toBe(true);

  // an AMBIENT <Variant> on the group moves its field down on the dim screen
  const hourGroup = (s: FaceNode) =>
    all(s, (n) => n.tag === TAG.group).find(
      (g) => all(g, (x) => x.tag === TAG.number && idOf(x) === 0x07).length,
    )!;

  expect(frameY(hourGroup(aod)) - frameY(hourGroup(main))).toBe(
    Math.round((140 - 100) * (SCREEN / WFF_CANVAS)),
  );
});
