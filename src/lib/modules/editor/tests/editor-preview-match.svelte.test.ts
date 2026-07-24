// Parses a watchface .bin straight into a Face + decodes its resource bitmaps, then calls
// render.ts's render(ctx, face, screenTag, sim) directly on a bare canvas — no Svelte
// component, no effector store, just the render function under test with the parameters
// (face, sim) it actually takes. Checks the result matches the preview image baked into
// the same file, once downscaled to preview size — the same 466->preview pipeline the app
// itself uses for regenPreviews()/previewBlob().
import { describe, test, expect } from "vitest";
import pixelmatch from "pixelmatch";
import { parseBin, TAG } from "../lib/wf";
import { render as drawFace, defaultSim } from "../lib/render";
import { bitmapOf } from "../model/editor.model";

import analogUrl from "./__fixtures__/Analog__287__Simple_Dial.bin?url";
import digitalUrl from "./__fixtures__/Digital__281__Metaball.bin?url";
import multifunctionUrl from "./__fixtures__/Multifunction__368__Function.bin?url";
import comboUrl from "./__fixtures__/Multifunction__366__Combo.bin?url";
import creativeUrl from "./__fixtures__/Creative__312__Disc.bin?url";
import defaultUrl from "./__fixtures__/Default__273__Activity_Mood.bin?url";
import diwaliUrl from "./__fixtures__/Diwali__295__Vortex.bin?url";
import elaborate2Url from "./__fixtures__/Multifunction__304__Elaborate_2.bin?url";
import dichotomyUrl from "./__fixtures__/Default__276__Dichotomy.bin?url";

