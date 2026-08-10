<script lang="ts">
  import { Input } from "$lib/shared/components/input";
  import { Switch } from "$lib/shared/components/switch";
  import { Icon } from "$lib/shared/components/icon";
  import {
    ACCENT_PALETTE,
    ID_METRIC,
    METRIC_GOAL,
    pickerLabel,
    type SimMetric,
  } from "../core/document/sources";
  import { editorModel } from "../model";
  const { $sim: sim, $ids: ids, simPatched, overrideSet } = editorModel;

  // One input per METRIC, not per id: the firmware answers eight different ids out of `steps`
  // alone, so a row each would be eight inputs for one number — and the last one typed would
  // silently win. Only the metrics this document actually reads are offered; the raw per-id
  // escape hatch is still there, below, for driving two widgets apart.
  const METRICS: [SimMetric, string, string][] = [
    ["steps", "Steps", "Steps goal"],
    ["hr", "Heart rate, bpm", ""],
    ["battery", "Battery, %", ""],
    ["calories", "Calories, kcal", "Calories goal, kcal"],
    ["distance", "Distance, m", ""],
    ["temp", "Temperature, °", ""],
    ["aqi", "AQI", ""],
    ["stands", "Stand hours", "Stand goal, hours"],
  ];

  const used = $derived(new Set($ids.map(({ id }) => ID_METRIC[id]).filter(Boolean)));
  const shown = $derived(METRICS.filter(([m]) => used.has(m)));
  const overrides = $derived(
    $ids.filter(({ id }) => $sim.overrides[id] !== undefined && $sim.overrides[id] !== "").length,
  );

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
  {#if shown.length}
    <div class="fields-grid">
      {#each shown as [key, label, goalLabel]}
        <div>
          <span class="muted-label">{label}</span>
          <Input
            type="number"
            value={String($sim[key])}
            onInput={(v) => simPatched({ [key]: v === "" ? "" : +v })}
          />
        </div>
        {#if goalLabel}
          {@const goal = METRIC_GOAL[key]!}
          <div>
            <span class="muted-label" title="what a percentage ring on this metric divides by"
              >{goalLabel}</span
            >
            <Input
              type="number"
              value={String($sim[goal])}
              onInput={(v) => simPatched({ [goal]: v === "" ? "" : +v })}
            />
          </div>
        {/if}
      {/each}
    </div>
  {/if}

  <!-- The escape hatch, folded away: every source the face reads, addressable one by one, for
       pinning a hand or driving two widgets on the same metric apart. A value here WINS over the
       field above (see idValue), so the count says how many are doing that. -->
  {#if $ids.length}
    <details class="raw">
      <summary>
        per-source overrides{overrides ? ` — ${overrides} set` : ""}
      </summary>
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
            <!-- meta.max: the widget's OWN declared maximum (a hand's 60 positions, a number's
                 digit cap), not the metric's range — it doesn't scale what you type here -->
            {#if max}<span
                class="max-hint"
                title="the widget's declared max, not this metric's range">max {max}</span
              >{/if}
          </div>
        {/each}
      </div>
    </details>
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
  .raw {
    summary {
      cursor: pointer;
      font-size: 0.625rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: oklch(from var(--color-text) l c h / 55%);
    }
    &[open] summary {
      margin-bottom: 0.5rem;
    }
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
    width: 7.5rem;
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
    white-space: nowrap;
    font-size: 0.625rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
</style>
