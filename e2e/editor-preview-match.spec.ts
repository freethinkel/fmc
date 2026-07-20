// Loads a real .bin watchface (e2e/fixtures/*.bin) into the editor and checks that the
// canvas render matches the preview image baked into the same file — parsed on the fly
// from the loaded face tree, not pre-extracted — once downscaled to preview size, the
// same 466->preview pipeline the app itself uses for regenPreviews()/previewBlob().
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const FIXTURES = new URL('./fixtures/', import.meta.url).pathname;
const MAX_DIFF_RATIO = 0.02; // 2% of pixels may differ (anti-aliasing during downscale)

// Frozen per-file demo time matching what's actually baked into each preview (read off
// the preview image itself: hour/AM-PM bubble, date digit, minute-bucket highlight) —
// a mismatched demo time dwarfs any real rendering diff, since hands/digits move.
const SIM_TIMES: Record<string, string> = {
  Analog__287__Simple_Dial: '2026-01-09T10:09:30',
  Digital__281__Metaball: '2026-01-09T10:12:30',
  Multifunction__368__Function: '2026-01-09T10:09:30',
};

const NAMES = Object.keys(SIM_TIMES);

for (const name of NAMES) {
  test(`editor render matches embedded preview: ${name}`, async ({ page }) => {
    const bin = readFileSync(`${FIXTURES}${name}.bin`);

    await page.goto('/editor');
    await page.waitForFunction(() => (window as any).wfEd != null);

    await page.evaluate(async ({ b64, simTime }) => {
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      await (window as any).wfEd.loadBufferFx({ buf: bytes.buffer, label: 'e2e' });
      (window as any).wfEd.simPatched({ live: false, time: simTime });
    }, { b64: bin.toString('base64'), simTime: new Date(SIM_TIMES[name]).getTime() });

    await page.waitForFunction(() => (window as any).wfEd.editor.getState().face != null);
    await page.waitForTimeout(200); // let the rAF render loop draw a frame

    const { actualB64, expectedB64, size } = await page.evaluate(() => {
      const PREVIEW = 0x28, PV_STRUCT = 0x08, MAIN = 0x21; // wf.ts TAG.preview/pvStruct/main
      const { face } = (window as any).wfEd.editor.getState();
      const scr = face.screens.find((s: any) => s.tag === MAIN) || face.screens[0];
      const pv = scr.subs.find((s: any) => s.tag === PREVIEW)?.subs?.find((s: any) => s.tag === PV_STRUCT);
      const r = face.resources[pv.images[0]];

      const toDataURL = (source: CanvasImageSource, w: number, h: number) => {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const cx = c.getContext('2d')!;
        cx.fillStyle = '#000'; // preview/canvas are round-bezel graphics on transparent corners;
        cx.fillRect(0, 0, w, h); // the compared images must agree on a backdrop or corners read as a false diff
        cx.drawImage(source, 0, 0, w, h);
        return c.toDataURL('image/png').split(',')[1];
      };

      const canvas = document.querySelector('canvas')!;
      return {
        actualB64: toDataURL(canvas, r.w, r.h),
        expectedB64: toDataURL(r.bitmap, r.w, r.h),
        size: { w: r.w, h: r.h },
      };
    });

    const actual = PNG.sync.read(Buffer.from(actualB64, 'base64'));
    const expected = PNG.sync.read(Buffer.from(expectedB64, 'base64'));

    const diff = new PNG(size);
    const diffPixels = pixelmatch(actual.data, expected.data, diff.data, size.w, size.h, { threshold: 0.1 });
    const ratio = diffPixels / (size.w * size.h);

    if (ratio > MAX_DIFF_RATIO) {
      await test.info().attach('diff', { body: PNG.sync.write(diff), contentType: 'image/png' });
      await test.info().attach('actual', { body: PNG.sync.write(actual), contentType: 'image/png' });
      await test.info().attach('expected', { body: PNG.sync.write(expected), contentType: 'image/png' });
    }
    expect(ratio, `${(ratio * 100).toFixed(2)}% pixels differ from ${name}'s embedded preview`).toBeLessThanOrEqual(MAX_DIFF_RATIO);
  });
}
