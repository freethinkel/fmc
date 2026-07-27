<script lang="ts">
  import { Input } from "$lib/shared/components/input";
  import { Switch } from "$lib/shared/components/switch";
  import { Button } from "$lib/shared/components/button";
  import { sourceLabel } from "../lib/sources";
  import { editorModel } from "../model";
  const { $editor: editor, simPatched, overrideSet } = editorModel;

  // default for the baked-in sentinel color (see cmf-format-reference.md "Accent color
  // sentinel") — just shown in the picker until the user picks their own
  const ACCENT_DEFAULT = "#ff2c00";

  type NumField =
    | "steps"
    | "hr"
    | "battery"
    | "calories"
    | "distance"
    | "temp"
    | "aqi"
    | "stands"
    | "stepsGoal"
    | "calGoal"
    | "standsGoal";

  // label + the data-source ids the field feeds (see ID_LABELS/idValue in lib/sources.ts);
  // goal fields feed no id of their own, they're the denominator of the matching ring
  const fields: [NumField, string, string][] = [
    ["steps", "Steps", "0x19, 0x26, 0x49, 0x6a, 0x6c"],
    ["hr", "Heart rate, bpm", "0x1a"],
    ["battery", "Battery, %", "0x24, 0x30"],
    ["calories", "Calories, kcal", "0x1c, 0x1e"],
    ["distance", "Distance, m", "0x22, 0x23, 0x74, 0x75, 0x76"],
    ["temp", "Temperature, °", "0x36, 0x5f"],
    ["aqi", "AQI", "0x8b"],
    ["stands", "Stand hours", "0x48"],
    ["stepsGoal", "Steps goal", "ring denominator for steps"],
    ["calGoal", "Calories goal, kcal", "ring denominator for calories"],
    ["standsGoal", "Stand goal, hours", "ring denominator for stand hours"],
  ];

  function localISO(t: number) {
    return new Date(t - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19);
  }
</script>

<div class="panel">
  <div class="switch-row">
    <Switch checked={$editor.sim.live} onChange={(v) => simPatched({ live: v })} />
    <button
      type="button"
      class="check-label"
      onclick={() => simPatched({ live: !$editor.sim.live })}>live time</button
    >
  </div>
  {#if !$editor.sim.live}
    <Input
      type="datetime-local"
      step={1}
      value={localISO($editor.sim.time)}
      onInput={(v) => simPatched({ time: new Date(v).getTime() })}
    />
  {/if}
  <div class="switch-row">
    <Switch checked={$editor.sim.is24h} onChange={(v) => simPatched({ is24h: v })} />
    <button
      type="button"
      class="check-label"
      onclick={() => simPatched({ is24h: !$editor.sim.is24h })}>24-hour format</button
    >
  </div>
  <div class="switch-row">
    <Switch
      checked={$editor.sim.showSlotPlaceholders}
      onChange={(v) => simPatched({ showSlotPlaceholders: v })}
    />
    <button
      type="button"
      class="check-label"
      onclick={() => simPatched({ showSlotPlaceholders: !$editor.sim.showSlotPlaceholders })}
      >widget-slot placeholders</button
    >
  </div>
  <div>
    <span class="muted-label">Accent color</span>
    <div class="accent-row">
      <input
        type="color"
        class="swatch"
        value={$editor.sim.accentColor || ACCENT_DEFAULT}
        oninput={(e) => simPatched({ accentColor: e.currentTarget.value })}
        title="Watch accent color (recolors widgets flagged via meta[7]===4, see metaInfo in lib/sources.ts)"
      />
      {#if $editor.sim.accentColor}
        <Button kind="ghost" onClick={() => simPatched({ accentColor: null })}>Reset</Button>
      {/if}
    </div>
  </div>
  <div class="fields-grid">
    {#each fields as [key, label, hint]}
      <div>
        <span class="muted-label" title={hint}>{label}</span>
        <Input
          type="number"
          value={String($editor.sim[key])}
          onInput={(v) => simPatched({ [key]: v === "" ? "" : +v })}
        />
      </div>
    {/each}
  </div>

  {#if $editor.ids.length}
    <h3 class="section-heading">Data sources</h3>
    <div class="ids-list">
      {#each $editor.ids as { id, max }}
        <div class="id-row">
          <span class="id-label">0x{id.toString(16)} {sourceLabel(id)}</span>
          <span class="id-input">
            <Input
              type="number"
              placeholder="auto"
              value={String($editor.sim.overrides[id] ?? "")}
              onInput={(v) => overrideSet({ id, value: v })}
            />
          </span>
          {#if max}<span class="max-hint">/{max}</span>{/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    font-size: 0.75rem;
  }
  .switch-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .check-label {
    border: none;
    background: transparent;
    padding: 0;
    margin: 0;
    font: inherit;
    color: inherit;
    text-align: start;
    cursor: pointer;
  }
  .muted-label {
    display: block;
    margin-bottom: 0.25rem;
    font-size: 0.625rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  .accent-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .swatch {
    width: 3rem;
    height: 2rem;
    padding: 0.125rem;
    border: 1px solid oklch(from var(--color-text) l c h / 12%);
    border-radius: var(--border-radius);
    cursor: pointer;
    background: transparent;
  }
  .fields-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem 0.75rem;
  }
  .section-heading {
    margin: 0.25rem 0 0;
    font-size: 0.625rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  .ids-list {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
  .id-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .id-label {
    width: 9rem;
    flex-shrink: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-family: var(--font-mono);
    font-size: 0.625rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  .id-input {
    display: inline-block;
    width: 6rem;
    flex-shrink: 0;
  }
  .max-hint {
    font-size: 0.625rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
</style>
