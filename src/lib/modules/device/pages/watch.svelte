<script lang="ts">
  import { Button } from "$lib/shared/components/button";
  import { Card } from "$lib/shared/components/card";
  import { Badge } from "$lib/shared/components/badge";
  import { Icon } from "$lib/shared/components/icon";
  import { bleModel } from "../model";
  import { dialName, dialGroup } from "../lib/catalog-names";

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

<svelte:head><title>Watch — FMC Watchfaces</title></svelte:head>

<div class="page">
  <!-- ponytail: don't gate on navigator.bluetooth at render time — the Safari polyfill injects later; the real check is in ble.ts on click -->
  {#if !$bleInfo}
    <Card>
      <div class="content">
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
            <Button kind="ghost" size="sm" onClick={() => forgetRequested()} disabled={$forgetting}>
              <Icon name="eraser" size={16} />
              {$forgetting ? "Forgetting…" : "Forget device"}
            </Button>
          </span>
          {#if $bleStatus}<span class="status">{$bleStatus}</span>{/if}
        </div>
      </div>
    </Card>
  {:else}
    <Card>
      <div class="content">
        <div class="header">
          <h2 class="title">CMF Watch Pro 2</h2>
          <p class="desc">{$bleStatus}</p>
        </div>
        <div class="info">
          <p>
            <Icon name="battery-full" size={16} color="var(--color-accent)" /> Battery: {$bleInfo.battery ??
              "?"}%
          </p>
          <p><Icon name="cpu" size={16} color={muted} /> Firmware: {$bleInfo.firmware ?? "?"}</p>
          <p><Icon name="hash" size={16} color={muted} /> Serial: {$bleInfo.serial ?? "?"}</p>
        </div>
      </div>
    </Card>

    {#if $dials}
      <Card>
        <div class="content">
          <div class="header">
            <h2 class="title">Watchfaces on the watch</h2>
            <p class="desc">
              Reported by the watch; side-loaded dials are not listed by the firmware.
            </p>
          </div>
          <div class="dials">
            <div>
              <p class="group-label">Built-in ({$dials.builtin.length})</p>
              <div class="badges">
                {#each $dials.builtin as id (id)}
                  <span title={dialGroup(id)}><Badge>{dialName(id)}</Badge></span>
                {/each}
              </div>
            </div>
            <div>
              <p class="group-label">Downloaded ({$dials.gallery.length})</p>
              <div class="badges">
                {#each $dials.gallery as id (id)}
                  <span title={dialGroup(id)}><Badge>{dialName(id)}</Badge></span>
                {:else}
                  <span class="none">none</span>
                {/each}
              </div>
            </div>
          </div>
        </div>
      </Card>
    {/if}
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 28rem;
    height: 100%;
    overflow-y: auto;
    padding: 16px;

    @media (min-width: 768px) {
      padding: 24px;
    }
  }
  .content {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .header {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }
  .desc {
    margin: 0;
    font-size: 0.875rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }
  .status {
    font-size: 0.75rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  .info {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 0.875rem;

    p {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
    }
  }
  .dials {
    display: flex;
    flex-direction: column;
    gap: 16px;
    font-size: 0.875rem;
  }
  .group-label {
    margin: 0 0 8px;
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .none {
    font-size: 0.75rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
</style>
