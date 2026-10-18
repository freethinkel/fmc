// Real touches for browser tests: CDP touch emulation turns the page into a coarse-pointer device
// (`any-pointer: coarse` matches) and Input.dispatchTouchEvent feeds it fingers, so pointer capture,
// hit-testing and the CSS that shows a grip all run as on a phone — a synthetic PointerEvent sent
// straight to an element would skip every one of them.
/// <reference types="@vitest/browser-playwright" />
import { cdp } from "vitest/browser";

export const touchScreen = (enabled: boolean) =>
  cdp().send("Emulation.setTouchEmulationEnabled", { enabled, maxTouchPoints: 5 });

// the test runs in an iframe of the orchestrator page, and CDP speaks the top page's coordinates
function toPage(x: number, y: number) {
  const r = window.frameElement!.getBoundingClientRect();
  const k = r.width / window.innerWidth;

  return { x: r.left + x * k, y: r.top + y * k };
}

export type Finger = { id: number; x: number; y: number };

/** start/move list every finger down; end lifts the fingers it lists, or all of them */
export async function touch(
  type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel",
  fingers: Finger[] = [],
) {
  await cdp().send("Input.dispatchTouchEvent", {
    type,
    touchPoints: fingers.map((f) => ({ id: f.id, ...toPage(f.x, f.y) })),
  });
  await new Promise((r) => setTimeout(r, 0)); // let Svelte flush the drop marker
}

/** the centre of `el`, and a check that a finger landing there actually hits it */
export function centre(el: Element) {
  const r = el.getBoundingClientRect();
  const at = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  const hit = document.elementFromPoint(at.x, at.y);

  if (!hit || !el.contains(hit)) throw new Error(`${el.className} isn't visible under a finger`);
  return at;
}

/** a point `rel` (0 = top, 1 = bottom) down the middle of `el` */
export function along(el: Element, rel: number) {
  const r = el.getBoundingClientRect();

  return { x: r.left + r.width / 2, y: r.top + r.height * rel };
}
