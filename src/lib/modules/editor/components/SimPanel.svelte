<script lang="ts">
  import { Input } from "$lib/shared/components/input";
  import { Switch } from "$lib/shared/components/switch";
  import { Icon } from "$lib/shared/components/icon";
  import { ACCENT_PALETTE, pickerLabel } from "../core/document/sources";
  import { editorModel } from "../model";
  const { $sim: sim, $ids: ids, simPatched, overrideSet } = editorModel;

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
    <Switch checked={$sim.live} onChange={(v) => simPatched({ live: v })} />
    <button type="button" class="check-label" onclick={() => simPatched({ live: !$sim.live })}
      >live time</button
    >
  </div>
  {#if !$sim.live}
    <Input
      type="datetime-local"
      step={1}
      value={localISO($sim.time)}
      onInput={(v) => simPatched({ time: new Date(v).getTime() })}
    />
  {/if}
  <div class="switch-row">
    <Switch checked={$sim.is24h} onChange={(v) => simPatched({ is24h: v })} />
    <button type="button" class="check-label" onclick={() => simPatched({ is24h: !$sim.is24h })}
      >24-hour format</button
    >
  </div>
  <div class="switch-row">
    <Switch
      checked={$sim.showSlotPlaceholders}
      onChange={(v) => simPatched({ showSlotPlaceholders: v })}
    />
    <button
      type="button"
      class="check-label"
      onclick={() => simPatched({ showSlotPlaceholders: !$sim.showSlotPlaceholders })}
      >widget-slot placeholders</button
    >
  </div>
  <div>
    <span class="muted-label">Accent color</span>
    <!-- the watch offers a fixed set, so this mirrors it rather than opening a color wheel;
         recolors widgets flagged via meta[7]===4, see metaInfo in lib/sources.ts -->
    <div class="accent-row">
      <button
        type="button"
        class="swatch none"
        class:on={!$sim.accentColor}
        title="No accent — draw the colors baked into the file"
        aria-label="No accent"
        onclick={() => simPatched({ accentColor: null })}
      >
        <Icon name="x" size={12} />
      </button>
      {#each ACCENT_PALETTE as c}
        <button
          type="button"
          class="swatch"
          class:on={$sim.accentColor === c}
          style="background: {c}"
          title={c}
          aria-label={c}
          onclick={() => simPatched({ accentColor: c })}
        ></button>
      {/each}
    </div>
  </div>
  <div class="fields-grid">
    {#each fields as [key, label, hint]}
      <div>
        <span class="muted-label" title={hint}>{label}</span>
        <Input
          type="number"
          value={String($sim[key])}
          onInput={(v) => simPatched({ [key]: v === "" ? "" : +v })}
        />
      </div>
    {/each}
  </div>

  {#if $ids.length}
    <h3 class="section-heading">Data sources</h3>
    <div class="ids-list">
      {#each $ids as { id, max }}
        <div class="id-row">
          <span class="id-label">{pickerLabel(id)}</span>
          <span class="id-input">
            <Input
              type="number"
              placeholder="auto"
              value={String($sim.overrides[id] ?? "")}
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
  /* one row, scrolled — wrapping left a lone swatch stranded on a second line */
  .accent-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    overflow-x: auto;
    /* room for the selected swatch's outline, which sits outside its box */
    padding: 0.25rem;
    margin: -0.25rem;
    scrollbar-width: thin;
  }
  .swatch {
    flex-shrink: 0;
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    border: 1px solid oklch(from var(--color-text) l c h / 12%);
    border-radius: 50%;
    cursor: pointer;
    /* the ring sits outside the circle, so picking one doesn't nudge the row */
    outline: 2px solid transparent;
    outline-offset: 2px;
    transition: outline-color 0.15s ease;

    &.on {
      outline-color: var(--color-text);
    }
  }
  .none {
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    color: oklch(from var(--color-text) l c h / 55%);
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