// Frozen per-file demo time — the real clock would make hands/digits differ every run.
// Thresholds are per-file, not one shared bound: the baked preview is a real device
// screenshot at an exact, unknowable second, and Analog/Multifunction/Digital-metaball
// all carry moving hands or highlighted grid nodes, so a few % of pixel drift is expected
// even with a correct renderer — see the comment on each threshold for what it covers.
const CASES = [
  // clean match: dial, hands and date agree with the baked preview almost exactly.
  {
    name: "Analog__287__Simple_Dial",
    url: analogUrl,
    time: "2026-01-09T10:09:30",
    maxDiffRatio: 0.01,
  },
  // has an hour/minute/second hand trio; the exact baked second is unknowable, so hand
  // angles drift a little even when correct — the main remaining diff source now that the
  // widget-slot tiles render correctly (0x79/0x7a bind synthesized from each slot's own
  // activeIdx via withSlotOverrides — see render.ts; previously all 8 per-metric "skin"
  // groups rendered simultaneously since that bind was unmapped, corrected once the real
  // device confirmed the id 0x79+slotIndex/val-position mechanism), the battery ring's
  // sectorImage gap sits at the right angle (was rotated ~90° off), the temperature tile's
  // sign digit only shows for negative values, and a NUMBER packed next to a real auto
  // sibling (the "80%" battery tile) no longer gets the group's fr.gap between them.
  {
    name: "Multifunction__368__Function",
    url: multifunctionUrl,
    time: "2026-01-09T10:09:30",
    maxDiffRatio: 0.015,
  },
  // the highlighted metaball node is a JPEG frame baked by the original tool at a visibly
  // darker gray than the file's own preview snapshot (verified against the raw JPEG bytes,
  // independent of our decode/render path) — a source-asset inconsistency, not a bug here.
  {
    name: "Digital__281__Metaball",
    url: digitalUrl,
    time: "2026-01-09T10:12:30",
    maxDiffRatio: 0.17,
  },
  // clean match: disc dial with no live tiles/hands beyond the second hand.
  {
    name: "Creative__312__Disc",
    url: creativeUrl,
    time: "2026-01-09T10:09:35",
    maxDiffRatio: 0.01,
  },
  // has 4 swipeable activity tiles gated by the same unmapped bind data-source id (0x79)
  // as the Multifunction case above (renderer defaults to tile 0, real device state unknown).
  // Probed by forcing overrideSet({id:0x79, value:0..3}) — ratio barely moved (14.8-15.3%),
  // so tile choice isn't the main driver here; an undecoded second selector widget on this
  // face (tag 0x85, 4 icons + a large image, its own unmapped bind) likely accounts for most
  // of the remaining diff. Also has a procedural goal-ring (see the Combo case below) whose
  // "no baked RGB" fallback color is genuinely undecidable from the file alone — this file's
  // real device baked it blue, Combo's baked the same byte pattern orange (device accent
  // setting, not something the .bin carries) — defaultSim().accentColor is null in this
  // test, so it falls to a fixed default that won't match either. Threshold dropped from
  // 22% to 17% once drawProceduralArc's start angle got the same -90° (12-o'clock-relative)
  // fix as Combo below — this file's own procedural goal-ring was rotated the same way.
  {
    name: "Default__273__Activity_Mood",
    url: defaultUrl,
    time: "2026-01-09T10:09:30",
    sim: { steps: 5000, accentColor: "#4155F6" },
    maxDiffRatio: 0.17,
  },
  // clean match.
  {
    name: "Diwali__295__Vortex",
    url: diwaliUrl,
    time: "2026-01-09T10:10:30",
    maxDiffRatio: 0.01,
  },
  // 3 concentric goal-rings, no image ref — exercises the procedural-arc radius/color/offset
  // path (was badly broken: wrong radius, wrong position, wrong colors, wrong stroke inset —
  // see render.ts's drawProceduralArc/ringRGB and drawGroup's ring-offset special case).
  // Also had its start angle 90° off from the real device: drawProceduralArc measured its
  // sweep from 3 o'clock (spec.start as a raw canvas angle) while sectorImage's image-backed
  // arcs already correctly measure from 12 o'clock (spec.start-90, see its own note) — the two
  // arc kinds should agree, and visibly must here since Combo nests 3 procedural rings that
  // need the same gap position to read as concentric. All 3 rings share one center; each ring's
  // own x/y is genuinely absolute (confirmed against a matching ungrouped sibling ring at the
  // same screen position), unlike Elaborate_2's ring (see drawGroup's ringPos) — left alone.
  // Remaining gap is the ring's fill fraction, which depends on live steps/goal that the
  // baked preview captured at an unknowable real value (same caveat as the cases above).
  {
    name: "Multifunction__366__Combo",
    url: comboUrl,
    time: "2026-01-09T10:09:30",
	sim: { steps: 10000 },
    maxDiffRatio: 0.02,
  },
  // sim time matches the baked preview's actual capture date/second (found by inspection —
  // "July 09", not this file's other cases' "January 09"), so date/weekday-highlight line up
  // exactly; sim.calories likewise set to the baked preview's own displayed count (156, read
  // straight off the file's embedded preview image) via the per-case `sim` override below —
  // the widget-slot ring/number combo here reads id 0x1e (calories), same mechanism used for
  // steps/hr/battery/etc. on any other case. Three real bugs found along the way:
  // - the calorie/steps widget-slot ring's struct x/y was (0, 276) — a grouped ring's x/y had
  //   only ever been seen fully absolute before (Combo/Function), so drawGroup treated 0 as a
  //   real coordinate and drew the ring flush against the canvas's left edge instead of
  //   centered in its 160x160 frame slot (see drawGroup's ringPos: a 0 on either axis now
  //   means "center me", same convention already used for non-ring boxed children).
  // - temperature's sign glyph (see drawWidget's sub===4 check) turned out to have 2 more
  //   copies here with sub===3 instead of 4, always drawn regardless of sign — generalized
  //   the hide-if-non-negative check to cover both.
  // - the battery tile's "80%" NUMBER+"%" pair (same packed-row mechanism as Function's) has
  //   the NUMBER at a real y=46 instead of Function's y=0, which the old x===0&&y===0 hug
  //   check missed entirely — it fell back to being centered across the whole 160px-tall
  //   frame shared with the unrelated "Battery" label below, landing "%" and "80" on separate
  //   rows. isAuto now only requires x===0; the row's cross-axis position prefers the hugged
  //   NUMBER's own y (see drawGroup's rowCross) over generic frame-centering when it's nonzero.
  // Remaining diff is the goal ring's own fill fraction (bound to id 0x26, steps-slot, not
  // calories — a steps-driven ring paired with a calorie number by this file's own design) and
  // the goal-ring accent color, both the same unknowable-baked-live-value caveat as Combo/
  // Default above; defaultSim's steps/stepsGoal are asserted, not matched to this device.
  {
    name: "Multifunction__304__Elaborate_2",
    url: elaborate2Url,
    time: "2025-07-09T10:12:30",
    sim: { calories: 156 },
    maxDiffRatio: 0.02,
  },
  // 8 swipeable metric tiles, same 0x79/0x7a bind-per-slot mechanism as Function, correctly
  // gated. Bugs found here: (1) cf=4 ring bitmaps (RGB565, no alpha) bake their empty
  // background as opaque black — chroma-keyed near-black to transparent in render.ts's
  // ringBmp; (2) the two half-rings' bitmaps (284x214) are CROPPED to their arc's bounding
  // box within the widget's full 284x284 circle (meta.w/h) — sectorImage previously spun the
  // sector around the bitmap's own center and drew the bottom half-ring's bitmap at the
  // circle's top; it now pivots on the circle center and anchors a cropped bitmap to the
  // side its arc midpoint lies on. This face also pinned down the Group alignment model
  // (see drawGroup's header): its ring labels sit at authored y=0/y=70, proving non-auto
  // children are never vertically centered — y is literal, only x=0 centers (horizontally).
  // Remaining diff is the minute hand's unknowable exact baked second plus the two rings'
  // fill fraction (battery/kcal, defaultSim's guess vs the device's actual live value —
  // same caveat as every other ring case above).
  {
    name: "Default__276__Dichotomy",
    url: dichotomyUrl,
    time: "2026-01-09T10:09:30",
    maxDiffRatio: 0.025,
  },
];

