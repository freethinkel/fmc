// The Watch Pro 3 half of issue #49. Decoding was closed by the cf 28 / cf 14 work
// (tests/etc2.test.ts); what was left was a re-export that quietly lost things — every one of
// these files opened fine and then came back out different, which is the half that matters once
// someone flashes an edited face to a watch we can't test on.
//
// Corpus: the 131 files musaoruc extracted from Nothing X and attached to #49. Too large to
// vendor, so the four fixtures here are one per failure class and the whole-corpus pass below is
// opt-in — point FMC_PRO3_CORPUS at an unzipped Pro_3_Watchfaces/ to run it.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { buildBin, hex, parseBin, TAG } from "$lib/modules/editor/core/format";
import type { FaceNode } from "$lib/modules/editor/core/format/raw";
import { fromLegacy, toLegacy, type Layer } from "$lib/modules/editor/core/document/doc";

const fixture = (name: string) =>
  parseBin(new Uint8Array(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url))));

const layers = (face: ReturnType<typeof parseBin>) => {
  const { doc } = fromLegacy(face);
  const out: Layer[] = [];
  const walk = (l: Layer) => {
    out.push(l);
    if (l.kind === "group") l.children.forEach(walk);
    if (l.kind === "raw") l.children?.forEach(walk);
  };

  doc.screens.forEach((s) => s.layers.forEach(walk));
  return { doc, out };
};

describe("refType 0x01 over more than one frame", () => {
  // 0x61/0x71 store the first resource offset plus the block sizes to walk on from it; 0x01
  // spells every frame out as its own absolute u32. Watch Pro 2 files only ever use 0x01 with
  // count=1, so the old parser read it as "exactly one resource" and rejected the rest — in
  // 1753776259784_WatchFace.bin that demoted a 7-frame animated background to an opaque `tail`
  // and orphaned 490 KB of art. Built here rather than vendored: the file is 580 KB, and
  // rewriting a real multi-frame run into the 0x01 shape pins both directions of the codec.
  const multi = (refType: number) => (n: FaceNode) =>
    n.tag === TAG.struct && n.refType === refType && (n.images?.length ?? 0) > 2;
  const find = (ns: FaceNode[], p: (n: FaceNode) => boolean): FaceNode | undefined => {
    for (const n of ns) {
      const hit = p(n) ? n : n.subs && find(n.subs, p);

      if (hit) return hit;
    }
  };
  // a fresh parse each time — the conversion below mutates the tree in place
  const converted = () => {
    const face = fixture("Pro3__Sports_Dial.bin");

    find(face.screens, multi(0x61))!.refType = 0x01;
    return face;
  };

  test("the fixture really has a multi-frame run to convert", () => {
    expect(
      find(fixture("Pro3__Sports_Dial.bin").screens, multi(0x61))?.images?.length,
    ).toBeGreaterThan(2);
  });

  test("every frame survives a build/parse cycle", () => {
    const face = converted();
    const before = find(face.screens, multi(0x01))!.images;
    const after = find(parseBin(buildBin(face)).screens, multi(0x01))?.images;

    expect(after).toEqual(before);
  });

  test("and rebuilds to the same bytes, so the tail is stable", () => {
    const face = converted();

    expect(hex(buildBin(parseBin(buildBin(face))))).toBe(hex(buildBin(face)));
  });
});

describe("the name in 0x86 outranks the header field", () => {
  // The 16-byte header holds at most 15 chars and these files use 14; the real title is in the
  // 0x86 node. Reading the header re-exported "Rainbow Lollipop" as "Rainbow Lollip".
  const face = fixture("Pro3__Rainbow_Lollipop.bin");

  test("header is the truncated one", () => expect(face.name).toBe("Rainbow Lollip"));
  test("the doc takes the full title", () =>
    expect(fromLegacy(face).doc.name).toBe("Rainbow Lollipop"));
  test("and writes it back, header bytes untouched", () => {
    const { doc } = fromLegacy(face);
    const name = toLegacy(doc)
      .screens.flatMap((s) => s.subs ?? [])
      .find((n) => n.tag === TAG.name);

    expect(name?.text).toBe("Rainbow Lollipop");
    expect(toLegacy(doc).nameRaw).toBe(face.nameRaw);
  });
});

describe("condition op 4 is <", () => {
  // Paired with a 5 over the same source to bound a half-open range. Unmapped it fell through to
  // "eq" and re-exported as a 1, rewriting the face's visibility rules.
  const { out } = layers(fixture("Pro3__CitrusDash.bin"));
  const lt = out.flatMap((l) => l.conditions).filter((c) => c.op === "lt");

  test("decodes", () => expect(lt.length).toBeGreaterThan(0));
  test("re-encodes as a 4, not a 1", () => {
    const bind = toLegacy(fromLegacy(fixture("Pro3__CitrusDash.bin")).doc)
      .screens.flatMap(function all(n: FaceNode): FaceNode[] {
        return [n, ...(n.subs ?? []).flatMap(all)];
      })
      .filter((n) => n.tag === TAG.bind && n.hex);

    expect(bind.some((n) => n.hex!.slice(4, 6) === "04")).toBe(true);
  });
});

describe("unmodelled service children stay on the widget", () => {
  // 0x5c under 0x82, 0x5d under 0x83, 0x5e under 0x84, 0x63 under 0x89 — Watch Pro 3 widget tags
  // whose extra child a Watch Pro 2 widget never has. toLegacy rebuilds a widget's children from
  // its fields, so anything it didn't model was dropped on the way out.
  test.each([
    ["Pro3__Rainbow_Lollipop.bin", 0x5c],
    ["Pro3__Chavelle.bin", 0x5d],
    ["Pro3__CitrusDash.bin", 0x5e],
    ["Pro3__Sports_Dial.bin", 0x63],
  ])("%s keeps 0x%s", (file, tag) => {
    const { out } = layers(fixture(file));
    const kept = out.flatMap((l) => ("extra" in l ? (l.extra ?? []) : []));

    expect(kept.map((e) => e.tag)).toContain(tag);
    expect(kept.every((e) => e.hex.length > 0)).toBe(true);
  });
});

// Opt-in: FMC_PRO3_CORPUS=/path/to/Pro_3_Watchfaces npx vitest run --project unit pro3-format
const corpus = process.env.FMC_PRO3_CORPUS;

describe.skipIf(!corpus)("the whole #49 corpus", () => {
  test("opens, and comes back out byte for byte", () => {
    const files = readdirSync(corpus!).filter((f) => f.endsWith(".bin"));
    const broken: string[] = [];

    expect(files.length).toBeGreaterThan(100);
    for (const f of files) {
      const face = parseBin(new Uint8Array(readFileSync(`${corpus}/${f}`)));

      if (hex(buildBin(face)) !== hex(buildBin(toLegacy(fromLegacy(face).doc)))) broken.push(f);
    }
    expect(broken).toEqual([]);
  });
});
