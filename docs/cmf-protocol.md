# CMF Watch Pro 2 `.bin` format — byte-level reference

Authoritative source is code, not this doc: `fmc_frontend/src/lib/modules/editor/lib/wf.ts`
(parse/build, LZ4, pixel codecs) and `render.ts` (what each tag/id means, verified against
a ~100-face corpus). This file is a condensed map of that code so you don't have to
re-derive it. When in doubt, re-read those two files — they're short (≈450 lines each).

## File layout

```
[36-byte header][TAG.root tree][resources][36-byte header, byte-identical footer]
```

Header (`wf.ts:183-217,315-324`):
- `0x00-0x03` CRC32 "raw" (reflected IEEE poly 0xEDB88320, init=0, **no final XOR**) of `header[4:36] + treeSection`
- `0x04-0x07` magic `01 00 00 (00|02)` — last byte unconfirmed, both values seen
- `0x08-0x17` 16-byte NUL-terminated face name (may have a non-zero unexplained tail after the NUL — round-trip it verbatim as `nameRaw`, don't regenerate from `name`)
- `0x18-0x1b` u32 total body length (tree section + resources section)
- `0x1c-0x1f` u32 resources-section length
- `0x20-0x23` CRC32 "raw" of just the resources section

Body: `[0x20][u16 tree length][TLV tree]` then resources back-to-back, each
`[u32 header][u32 size][data]` where `header = (cf&0x1f) | (w&0x7ff)<<10 | (h&0x7ff)<<21`.

**Use `buildBin(face)` from `wf.ts` to assemble all of this — never hand-roll the header/CRC/LZ4.**
`buildBin` takes `{ name, screens: FaceNode[], resources: Resource[] }` and returns the final
`Uint8Array`. Screens is normally exactly two nodes: `{tag: TAG.main}` and `{tag: TAG.aod}`.

## TLV tree

Every node: `[tag u8][len u16][value]`. `TAG` constants (`wf.ts:45-50`):

| const | hex | meaning |
|---|---|---|
| root | 0x20 | body wrapper, not a real node |
| main | 0x21 | normal screen |
| aod | 0x22 | always-on-display screen (keep simple — no rings, dimmer, big clock only) |
| name | 0x86 | 64-byte NUL-terminated display name node (not drawn) |
| preview | 0x28 | embedded catalog thumbnail (pvStruct child) |
| struct | 0x01 | `x u16, y u16, meta[14]` + optional image ref |
| bind | 0x02 | visibility condition, sibling of a widget's struct |
| pivot | 0x05 | `flag u8, pivotX u16, pivotY u16` — hand rotation center |
| pvStruct | 0x08 | `prefix[5]` + image ref, no x/y (preview image only) |
| fmt | 0x40 | 1 byte: digit-count/zero-pad flag, sibling of a `number` struct |
| frame | 0x48 | `x,y,w,h,gap,align` — auto-layout row/column (**skip this**: every widget can be placed with absolute x/y directly at screen top level, no group needed) |
| image | 0x30 | static image OR pick-by-value from N images |
| number | 0x60 | live numeric readout, digit-image strip |
| group | 0x68 | frame + auto-laid-out children (skip, see frame) |
| hand | 0x70 | rotating image around a pivot |

Plus literals used directly (not in the `TAG` object): `0x80`/`0x81` progress rings,
`0x5a`/`0x5b` their arc-spec sibling, `0x85`/`0x5f` user-assignable complication slot
(not relevant for converting a fixed Facer design — skip).

### `meta` (14 bytes, struct's bytes 4..18)

`w=m[0..1] u16, h=m[2..3] u16, id=m[9], sub=m[10], max=m[11..13] u24 LE`.
`id` (the live-data source, table below) is read by the renderer for `number`/`image
pick`/arc widgets. `w===0x8000` means "auto-layout child of a frame" — irrelevant if you
skip frames. Fill `max` with a sensible real value anyway (some faces do, cosmetic/future-proofing,
costs nothing) but don't rely on the renderer enforcing it. `m[7]===4` is the accent-color
capability flag — see "Accent color" below; `m[4..6]` next to it looks like leftover
placeholder bytes (`(1,0,0)`/`(4,0,0)`), not a meaningful color, at least on flagged structs.

### Data-source ids (`render.ts:6-15,57-90`)

| id (hex) | meaning | id (hex) | meaning |
|---|---|---|---|
| 0x01 | hour (12/24 per device setting) | 0x19 | steps |
| 0x07 | hour, forced 24h | 0x1a | heart rate |
| 0x0b | minute | 0x1e/0x48 | calories |
| 0x0f/0x12/0x71/0x72 | second | 0x22/0x23 | distance km/mi (int part) |
| 0x13 | AM/PM flag (0/1) | 0x30 | battery level |
| 0x16 | month (1-12) | 0x36/0x5f | temperature |
| 0x17 | day of month | 0x73 | 24h/metric-units flag |
| 0x18 | weekday (0=Monday, unconfirmed) | | |

Any id can drive a `number` widget, an `image`-pick widget, or an arc ring — the mechanism
is generic (see below), not hardcoded per id.

### `image` (0x30): static or pick-by-value

Struct has an `images` array (resource indices). If length 1 → always drawn. If length N>1 →
`idx = ((floor(idValue(id)) % N) + N) % N`, draws `images[idx]`. This is how day-of-week (7
images), month (12 images), AM/PM (2 images) pickers work — **the images must already be
fully-rendered bitmaps for each state**; there is no runtime text/label rendering.

### `number` (0x60): live digit strip

```
number (0x60)
├─ struct (0x01): x, y, meta.id = <data source>, images = [ten consecutive resource indices, digit 0..9]
└─ fmt (0x40): 1 byte = digitCount | (0x80 if zero-padded)
```
Renderer rounds `idValue(id)`, formats to `digitCount` chars (zero-padded or not), then draws
**each character** by indexing the *same* 10-image array (`imgs[+ch]`) left-to-right starting
at `x,y`. Height = tallest glyph, width = sum of glyph widths (no built-in centering — if you
need a number to look centered, precompute the expected value's rendered width and offset `x`
accordingly; the ceiling is real, there's no alignment field).

**One `number` widget renders an entire multi-digit value** (e.g. 2-digit zero-padded hour) —
you do NOT need separate tens/units widgets. Confirmed live in the corpus
(`watchfaces/files/Digital__319__One_Line.bin`): hour widget has `meta.id=0x07`,
`fmt=0x82` (2 digits, zero-pad), one shared 10-image digit set.

### Progress rings (0x80 procedural / 0x81 image-clipped)

```
0x80 (or 0x81)
├─ struct (0x01), SHORT form: x, y, meta.id = <data source>, NO images/ref at all
└─ 0x5a (or 0x5b): min i32, max i32, start i16 (0.1°), end i16 (0.1°), width u16, radius u16 (0x5a only)
```
`x,y` = top-left of the ring's bounding box (center = `x+radius, y+radius`). Angle 0° = 3
o'clock, positive = clockwise. `frac = (idValue(id) - min) / (max - min)`, clamped 0..1 — **set
min/max to the metric's real range** (e.g. heart rate 0-200 bpm, steps 0-10000, battery 0-100);
if `max <= 100` the renderer special-cases step/calorie "goal" ids to mean percent-of-goal —
harmless for other ids (battery/heart-rate), but be aware if you reuse a step-goal id.
With no image resource, `render.ts`'s procedural fallback strokes a translucent white full
track + white highlighted arc for the filled fraction — this is the **preview tool's own
stand-in style**; real device firmware may render this differently (own ring color/theme),
so don't over-index on exact preview pixels here.

### Accent color: struct.meta[7]===4 (real capability flag, not a color heuristic)

**`meta[7]` (`m[7]`, byte 11 of the struct's 14-byte meta) `=== 4`** marks that widget's
resource(s) as accent-tintable: the watch's own firmware substitutes the user's chosen accent
color for whatever's baked there, at render time. `render.ts`'s `metaInfo(node).accent` exposes
this; `editor.model.ts`'s `accentFlaggedResources(face)` walks the tree collecting flagged
resource indices, and `accentBitmapFor` recolors **every non-transparent pixel** of a flagged
resource (alpha untouched) — no per-pixel color test at all, because the flag identifies the
*whole resource* as tintable regardless of what color it happens to be baked as.

This flag was reached the hard way — **don't redo the color-matching approach that preceded
it**. The original theory ("some pixels are baked a specific reddish placeholder color the
firmware swaps out") looked promising and was refined repeatedly (single exact RGB → 2 → 3 → 4
reference points, plus a widget-role allowlist to suppress false positives), but ultimately
**can't work**: `Multifunction__348__Tumbler`'s accent-tintable ring and
`Digital__282__Radar_Sweep`/`Digital__291__Vertical`'s ordinary non-accent digit strips bake
the *exact same* `(255,72,32)` RGB — genuinely indistinguishable by pixel color, confirmed
exhaustively (every pixel, both files). Worse: `Analog__305__Dots`' accent-tintable hour hand
and `Analog__306__Large_Number`'s accent-tintable digits are baked **plain white** — no
reddish color at all — so a color-based approach would have missed them entirely regardless of
tuning. The flag is a *per-widget* signal that has nothing to do with the resource's own baked
color; treat any color-based heuristic here as a dead end, not a starting point to refine.

Confirmed against 7 real-device/companion-app checks — 4 positive, 3 negative, chosen
specifically to stress both directions:
| file | real device | `meta[7]===4` widgets found |
|---|---|---|
| `Theatre` | accent setting present, tints the (colored) second hand | 1 (`hand`, id `0x72`) |
| `Digits_time` | present, tints big digits + weekday badge | matches (2 `image` roles) |
| `Analog__305__Dots` | present, tints one (white) hour-ish hand | 1 (`hand`, id `0x0a`) |
| `Analog__306__Large_Number` | present, tints (white) digits | 1 (`image`, id `0x0`) |
| `Multifunction__304__Elaborate_2` | present | 18 hits across several widgets |
| `Analog__316__Trailing` | **absent** — confirmed no setting despite a reddish hand | 0 |
| `Creative__312__Disc` | **absent** | 0 |
| `Diwali__295__Vortex` | **absent** | 0 |

**56 of the 100 corpus files** have at least one `meta[7]===4` widget.

This is a live per-pixel substitution at render time, not baked once — the shipped `.bin` must
keep its original bytes; **never bake a chosen accent color into `resource.data`/`buildBin`
output**, only into the preview-canvas draw path (`editor.model.ts`'s
`accentBitmapFor`/`applyAccent`/`accentFlaggedResources`, `Sim.accentColor`) so the exported
file still lets the real watch apply its own choice.
Not fully understood: `meta[4..6]` sits right next to the flag byte and looked at first like it
might encode something (some structs show a real-looking RGB there with a different tail
pattern, `f1=1,f2=255`, vs. the flagged structs' placeholder `(1,0,0)`/`(4,0,0)`) — never
resolved what that second pattern means; it doesn't correlate with accent capability, so left
undocumented beyond this note. If a face is known (from the real device/app) to support accent
color but the editor doesn't offer/apply it, check `meta[7]` on the specific widget by hand
first — that's the only thing that's mattered so far.

### Hard resource-packing rule

**Every node's `images` array must reference *consecutive* resource-array indices.**
`buildBin`/`refTailBytes` (`wf.ts:271-293`) throws if not. Plan your `resources` array
construction so each digit-set (10), each pick-list (N), sits as one contiguous block;
standalone single images can go anywhere else.

## Pixel/resource formats (`encodePixels`, `wf.ts:432-454`)

| cf | bytes/px | notes |
|---|---|---|
| 4 | 2 | RGB565, no alpha |
| 5 | 3 | RGB565 + separate alpha byte — **most common, use this by default** |
| 13 | 0.5 | 4-bit alpha-only mask, RGB forced white — only if you truly want a monochrome mask |
| 24 | 4 | full BGRA8888 |
| 1 | — | raw JPEG, **decode-only**, `encodePixels` throws — never produce this |

`encodePixels(px: Uint8ClampedArray RGBA, w, h, cf)` returns a `Resource` (LZ4-compressed
internally via the file's own from-scratch codec — just call it, don't touch LZ4 yourself).
Canvas/framebuffer is **466×466 square** (`render.ts:469`) regardless of the watch's round
bezel — the round look comes entirely from the artwork, not a code-level clip.

## Gotcha: a `number` sharing an id with a ring shows the ring's percent, not the raw value

`numberString` (`render.ts:259-270`) checks `collectArcsById` (screen-wide, not just
siblings) — if ANY `0x80`/`0x81` ring on the same screen has `struct.meta.id` equal to
this `number`'s id, the number renders `round(progressFrac(...) * 100)` **instead of**
`round(idValue(id))`. Confirmed live: give a heart-rate ring and a heart-rate number both
`id=0x1a`, and the number shows e.g. `36` (71/200 as a percent) instead of `71` bpm.

- If the metric has an alias id that reads the same `idValue` (steps: `0x19`/`0x24`/
  `0x26`/`0x49`, calories: `0x1e`/`0x48`) — put the ring on one alias, the number on
  another. They read identical live data, so they stay in sync.
- If it doesn't (heart rate `0x1a` has no known alias) — you can't have both a ring driven
  by the real metric AND a number showing its raw value on the same screen. Pick one:
  drop the ring (keep the accurate number) or drop the number (keep the ring, no readout).
  Do NOT ship a ring+number pair sharing an id when the metric isn't naturally a 0-100
  percent already — the number will silently show the wrong thing (only battery is safe
  to double up, because its raw range 0-100 numerically equals its own percent-of-max).

## What is NOT supported (real ceiling, not laziness)

- **No live text rendering.** Every glyph — digits, day names, month names, AM/PM, labels —
  is a pre-rendered bitmap. There is no TTF/font rasterizer anywhere in this repo either
  (`fmc_frontend/package.json` has no `opentype.js`/`fontkit`/`canvas`/`sharp`) — bring your
  own (e.g. Pillow) to turn a source face's fonts into per-state PNGs.
  - Fixed small enumerations (day-of-week, month, AM/PM, 0-9 digits) → straightforward:
    render once, use as an `image` pick-list or `number` digit strip.
  - Anything the source renders as free-form text with a *live* value beyond a bounded
    digit strip (e.g. arbitrary-precision computed strings, conditional text) has no
    direct equivalent — falls back to a `number` widget if it's fundamentally numeric,
    or gets baked as static art if it never changes at runtime.
- **Temperature (numeric) is supported, weather *condition* is not.** `id=0x36`/`0x5f`
  both read `sim.temp` and are exercised for real by the corpus's own
  `Digital__361__TempoG.bin` (a plain `number` widget, same pattern as any other digit
  strip — no unit/locale handling, just the raw number). Checked exhaustively across all
  101 corpus `.bin`s (every `struct.meta.id` used anywhere, plus every metric id listed
  in every `0x85` companion-app-assignable slot) for anything resembling a weather icon
  (sun/cloud/rain pictogram) or condition code — found none; the only complication icons
  in the corpus are activity-related (flame, lightning bolt, etc.). So: port a source
  face's numeric temperature to a `number` widget on `id=0x5f`; drop condition
  icons/description text (`#WCCI#`/`#WCCT#`/`#WCT#`-style tokens in Facer) — there is no
  id for them anywhere in the observed corpus. If a future face needs to double-check
  this, re-run the corpus-wide id/slot scan rather than trusting this note blindly — it
  reflects the 101-face corpus available at the time of writing, not a firmware spec.
- **Nothing changes color at runtime, except the one documented accent-color mechanism**
  (`meta[7]===4`, see "Accent color" above) — that's a real, narrow exception, not a general
  tint system. Outside of it, there's no "tint" field read by the renderer for `image`/`number`
  resources — whatever RGB you bake into the PNG is what's drawn. If the source format tints a
  white silhouette at runtime (Facer's `tint_color`/`is_tinted`) and you don't want it
  accent-tinted, pre-bake that color into the pixel data yourself before encoding, and leave
  `meta[7]` at its default (not `4`).