function labeled(canvas: HTMLCanvasElement, label: string): HTMLCanvasElement {
  canvas.style.width = "160px";
  canvas.style.border = "1px solid #444";
  const cap = document.createElement("div");
  cap.textContent = label;
  cap.style.font = "11px monospace";
  const box = document.createElement("div");
  box.style.display = "inline-block";
  box.style.margin = "4px";
  box.append(canvas, cap);
  document.body.appendChild(box);
  return canvas;
}

function imageData(
  source: CanvasImageSource,
  w: number,
  h: number,
): Uint8ClampedArray {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const cx = c.getContext("2d")!;
  cx.fillStyle = "#000"; // preview/canvas are round-bezel graphics on transparent corners;
  cx.fillRect(0, 0, w, h); // the compared images must agree on a backdrop or corners read as a false diff
  cx.drawImage(source, 0, 0, w, h);
  return cx.getImageData(0, 0, w, h).data;
}

describe("render() output matches embedded preview", () => {
  for (const { name, url, time, sim: simOverrides, maxDiffRatio } of CASES) {
    test(name, async () => {
      const buf = await fetch(url).then((r) => r.arrayBuffer());
      const face = parseBin(buf);
      for (const res of face.resources) res.bitmap = await bitmapOf(res);

      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "flex-start";
      document.body.appendChild(row);
      const title = document.createElement("div");
      title.style.cssText = "width:100%;font:12px monospace;margin-top:8px";
      row.before(title);

      const canvas = document.createElement("canvas");
      canvas.width = 466;
      canvas.height = 466;
      const sim = {
        ...defaultSim(),
        live: false,
        time: new Date(time).getTime(),
        ...simOverrides, // per-case steps/calories/temp/... to match a specific baked value
      };
      drawFace(canvas.getContext("2d")!, face, TAG.main, sim);

      const scr =
        face.screens.find((s) => s.tag === TAG.main) ?? face.screens[0];
      const pv = scr.subs
        ?.find((s) => s.tag === TAG.preview)
        ?.subs?.find((s) => s.tag === TAG.pvStruct);
      const r = face.resources[pv!.images![0]];

      const actual = imageData(canvas, r.w, r.h);
      const expected = imageData(r.bitmap!, r.w, r.h);

      const diff = new Uint8ClampedArray(r.w * r.h * 4);
      // no diffMask here — the default pixelmatch overlay dims the matching pixels and
      // highlights mismatches in red/yellow, which is what's actually useful to eyeball.
      const diffPixels = pixelmatch(actual, expected, diff, r.w, r.h, {
        threshold: 0.1,
      });
      const ratio = diffPixels / (r.w * r.h);
      console.log(`RATIO ${name} = ${ratio}`);

      const actualCanvas = document.createElement("canvas");
      actualCanvas.width = r.w;
      actualCanvas.height = r.h;
      actualCanvas
        .getContext("2d")!
        .putImageData(new ImageData(new Uint8ClampedArray(actual), r.w, r.h), 0, 0);

      const expectedCanvas = document.createElement("canvas");
      expectedCanvas.width = r.w;
      expectedCanvas.height = r.h;
      expectedCanvas
        .getContext("2d")!
        .putImageData(new ImageData(new Uint8ClampedArray(expected), r.w, r.h), 0, 0);

      const diffCanvas = document.createElement("canvas");
      diffCanvas.width = r.w;
      diffCanvas.height = r.h;
      diffCanvas
        .getContext("2d")!
        .putImageData(new ImageData(diff, r.w, r.h), 0, 0);

      title.textContent = `${name} — ${(ratio * 100).toFixed(2)}% diff (max ${(maxDiffRatio * 100).toFixed(0)}%)`;
      [actualCanvas, expectedCanvas, diffCanvas].forEach((c, i) =>
        row.appendChild(
          labeled(
            c,
            [
              "actual (our render)",
              "expected (baked preview)",
              "diff (pixelmatch)",
            ][i],
          ),
        ),
      );

      expect(
        ratio,
        `${(ratio * 100).toFixed(2)}% pixels differ from ${name}'s embedded preview`,
      ).toBeLessThanOrEqual(maxDiffRatio);
    });
  }
});
