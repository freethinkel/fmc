<script lang="ts">
  import { Button } from "$lib/shared/components/button";
  import { Icon } from "$lib/shared/components/icon";
  import { Input } from "$lib/shared/components/input";
  import { Select } from "$lib/shared/components/select";
  import { Checkbox } from "$lib/shared/components/checkbox";
  import {
    framesOf,
    isAccent,
    isPlaced,
    type CondOp,
    type Condition,
    type Layer,
  } from "../../core/document/doc";
  import {
    collectSlotsDoc,
    describeConditions,
    pickerLabel,
    FRAME_LABELS,
    ID_LABELS,
  } from "../../core/document/sources";
  import { slotBindingOf } from "../../core/document/edits";
  import { SLOT_METRIC_CHOICES } from "../../core/document/factory";
  import { editorModel } from "../../model";
  import { num, set } from "./patch";
  import FrameThumb from "./frame-thumb.svelte";

  const { layer }: { layer: Layer } = $props();
  const {
    $doc: doc,
    $cache: cache,
    $screen: screen,
    conditionToggled,
    sourceIdSet,
    slotBindSet,
    slotMetricAdded,
    slotMetricRemoved,
  } = editorModel;

  // A fresh layer object arrives on every edit, so these are plain deriveds.
  const placed = $derived(isPlaced(layer) ? layer : null);
  const meta = $derived(placed?.meta ?? null);
  const images = $derived(framesOf(layer));
  const num_ = $derived(layer.kind === "number" ? layer : null);
  const slot = $derived(layer.kind === "slot" ? layer : null);
  // what this slot could still offer — the corpus's full menu minus what it already has
  const addable = $derived(
    slot ? SLOT_METRIC_CHOICES.filter((m) => !slot.metrics.includes(m)) : [],
  );
  const ring = $derived(layer.kind === "ring" ? layer : null);
  const conditions = $derived(layer.conditions);
  const bindLines = $derived(describeConditions(conditions));
  const frameLabels = $derived(meta ? FRAME_LABELS[meta.source] : null);

  // meta.source is the data the widget reads — what the watch feeds it. A select over the known
  // sources (an id we have no label for stays selectable, so an unknown one isn't silently
  // rewritten); the model also resizes the frame set for value-indexed sources, see sourceIdFx.
  const setSourceId = (source: number) => sourceIdSet({ id: layer.id, source });
  const sourceOption = (id: number) => ({ value: String(id), label: pickerLabel(id) });
  const sourceOptions = $derived(
    Object.keys(ID_LABELS)
      .map((id) => sourceOption(Number(id)))
      .concat(meta && !ID_LABELS[meta.source] ? [sourceOption(meta.source)] : []),
  );

  // meta.flags === 4 marks this widget's assets accent-tintable on the real device — see
  // docs/cmf-protocol.md "Accent color". Every non-transparent pixel gets swapped, regardless of
  // its baked color, so this works on any art.
  const setAccent = (on: boolean) =>
    meta && set(layer.id, { meta: { ...meta, flags: on ? 4 : 0 } } as Partial<Layer>);

  const setFmt = (digits: number, padZero: boolean) =>
    set(layer.id, { digits: digits & 0x1f, padZero } as Partial<Layer>);

  // Second-source smoothness, device-verified the hard way (Wavy Seconds experiments):
  // HANDS on 0x0f/0x12 sweep smoothly; hands on 0x71/0x72 tick once per second (Sundial);
  // rings/everything else tick at 1 Hz on every id, and 0x71/0x72 on a ring freezes it into a
  // static bitmap. So: hands get a smooth(0x12)/ticking(0x72) toggle; rings only get a rescue
  // button back to their native 0x0f if left on a broken smooth-era id.
  const SECOND_IDS = [0x0f, 0x12, 0x72];
  const isSmooth = $derived(meta?.source === 0x0f || meta?.source === 0x12);
  const isSecondHand = $derived(
    layer.kind === "hand" && meta != null && SECOND_IDS.includes(meta.source),
  );
  const isBrokenRing = $derived(
    layer.kind === "ring" && meta != null && [0x71, 0x72].includes(meta.source),
  );

  // A widget slot's own body only records which metric is selected; what actually appears on the
  // watch is whichever sibling layer carries the matching condition. So the link is offered from
  // THIS side — pick the slot metric this layer stands for — rather than from the slot.
  const slots = $derived(
    collectSlotsDoc($doc?.screens.find((s) => s.kind === $screen)?.layers ?? []),
  );
  const slotBindOptions = $derived([
    { value: "", label: "always (not slot-bound)" },
    ...slots.flatMap((s) =>
      s.ids.map((id, i) => ({
        value: `${s.index}:${i}`,
        label: `slot ${s.index} — ${pickerLabel(id)}`,
      })),
    ),
  ]);
  const slotBindValue = $derived.by(() => {
    const b = slotBindingOf(layer);

    return b ? `${b.slot}:${b.metric}` : "";
  });
  // binding the slot's own layer to itself is meaningless
  const showSlotBind = $derived(slots.length > 0 && layer.kind !== "slot");

  // Conditions are decoded on the layer now, so they are edited per entry rather than as a hex
  // blob. ponytail: no reordering — equality lines OR together and the rest must all hold, so
  // order carries no meaning.
  const OPS: { value: CondOp; label: string }[] = [
    { value: "eq", label: "= (show if)" },
    { value: "ne", label: "≠ (hide if)" },
    { value: "gte", label: "≥ (only if)" },
    { value: "lte", label: "≤ (only if)" },
    { value: "noData", label: "= no-data marker" },
  ];

  const setCondition = (i: number, patch: Partial<Condition>) =>
    set(layer.id, {
      conditions: conditions.map((c, j) => (i === j ? { ...c, ...patch } : c)),
    } as Partial<Layer>);
  const dropCondition = (i: number) =>
    set(layer.id, { conditions: conditions.filter((_, j) => j !== i) } as Partial<Layer>);
