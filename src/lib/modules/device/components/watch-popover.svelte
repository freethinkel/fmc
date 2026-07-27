<script lang="ts">
  import type { Snippet } from "svelte";
  import { Button } from "$lib/shared/components/button";
  import { Icon } from "$lib/shared/components/icon";
  import { bleModel } from "../model";
  import { dialLabel, dialPreview, dialTitle } from "../lib/catalog-names";
  import { WF_CAPACITY } from "../lib/ble";
  import WatchSelector from "./watch-selector.svelte";

  interface Props {
    // like Menu's trigger, but the panel doesn't auto-close on inside clicks
    trigger: Snippet<
      [{ open: boolean; toggle: () => void; connected: boolean }]
    >;
    placement?: "bottom" | "top";
  }
  const { trigger, placement = "bottom" }: Props = $props();

  let open = $state(false);
  let root = $state<HTMLDivElement>();

  const {
    $bleStatus: bleStatus,
    $bleInfo: bleInfo,
    $dials: dials,
    connectRequested,
    forgetRequested,
    $connecting: connecting,
    $forgetting: forgetting,
  } = bleModel;

  const muted = "oklch(from var(--color-text) l c h / 55%)";
</script>

<svelte:window
  onpointerdown={(e) => {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }}
  onkeydown={(e) => {
    if (open && e.key === "Escape") open = false;
  }}
/>

<div class="root" bind:this={root}>
  {@render trigger({
    open,
    toggle: () => (open = !open),
    connected: !!$bleInfo,
  })}
  {#if open}
    <div class="popover placement__{placement}">
      <!-- ponytail: don't gate on navigator.bluetooth at render time — the Safari polyfill injects later; the real check is in ble.ts on click -->
      {#if !$bleInfo}
        <div class="section">
          <div class="header">
            <h2 class="title">Connect your watch</h2>
            <p class="desc">CMF Watch Pro 2 over Web Bluetooth.</p>
          </div>
          <div class="row">
            <Button onClick={() => connectRequested()} disabled={$connecting}>
              <Icon name="bluetooth" size={16} />
              {$connecting ? "Connecting…" : "Connect"}
            </Button>
            <span
              title="Clear Chrome's device permission and the saved auth key — does not affect pairing state on the watch itself"
            >
              <Button
                kind="ghost"
                onClick={() => forgetRequested()}
                disabled={$forgetting}
              >
                <Icon name="eraser" size={16} />
                {$forgetting ? "Forgetting…" : "Forget device"}
              </Button>
            </span>
            {#if $bleStatus}<span class="status">{$bleStatus}</span>{/if}
          </div>
        </div>
      {:else}
        <div class="section">
          <div class="header">
            <h2 class="title">CMF Watch Pro 2</h2>
            <p class="desc">{$bleStatus}</p>
          </div>
          <div class="info">
            <p>
              <Icon name="battery-full" size={16} color="var(--color-accent)" />
              Battery: {$bleInfo.battery ?? "?"}%
            </p>
            <p>
              <Icon name="cpu" size={16} color={muted} /> Firmware: {$bleInfo.firmware ??
                "?"}
            </p>
            <p>
              <Icon name="hash" size={16} color={muted} /> Serial: {$bleInfo.serial ??
                "?"}
            </p>
          </div>
        </div>

        {#if $dials}
          <div class="section">
            <div class="header">
              <h2 class="title">
                Watchfaces on the watch ({$dials.length}/{WF_CAPACITY})
              </h2>
            </div>
            <div class="badges">
              {#each $dials as id, i (id)}
                <WatchSelector
                  name={dialLabel(id, i)}
                  preview={dialPreview(id)}
                  title={dialTitle(id)}
                />
              {:else}
                <span class="none">the watch reported none</span>
              {/each}
            </div>
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .root {
    position: relative;
    display: flex;
  }
  .popover {
    position: absolute;
    z-index: 50;
    width: min(23.75rem, calc(100vw - 1.5rem));
    max-height: min(70vh, 30rem);
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    border-radius: var(--border-radius);
    background: var(--color-background);
    border: 1px solid oklch(from var(--color-text) l c h / 10%);
    box-shadow: 0 8px 24px oklch(0 0 0 / 12%);
  }
  .placement__bottom {
    top: calc(100% + 0.375rem);
    inset-inline-start: 0;
  }
  .placement__top {
    bottom: calc(100% + 0.375rem);
    inset-inline-end: 0.25rem;
  }
  .section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .header {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .title {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
  }
  .desc {
    margin: 0;
    font-size: 0.75rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
  }
  .status {
    font-size: 0.625rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  .info {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-size: 0.75rem;

    p {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin: 0;
    }
  }
  .badges {
    display: flex;
    gap: 0.75rem;
    /* six 64px dials never fit the 380px popover — scroll them sideways rather than wrap into
       a block that pushes the panel past its max-height */
    overflow-x: auto;
    padding-bottom: 0.25rem;
  }
  .none {
    font-size: 0.625rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
</style>
