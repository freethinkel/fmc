<script lang="ts">
  import { Button } from "$lib/shared/components/button";
  import { Icon } from "$lib/shared/components/icon";
  import { Input } from "$lib/shared/components/input";
  import { Select } from "$lib/shared/components/select";
  import { Checkbox } from "$lib/shared/components/checkbox";
  import { hex, unhex, TAG, type FaceNode } from "../../lib/wf";
  import { parseArcSpec } from "../../lib/arc";
  import {
    collectSlots,
    describeBind,
    isSlotSel,
    metaInfo,
    parseBind,
    pickerLabel,
    FRAME_LABELS,
    ID_LABELS,
    SLOT_SEL_ID,
  } from "../../lib/sources";
  import { structOf } from "../../lib/tree";
  import { editorModel } from "../../model";
  import { num, set } from "./patch";

  const { node }: { node: FaceNode } = $props();
  const { $editor: editor, toggleCondition, sourceIdSet, setSlotBind } = editorModel;

  const st = $derived(structOf(node));
  const fmtNode = $derived(node.subs?.find((s) => s.tag === TAG.fmt));
  const bindNode = $derived(node.subs?.find((s) => s.tag === TAG.bind));
  // see the snapshot note in geometry.svelte — displayed values must depend on $editor
  const meta = $derived.by(() => {
    void $editor;
    return st?.meta ? metaInfo(st) : null;
  });
  const images = $derived.by(() => {
    void $editor;
    return st?.images;
  });
  const fmtByte = $derived.by(() => {
    void $editor;
    return fmtNode ? unhex(fmtNode.hex || "")[0] || 0 : 0;
  });
  const bindHex = $derived.by(() => {
    void $editor;
    return bindNode?.hex;
  });
  const bindLines = $derived(describeBind(bindHex));
  const frameLabels = $derived(meta ? FRAME_LABELS[meta.id] : null);
  // 0x5a/0x5b arc spec of a progress ring, in words (min..max, sweep in degrees, stroke px)
  const arc = $derived.by(() => {
    void $editor;
    return node.tag === 0x80 || node.tag === 0x81 ? parseArcSpec(node) : null;
  });

  // meta byte 9 is the data source the widget reads — what the watch feeds it. A select over the
  // known sources (an id we have no label for stays selectable, so an unknown one isn't silently
  // rewritten); the model also resizes the frame set for value-indexed sources, see sourceIdFx.
  const setSourceId = (id: number) => sourceIdSet({ node, id });
  const sourceOption = (id: number) => ({ value: String(id), label: pickerLabel(id) });
  const sourceOptions = $derived(
    Object.keys(ID_LABELS)
      .map((id) => sourceOption(Number(id)))
      .concat(meta && !ID_LABELS[meta.id] ? [sourceOption(meta.id)] : []),
  );

  // meta[7] === 4 marks this widget's resource(s) accent-tintable on the real device — see
  // docs/cmf-protocol.md "Accent color". Every non-transparent pixel gets swapped, regardless
  // of its baked color, so this works on any art (white, colored, whatever).
  function setAccent(on: boolean) {
    if (!st) return;
    const v = unhex(st.meta || "");

    v[7] = on ? 4 : 0;
    set(st, { meta: hex(v) });
  }

  function setFmt(digits: number, pad: number | boolean) {
    if (!fmtNode) return;
    set(fmtNode, { hex: hex(new Uint8Array([(digits & 0x1f) | (pad ? 0x80 : 0)])) });
  }

  // Second-source smoothness, device-verified the hard way (Wavy Seconds experiments):
  // HANDS on 0x0f/0x12 sweep smoothly; hands on 0x71/0x72 tick once per second (Sundial);
  // rings/everything else tick at 1 Hz on every id, and 0x71/0x72 on a ring freezes it
  // into a static bitmap. So: hands get a smooth(0x12)/ticking(0x72) toggle; rings only
  // get a rescue button back to their native 0x0f if left on a broken smooth-era id.
  // 0x71 dropped from the list: it's the minute-hand angle, not a second source (see ID_LABELS)
  const SECOND_IDS = [0x0f, 0x12, 0x72];
  const isSmooth = $derived(meta?.id === 0x0f || meta?.id === 0x12);
  const isSecondHand = $derived(
    node.tag === TAG.hand && meta != null && SECOND_IDS.includes(meta.id),
  );
  const isBrokenRing = $derived(
    [0x80, 0x81].includes(node.tag) && meta != null && [0x71, 0x72].includes(meta.id),
  );

  // A widget slot's own 0x5f only records which metric is selected; what actually appears on the
  // watch is whichever sibling layer carries the matching condition. So the link is offered from
  // THIS side — pick the slot metric this layer stands for — rather than from the slot.
  const slots = $derived.by(() => {
    void $editor;
    const face = $editor.face;

    return face ? collectSlots(face.screens.filter((s) => s.tag === $editor.screenTag)) : [];
  });
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
    void $editor;
    const e = parseBind(bindNode?.hex).find((x) => isSlotSel(x.id));

    return e ? `${e.id - SLOT_SEL_ID}:${e.val}` : "";
  });
  // the slot's own node is what the wearer points at — binding it to itself is meaningless
  const showSlotBind = $derived(slots.length > 0 && Boolean(node.subs) && node.tag !== 0x85);