</script>

{#if meta}
  <div>
    <span class="muted-label">source</span>
    <Select value={String(meta.source)} options={sourceOptions} onChange={(v) => setSourceId(+v)} />
    {#if frameLabels && images.length && images.length !== frameLabels.length}
      <p class="hint-xs">
        {ID_LABELS[meta.source]} needs {frameLabels.length} frames, this widget has {images.length}
      </p>
    {/if}
    {#if ring}
      <p class="hint-xs">
        gauge {ring.spec.min}–{ring.spec.max}, sweep {ring.spec.start}° → {ring.spec.end}°,
        {ring.spec.width}px stroke{ring.spec.radius ? `, radius ${ring.spec.radius}` : ""}
      </p>
    {/if}
  </div>
  <div class="check-row">
    <Checkbox checked={isAccent(meta)} onChange={(v) => setAccent(v)} />
    <button type="button" class="check-label" onclick={() => setAccent(!isAccent(meta))}
      >tints with device accent color</button
    >
  </div>
{/if}
{#if isSecondHand}
  <div class="check-row">
    <Checkbox checked={isSmooth} onChange={(v) => setSourceId(v ? 0x12 : 0x72)} />
    <button type="button" class="check-label" onclick={() => setSourceId(isSmooth ? 0x72 : 0x12)}>
      smooth sweep (unchecked — ticks once per second)
    </button>
  </div>
{/if}
{#if isBrokenRing}
  <div>
    <p class="hint-xs">this source freezes a ring on the watch — it only animates a hand</p>
    <div class="row">
      <Button kind="secondary" onClick={() => setSourceId(0x0f)}>
        <Icon name="undo" size={14} /> use the ticking second
      </Button>
    </div>
  </div>
{/if}
{#if num_}
  <div class="row">
    <span class="grow">
      <Input
        label="digits"
        type="number"
        min={0}
        max={31}
        value={String(num_.digits)}
        onInput={(v) => setFmt(num(v), num_.padZero)}
      />
    </span>
    <Checkbox checked={num_.padZero} onChange={(v) => setFmt(num_.digits, v)} />
    <button type="button" class="check-label" onclick={() => setFmt(num_.digits, !num_.padZero)}
      >leading zeros</button
    >
  </div>
{/if}
{#if slot}
  <div>
    <span class="muted-label">slot metrics</span>
    <!-- the menu the companion app shows for this slot; the wearer picks one of these on the
         watch, and a sibling layer bound to it (see "widget slot binding") is what draws -->
    {#each slot.metrics as m, i (m)}
      <div class="row">
        <!-- frames[0] is the on-watch placeholder, so metric i wears frames[i + 1]. Same
             component as the frame list: click to replace the art, hover to download it. -->
        <FrameThumb id={slot.frames[i + 1]} size={2} />
        <span class="field-label grow">{pickerLabel(m)}</span>
        <button
          type="button"
          class="icon-btn"
          title="Remove this metric"
          disabled={slot.metrics.length < 2}
          onclick={() => slotMetricRemoved({ id: layer.id, metric: m })}
        >
          <Icon name="x" size={14} />
        </button>
      </div>
    {/each}
    {#if addable.length}
      <Select
        value=""
        options={[
          { value: "", label: "add a metric…" },
          ...addable.map((m) => ({ value: String(m), label: pickerLabel(m) })),
        ]}
        onChange={(v) => v && slotMetricAdded({ id: layer.id, metric: Number(v) })}
      />
    {/if}
    <p class="hint-xs">each metric gets a blank icon for the app's picker — drop art on it below</p>
  </div>
{/if}
{#if showSlotBind}
  <div>
    <span class="muted-label">widget slot binding</span>
    <Select
      value={slotBindValue}
      options={slotBindOptions}
      onChange={(v) => {
        const [slot, metric] = v ? v.split(":").map(Number) : [null, 0];

        slotBindSet({ id: layer.id, slot, metric });
      }}
    />
    <p class="hint-xs">shows this layer only while that slot is set to that metric</p>
  </div>
{/if}
{#if conditions.length}
  <div>
    <span class="muted-label">conditions</span>
    {#each conditions as c, i (i)}
      <div class="row">
        <Select
          value={String(c.source)}
          options={sourceOptions.concat(
            ID_LABELS[c.source] ? [] : [{ value: String(c.source), label: pickerLabel(c.source) }],
          )}
          onChange={(v) => setCondition(i, { source: +v })}
        />
        <Select value={c.op} options={OPS} onChange={(v) => setCondition(i, { op: v as CondOp })} />
        <span class="w-num">
          <Input
            type="number"
            value={String(c.value)}
            onInput={(v) => setCondition(i, { value: num(v) })}
          />
        </span>
        <button
          type="button"
          title="Remove condition"
          class="icon-btn"
          onclick={() => dropCondition(i)}
        >
          <Icon name="trash" size={14} />
        </button>
      </div>
      <p class="hint-xs">{bindLines[i]}</p>
    {/each}
    {#if conditions.length > 1}
      <p class="hint-xs">"show if" lines are OR-ed, "only if"/"hide if" must all hold</p>
    {/if}
  </div>
{:else if layer.kind !== "raw"}
  <div class="row">
    <Button kind="secondary" onClick={() => conditionToggled(layer.id)}>
      <Icon name="git-branch" size={14} /> add condition
    </Button>
  </div>
{/if}
