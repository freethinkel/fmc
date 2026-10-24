<script lang="ts">
  // The watch panel: connect, what the watch reports about itself, and what is installed on it.
  // The shell is adaptive — a drawer beside the rail on desktop, the swipeable sheet on the
  // phone — since it is the same panel either way.
  import type { Snippet } from "svelte";
  import { AdaptivePopover } from "$lib/shared/components/adaptive-popover";
  import { Button } from "$lib/shared/components/button";
  import { Icon } from "$lib/shared/components/icon";
  import { bleModel } from "../model";
  import { dialLabel, dialPreview, dialTitle, flashedOn } from "../lib/catalog-names";
  import { capacityOf } from "../lib/ble";
  import WatchSelector from "./watch-selector.svelte";

  interface Props {
    trigger: Snippet<[{ open: boolean; toggle: () => void; connected: boolean }]>;
  }
  const { trigger }: Props = $props();

  let open = $state(false);
  // The drawer light-dismisses on pointerdown; without this guard the click that follows
  // would toggle it straight back open, so a toggle right after a close means "close".
  let closedAt = 0;

  function toggle() {
    if (open) open = false;
    else if (Date.now() - closedAt > 250) open = true;
  }
  function onClose() {
    open = false;
    closedAt = Date.now();
  }

  const {
    $bleStatus: bleStatus,
    $bleInfo: bleInfo,
    $dials: dials,
    connectRequested,
    forgetRequested,
    dialRemoved,
    $connecting: connecting,
    $forgetting: forgetting,
  } = bleModel;

  const muted = "oklch(from var(--color-text) l c h / 55%)";
</script>

{@render trigger({ open, toggle, connected: !!$bleInfo })}

<AdaptivePopover
  {open}
  title={$bleInfo ? ($bleInfo.name ?? "CMF Watch") : "Connect your watch"}
  {onClose}
>
  <!-- ponytail: don't gate on navigator.bluetooth at render time — the Safari polyfill injects later; the real check is in ble.ts on click -->
  {#if !$bleInfo}
    <div class="section">
      <p class="desc">CMF Watch Pro 2 / Pro 3 over Web Bluetooth.</p>
      <div class="row">
        <Button onClick={() => connectRequested()} disabled={$connecting}>
          <Icon name="bluetooth" size={22} />
          {$connecting ? "Connecting…" : "Connect"}
        </Button>
        <span
          title="Clear Chrome's device permission and the saved auth key — does not affect pairing state on the watch itself"
        >
          <Button kind="ghost" onClick={() => forgetRequested()} disabled={$forgetting}>
            <Icon name="ink_eraser" size={22} />
            {$forgetting ? "Forgetting…" : "Forget device"}
          </Button>
        </span>
        {#if $bleStatus}<span class="status">{$bleStatus}</span>{/if}
      </div>
      <!-- the honest version of "is this safe?", said here rather than left to a launch thread -->
      <details class="before">
        <summary>Before you connect</summary>
        <ul>
          <li>
            The watch talks to one app at a time. Close Nothing X before you connect, and close this
            tab when you're done.
          </li>
          <li>
            FMC can't write firmware. Watchfaces go through the watch's own installer, and the watch
            can refuse them.
          </li>
          <li>
            If Nothing X loses the watch afterwards, pair it again. Turn Bluetooth off and on,
            forget the watch, add it back.
          </li>
        </ul>
        <a href="/help" onclick={onClose}>Read the full notes</a>
      </details>
    </div>
  {:else}
    <div class="section">
      <p class="desc">{$bleStatus}</p>
      <div class="info">
        <p>
          <Icon name="battery_full" size={16} color="var(--color-accent)" />
          Battery: {$bleInfo.battery ?? "?"}%
        </p>
        <p>
          <Icon name="memory" size={16} color={muted} /> Firmware: {$bleInfo.firmware ?? "?"}
        </p>
        <p>
          <Icon name="tag" size={16} color={muted} /> Serial: {$bleInfo.serial ?? "?"}
        </p>
      </div>
    </div>

    {#if $dials}
      <div class="section">
        <h2 class="title">
          Watchfaces on the watch ({$dials.length}/{capacityOf($bleInfo.name)})
        </h2>
        <div class="badges">
          {#each $dials as id, i (id)}
            <WatchSelector
              name={dialLabel(id, i)}
              preview={dialPreview(id)}
              title={dialTitle(id)}
              onRemove={$bleInfo.serial && flashedOn($bleInfo.serial).includes(id)
                ? () => dialRemoved(id)
                : undefined}
            />
          {:else}
            <span class="none">the watch reported none</span>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</AdaptivePopover>

<style>
  .section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;

    & + .section {
      margin-top: 1.25rem;
    }
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
  .before {
    font-size: 0.75rem;
    color: oklch(from var(--color-text) l c h / 55%);

    summary {
      cursor: pointer;
      color: var(--color-text);
    }
    ul {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin: 0.625rem 0;
      padding-left: 1.125rem;
      line-height: 1.5;
    }
    a {
      color: var(--color-accent);
    }
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
    /* six 64px dials never fit the sheet's width — scroll them sideways rather than wrap */
    overflow-x: auto;
    padding-bottom: 0.25rem;
  }
  .none {
    font-size: 0.625rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
</style>