</script>

{#if st?.meta}
  <div>
    <span class="muted-label">source</span>
    <Select
      value={String(meta?.id ?? 0)}
      options={sourceOptions}
      onChange={(v) => setSourceId(+v)}
    />
    {#if frameLabels && images && images.length !== frameLabels.length}
      <p class="hint-xs">
        {ID_LABELS[meta!.id]} needs {frameLabels.length} frames, this widget has {images.length}
      </p>
    {/if}
    {#if arc}
      <p class="hint-xs">
        gauge {arc.min}–{arc.max}, sweep {arc.start}° → {arc.end}°, {arc.width}px stroke{arc.radius
          ? `, radius ${arc.radius}`
          : ""}
      </p>
    {/if}
  </div>
  <div class="check-row">
    <Checkbox checked={!!meta?.accent} onChange={(v) => setAccent(v)} />
    <button type="button" class="check-label" onclick={() => setAccent(!meta?.accent)}
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
{#if fmtNode}
  <div class="row">
    <span class="field-label">digits</span>
    <span class="w-num">
      <Input
        type="number"
        min={0}
        max={31}
        value={String(fmtByte & 0x1f)}
        onInput={(v) => setFmt(num(v), fmtByte & 0x80)}
      />
    </span>
    <Checkbox checked={!!(fmtByte & 0x80)} onChange={(v) => setFmt(fmtByte & 0x1f, v)} />
    <button
      type="button"
      class="check-label"
      onclick={() => setFmt(fmtByte & 0x1f, !(fmtByte & 0x80))}>leading zeros</button
    >
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

        setSlotBind(node, slot, metric);
      }}
    />
    <p class="hint-xs">shows this layer only while that slot is set to that metric</p>
  </div>
{/if}
{#if bindNode}
  <div>
    <span class="muted-label">condition</span>
    {#each bindLines as line}
      <p class="hint-xs">{line}</p>
    {/each}
    {#if bindLines.length > 1}
      <p class="hint-xs">"show if" lines are OR-ed, "only if"/"hide if" must all hold</p>
    {/if}
    <Input
      value={bindHex}
      onInput={(v) => {
        if (/^([0-9a-f]{2})*$/i.test(v)) set(bindNode, { hex: v });
      }}
    />
    <div class="row">
      <Button kind="danger" onClick={() => toggleCondition(node)}>
        <Icon name="trash" size={14} /> remove condition
      </Button>
    </div>
  </div>
{:else if node.subs && node.tag !== TAG.main && node.tag !== TAG.aod}
  <div class="row">
    <Button kind="secondary" onClick={() => toggleCondition(node)}>
      <Icon name="git-branch" size={14} /> add condition
    </Button>
  </div>
{/if}
