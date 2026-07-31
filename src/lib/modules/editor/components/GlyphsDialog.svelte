<script lang="ts">
  // The generator's dialog. Every setting, the font list and the preview strip live in
  // font-sprite.model — this only renders them and fires events.
  import { Dialog } from "$lib/shared/components/dialog";
  import { Button } from "$lib/shared/components/button";
  import { Field } from "$lib/shared/components/field";
  import { Input } from "$lib/shared/components/input";
  import { Select } from "$lib/shared/components/select";
  import { Checkbox } from "$lib/shared/components/checkbox";
  import { Icon } from "$lib/shared/components/icon";
  import { editorModel } from "../model";
  import { labelsOf, WEIGHTS } from "../model/font-sprite.model";

  const {
    $glyphDialog: target,
    $glyphForm: form,
    $fontOptions: fontOptions,
    $glyphPreview: preview,
    $localFontsPending: localPending,
    glyphDialogClosed,
    glyphFormPatched,
    glyphsGenerateRequested,
    fontFilePicked,
    installedFontsRequested,
  } = editorModel;

  let fileEl = $state<HTMLInputElement>();
  let canvasEl = $state<HTMLCanvasElement>();

  const clamp = (v: string, lo: number, hi: number, fallback: number) =>
    Math.min(hi, Math.max(lo, Math.round(Number(v)) || fallback));

  // the sprites are already rasterized — this only lays them out side by side
  $effect(() => {
    const strip = $preview;

    if (!canvasEl || !strip) return;
    const cx = canvasEl.getContext("2d")!;

    canvasEl.width = strip.w * strip.bitmaps.length;
    canvasEl.height = strip.h;
    strip.bitmaps.forEach((b, i) => cx.drawImage(b, i * strip.w, 0));
  });

  function pickFile(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    const file = el.files?.[0];

    el.value = ""; // so picking the same file again still fires a change
    if (file) fontFilePicked(file);
  }
</script>

<Dialog open={Boolean($target)} title="Sprites from a font" onClose={() => glyphDialogClosed()}>
  <div class="fields">
    <Field label="Font">
      <div class="row">
        <Select
          value={$form.family}
          options={$fontOptions}
          onChange={(family) => glyphFormPatched({ family })}
        />
        <span class="tool" title="Upload a .ttf / .otf / .woff">
          <Button kind="secondary" onClick={() => fileEl?.click()}>
            <Icon name="upload" size={14} />
          </Button>
        </span>
        <span class="tool" title="Pick from the fonts installed on this machine">
          <Button
            kind="secondary"
            disabled={$localPending}
            onClick={() => installedFontsRequested()}
          >
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
          value={String($form.sizePx)}
          onInput={(v) => glyphFormPatched({ sizePx: clamp(v, 4, 400, 4) })}
        />
      </Field>
      <Field label="Weight">
        <Select
          value={String($form.weight)}
          options={WEIGHTS.map((w) => ({ value: String(w), label: String(w) }))}
          onChange={(v) => glyphFormPatched({ weight: +v })}
        />
      </Field>
      <Field label="Spacing">
        <Input
          type="number"
          min={-20}
          max={80}
          value={String($form.spacing)}
          onInput={(v) => glyphFormPatched({ spacing: clamp(v, -20, 80, 0) })}
        />
      </Field>
    </div>
    <div class="grid">
      <Field label="Color">
        <div class="row">
          <input
            class="swatch"
            type="color"
            value={$form.color}
            aria-label="Glyph color"
            oninput={(e) => glyphFormPatched({ color: e.currentTarget.value })}
          />
          <Input
            value={$form.color}
            maxlength={7}
            onInput={(color) => glyphFormPatched({ color })}
          />
        </div>
      </Field>
      <Field label="Style">
        <label class="check">
          <Checkbox checked={$form.italic} onChange={(italic) => glyphFormPatched({ italic })} />
          italic
        </label>
      </Field>
    </div>
    <Field label="Characters" hint="space-separated — index = value, keep the watch's order">
      <Input value={$form.labelsText} onInput={(labelsText) => glyphFormPatched({ labelsText })} />
    </Field>
  </div>

  <div class="preview">
    <canvas bind:this={canvasEl}></canvas>
  </div>
  <p class="info">
    {#if $preview}
      {$preview.bitmaps.length} sprites · {$preview.w}×{$preview.h} px ·
      {($preview.bytes / 1024).toFixed(1)} KB in the file
    {/if}
  </p>

  <div class="footer">
    <Button kind="ghost" onClick={() => glyphDialogClosed()}>Cancel</Button>
    <Button
      kind="primary"
      disabled={!labelsOf($form).length}
      onClick={() => glyphsGenerateRequested()}
    >
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
