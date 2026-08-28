<script lang="ts">
  interface Props {
    value?: number;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    // suffix shown next to the value ("%", "px", …); omit to hide the readout
    unit?: string;
    // custom rail background (e.g. a hue gradient) — replaces the accent fill
    track?: string;
    onInput?: (value: number) => void;
    onChange?: (value: number) => void;
  }
  let {
    value = $bindable(0),
    min = 0,
    max = 100,
    step = 1,
    disabled,
    unit,
    track,
    onInput,
    onChange,
  }: Props = $props();
  // the filled part of the track — the native range gives no hook for it
  const pct = $derived(((value - min) / (max - min || 1)) * 100);
  const rail = $derived(
    track ??
      `linear-gradient(var(--color-accent), var(--color-accent)) 0 / ${pct}% 100% no-repeat,
       oklch(from var(--color-text) l c h / 14%)`,
  );
</script>

<span class="root" style="--rail: {rail}">
  <input
    type="range"
    bind:value
    {min}
    {max}
    {step}
    {disabled}
    oninput={() => onInput?.(value)}
    onchange={() => onChange?.(value)}
  />
  {#if unit != null}<span class="readout">{value}{unit}</span>{/if}
</span>

<style>
  .root {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 0.625rem;
    min-width: 0;
  }
  input {
    flex: 1;
    min-width: 0;
    height: 1.5rem;
    margin: 0;
    background: transparent;
    appearance: none;
    cursor: grab;

    &:active {
      cursor: grabbing;
    }
    &:disabled {
      opacity: 0.45;
      cursor: default;
    }
  }
  input::-webkit-slider-runnable-track,
  input::-moz-range-track {
    height: 0.3rem;
    border-radius: 999px;
    background: var(--rail);
  }
  input::-webkit-slider-thumb {
    appearance: none;
    width: 1.5rem;
    height: 1.5rem;
    margin-top: -8px; /* centres the thumb on the 4px track */
    border: none;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 4px oklch(from var(--color-background) l c h / 45%);
    transition: transform var(--spring-transition, 0.15s ease);
  }
  input::-moz-range-thumb {
    width: 1.125rem;
    height: 1.125rem;
    border: none;
    border-radius: 50%;
    background: var(--color-background);
    box-shadow: 0 1px 4px oklch(from var(--color-text) l c h / 45%);
    transition: transform var(--spring-transition, 0.15s ease);
  }
  input:active::-webkit-slider-thumb {
    transform: scale(1.15);
  }
  input:active::-moz-range-thumb {
    transform: scale(1.15);
  }
  @media (hover: hover) {
    input:hover::-webkit-slider-thumb {
      transform: scale(1.15);
    }
    input:hover::-moz-range-thumb {
      transform: scale(1.15);
    }
  }
  input:focus-visible {
    outline: none;
  }
  input:focus-visible::-webkit-slider-thumb {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  input:focus-visible::-moz-range-thumb {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .readout {
    flex-shrink: 0;
    width: 4.5ch;
    font-size: 0.8rem;
    text-align: end;
    color: oklch(from var(--color-text) l c h / 55%);
    font-variant-numeric: tabular-nums;
  }
</style>
