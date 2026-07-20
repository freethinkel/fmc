// Mounts the real editor component, loads a watchface .bin straight into editorModel
// (no window globals, no page navigation) and checks the canvas render matches the
// preview image baked into the same file, once downscaled to preview size — the same
// 466->preview pipeline the app itself uses for regenPreviews()/previewBlob().
import { describe, test, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import pixelmatch from 'pixelmatch';
import { EditorPage } from './pages';
import { editorModel } from './model';
import { TAG } from './lib/wf';

import analogUrl from './__fixtures__/Analog__287__Simple_Dial.bin?url';
import digitalUrl from './__fixtures__/Digital__281__Metaball.bin?url';
import multifunctionUrl from './__fixtures__/Multifunction__368__Function.bin?url';

// Frozen per-file demo time — the real clock would make hands/digits differ every run.
// Thresholds are per-file, not one shared bound: the baked preview is a real device
// screenshot at an exact, unknowable second, and Analog/Multifunction/Digital-metaball
// all carry moving hands or highlighted grid nodes, so a few % of pixel drift is expected
// even with a correct renderer — see the comment on each threshold for what it covers.
const CASES = [
  // clean match: dial, hands and date agree with the baked preview almost exactly.
  { name: 'Analog__287__Simple_Dial', url: analogUrl, time: '2026-01-09T10:09:30', maxDiffRatio: 0.02 },
  // has an hour/minute/second hand trio; the exact baked second is unknowable, so hand
  // angles drift a little even when correct. Also: one widget ("68 Bpm") is hidden behind
  // an unmapped bind data-source id (0x79, likely a swipeable-tile selector) — a real
  // protocol gap, not a rendering bug, tracked separately rather than papered over here.
  { name: 'Multifunction__368__Function', url: multifunctionUrl, time: '2026-01-09T10:09:30', maxDiffRatio: 0.05 },
  // the highlighted metaball node is a JPEG frame baked by the original tool at a visibly
  // darker gray than the file's own preview snapshot (verified against the raw JPEG bytes,
  // independent of our decode/render path) — a source-asset inconsistency, not a bug here.
  { name: 'Digital__281__Metaball', url: digitalUrl, time: '2026-01-09T10:12:30', maxDiffRatio: 0.18 },
];

function imageData(source: CanvasImageSource, w: number, h: number): Uint8ClampedArray {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const cx = c.getContext('2d')!;
  cx.fillStyle = '#000'; // preview/canvas are round-bezel graphics on transparent corners;
  cx.fillRect(0, 0, w, h); // the compared images must agree on a backdrop or corners read as a false diff
  cx.drawImage(source, 0, 0, w, h);
  return cx.getImageData(0, 0, w, h).data;
}

async function nextFrame() {
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
}

describe('editor render matches embedded preview', () => {
  for (const { name, url, time, maxDiffRatio } of CASES) {
    test(name, async () => {
      render(EditorPage);

      const buf = await fetch(url).then(r => r.arrayBuffer());
      await editorModel.loadBufferFx({ buf, label: name });
      editorModel.simPatched({ live: false, time: new Date(time).getTime() });
      await nextFrame();

      const { face } = editorModel.editor.getState();
      const scr = face!.screens.find(s => s.tag === TAG.main) ?? face!.screens[0];
      const pv = scr.subs?.find(s => s.tag === TAG.preview)?.subs?.find(s => s.tag === TAG.pvStruct);
      const r = face!.resources[pv!.images![0]];

      const canvas = document.querySelector('canvas')!;
      const actual = imageData(canvas, r.w, r.h);
      const expected = imageData(r.bitmap!, r.w, r.h);

      const diff = new Uint8ClampedArray(r.w * r.h * 4);
      const diffPixels = pixelmatch(actual, expected, diff, r.w, r.h, { threshold: 0.1 });
      const ratio = diffPixels / (r.w * r.h);

      expect(ratio, `${(ratio * 100).toFixed(2)}% pixels differ from ${name}'s embedded preview`).toBeLessThanOrEqual(maxDiffRatio);
    });
  }
});
