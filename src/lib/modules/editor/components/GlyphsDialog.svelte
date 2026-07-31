<script lang="ts">
  // Regenerate the selected widget's sprites from a font instead of hand-made PNGs: the ten
  // digits of a number, the labels of a value-indexed set. Everything here is preview — the
  // sprites that end up in the document are rasterized again in glyphsFx, off the same pure
  // functions, so what you see is what gets encoded.
  import { Dialog } from "$lib/shared/components/dialog";
  import { Button } from "$lib/shared/components/button";
  import { Field } from "$lib/shared/components/field";
  import { Input } from "$lib/shared/components/input";
  import { Select } from "$lib/shared/components/select";
  import { Checkbox } from "$lib/shared/components/checkbox";
  import { Icon } from "$lib/shared/components/icon";
  import { findLayer } from "../core/document/edits";
  import { FRAME_LABELS } from "../core/document/sources";
  import type { NodeId } from "../core/document/doc";
  import {
    DIGITS,
    ensureFont,
    fontOf,
    glyphBytes,
    glyphCell,
    localFamilies,
    registerFont,
    renderGlyphs,
  } from "../core/render/glyphs";
  import { editorModel } from "../model";

  const {
    $doc: doc,
    $glyphDialog: dialog,
    glyphDialogClosed,
    glyphsRequested,
    errored,
  } = editorModel;

  // The families the app itself ships, plus whatever the user adds — a file they upload or the
  // installed ones, once they grant the Local Font Access permission.
  const APP_FAMILIES = [
    { value: '"Geist Mono", ui-monospace, monospace', label: "Geist Mono (app)" },
    { value: '"Instrument Serif", Georgia, serif', label: "Instrument Serif (display)" },
    { value: "system-ui, sans-serif", label: "System sans" },
    { value: "ui-monospace, monospace", label: "System mono" },
  ];
  const WEIGHTS = [300, 400, 500, 600, 700, 800];

  let added = $state<{ value: string; label: string }[]>([]);
  let family = $state(APP_FAMILIES[0].value);
  let sizePx = $state(48);
  let weight = $state(500);
  let italic = $state(false);
  let color = $state("#ffffff");
  let spacing = $state(0);
  let labelsText = $state(DIGITS.join(" "));
  let localBusy = $state(false);
  let fileEl = $state<HTMLInputElement>();
  let canvasEl = $state<HTMLCanvasElement>();
  let info = $state("");

  const options = $derived([...added, ...APP_FAMILIES]);
  const target = $derived($dialog);
  const layer = $derived(target && $doc ? findLayer($doc, target) : null);
  // what the widget being replaced has to hold: a value-indexed source fixes both the labels and
  // their order (index = value), a number wants the ten digits
  const preset = $derived(
    layer && layer.kind !== "group" && layer.kind !== "raw"
      ? (FRAME_LABELS[layer.meta.source] ?? DIGITS)
      : DIGITS,
  );
  const labels = $derived(labelsText.split(/\s+/).filter(Boolean));

  // Re-seed the form when the dialog opens on a different widget, not on every doc change.
  let openedOn = $state<NodeId | null>(null);

  $effect(() => {
    if (target === openedOn) return;
    openedOn = target;
    if (!target) return;
    labelsText = preset.join(" ");
  });

  // Live preview: the same cell maths the generator runs, drawn into one strip.
  $effect(() => {
    const font = fontOf(family, sizePx, weight, italic);
    const set = labels;
    const [fill, sp] = [color, spacing];
    let alive = true;

    if (!set.length) {
      info = "";
      return;
    }
    ensureFont(font).then(() => {
      if (!alive || !canvasEl) return;
      const cell = glyphCell(set, font, sizePx, sp);
      const sprites = renderGlyphs(set, font, fill, cell);
      const cx = canvasEl.getContext("2d")!;

      canvasEl.width = cell.w * set.length;
      canvasEl.height = cell.h;
      sprites.forEach((s, i) => cx.drawImage(s, i * cell.w, 0));
      const kb = glyphBytes(sprites) / 1024;

      info = `${set.length} sprites · ${cell.w}×${cell.h} px · ${kb.toFixed(1)} KB in the file`;
    });
    return () => {
      alive = false;
    };
  });

  async function pickFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];

    if (!file) return;
    try {
      const registered = await registerFont(file);

      added = [
        { value: registered, label: file.name },
        ...added.filter((o) => o.value !== registered),
      ];
      family = registered;
    } catch {
      errored(`${file.name} is not a font the browser can read`);
    }
  }

  // Chromium-only and permission-gated; an empty answer means "no" and is not an error.
  async function pickInstalled() {
    localBusy = true;
    const families = await localFamilies();

    localBusy = false;
    if (!families.length) {
      errored("No access to installed fonts — upload a font file instead");
      return;
    }
    added = families.map((f) => ({ value: `"${f}"`, label: f }));
    family = added[0].value;
  }

  // the accent flag is the inspector's own checkbox — nothing to repeat here
  const generate = () =>
    target && glyphsRequested({ target, labels, family, sizePx, weight, italic, color, spacing });
