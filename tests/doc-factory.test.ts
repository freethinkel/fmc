// The layers the editor creates from scratch have to serialize into a file the watch can read —
// the shapes themselves (ring spec, slot body, group frame) are checked through the editor in
// editor-new-nodes.browser.test.ts; this pins the one path that has no widget in it at all: a
// blank document, which is what "New" produces.
import { test, expect } from "vitest";
import { buildBin, parseBin, TAG, type Resource } from "../src/lib/modules/editor/core/format";
import { toLegacy } from "../src/lib/modules/editor/core/document/doc";
import { blankDoc, withName } from "../src/lib/modules/editor/core/document/factory";

const res = (w: number, h: number): Resource => ({
  cf: 4,
  w,
  h,
  data: new Uint8Array(w * h * 2),
});

test("a blank document builds into a parseable file with both of its assets", () => {
  const doc = blankDoc("Fresh", res(2, 2), res(466, 466));
  const built = parseBin(buildBin(toLegacy(doc)));

  expect(built.name).toBe("Fresh");
  // the preview thumbnail and the background, in that order
  expect(built.resources).toHaveLength(2);
  expect([built.resources[0].w, built.resources[1].w]).toEqual([2, 466]);
  // one main screen carrying the name node, the embedded preview and the background
  expect(built.screens).toHaveLength(1);
  expect(built.screens[0].tag).toBe(TAG.main);
  expect(built.screens[0].subs!.map((n) => n.tag)).toEqual([TAG.name, TAG.preview, 0x30]);
});

// The name lives in the 16-byte header field (cut to 15 bytes) and in the 0x86 node, while
// `name` keeps it whole — the trailing header byte means something we haven't figured out, so it
// has to survive a rename untouched.
test("renaming keeps the header's trailing byte and cuts only the header copy", () => {
  const doc = withName(blankDoc("Fresh", res(2, 2), res(466, 466)), "A name well over fifteen");
  const built = parseBin(buildBin(toLegacy(doc)));

  expect(doc.name).toBe("A name well over fifteen");
  expect(built.name).toBe("A name well ov");
  expect(built.screens[0].subs!.find((n) => n.tag === TAG.name)?.text).toBe(
    "A name well over fifteen",
  );
});