</script>

<Dialog open={Boolean(target)} title="Sprites from a font" onClose={() => glyphDialogClosed()}>
  <div class="fields">
    <Field label="Font">
      <div class="row">
        <Select bind:value={family} {options} />
        <span class="tool" title="Upload a .ttf / .otf / .woff">
          <Button kind="secondary" onClick={() => fileEl?.click()}>
            <Icon name="upload" size={14} />
          </Button>
        </span>
        <span class="tool" title="Pick from the fonts installed on this machine">
          <Button kind="secondary" disabled={localBusy} onClick={pickInstalled}>
            <Icon name="abc" size={16} />
          </Button>
        </span>
      </div>
    </Field>
    <input
      bind:this={fileEl}
      type="file"
      accept=".ttf,.otf,.woff,.woff2,font/*"
      hidden
      onchange={pickFile}
    />
    <div class="grid">
      <Field label="Size">
        <Input
          type="number"
          min={4}
          max={400}
          value={String(sizePx)}
          onInput={(v) => (sizePx = Math.min(400, Math.max(4, Math.round(+v) || 4)))}
        />
      </Field>
      <Field label="Weight">
        <Select
          value={String(weight)}
          options={WEIGHTS.map((w) => ({ value: String(w), label: String(w) }))}
          onChange={(v) => (weight = +v)}
        />
      </Field>
      <Field label="Spacing">
        <Input
          type="number"
          min={-20}
          max={80}
          value={String(spacing)}
          onInput={(v) => (spacing = Math.min(80, Math.max(-20, Math.round(+v) || 0)))}
        />
      </Field>
    </div>
    <div class="grid">
      <Field label="Color">
        <div class="row">
          <input class="swatch" type="color" bind:value={color} aria-label="Glyph color" />
          <Input bind:value={color} maxlength={7} />
        </div>
      </Field>
      <Field label="Style">
        <label class="check">
          <Checkbox bind:checked={italic} />
          italic
        </label>
      </Field>
    </div>
    <Field label="Characters" hint="space-separated — index = value, keep the watch's order">
      <Input bind:value={labelsText} />
    </Field>
  </div>

  <div class="preview">
    <canvas bind:this={canvasEl}></canvas>
  </div>
  <p class="info">{info}</p>

  <div class="footer">
    <Button kind="ghost" onClick={() => glyphDialogClosed()}>Cancel</Button>
    <Button kind="primary" disabled={!$doc || !labels.length} onClick={generate}>
      Replace frames
    </Button>
  </div>
</Dialog>

<style>
  .fields {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;

    & :global(select),
    & :global(input) {
      min-width: 0;
    }
  }
  .tool {
    flex-shrink: 0;
    display: inline-flex;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    cursor: pointer;
  }
  .swatch {
    flex-shrink: 0;
    width: 1.875rem; /* the row's height — everything in here is button-sized */
    height: 1.875rem;
    padding: 0;
    border: 1px solid oklch(from var(--color-text) l c h / 12%);
    border-radius: var(--border-radius);
    background: transparent;
    cursor: pointer;
  }
  /* the watch panel is black, and white-on-white would preview as nothing at all */
  .preview {
    margin-top: 0.75rem;
    padding: 0.5rem;
    border-radius: var(--border-radius);
    background: #000;
    overflow-x: auto;
  }
  canvas {
    display: block;
    max-width: 100%;
    height: auto;
  }
  .info {
    margin: 0.375rem 0 0;
    font-size: 0.625rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  .footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
  }
</style>
