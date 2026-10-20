<script lang="ts">
  // Linked from the troubleshooting page for a watch that boots to a black screen but still
  // advertises. The only action here is a factory reset, sent right after auth.
  import { Button } from "$lib/shared/components/button";
  import { rescueModel } from "../model";

  const {
    resetRequested,
    $status: status,
    $error: error,
    $done: done,
    $busy: busy,
    $log: log,
  } = rescueModel;
  const copy = () => navigator.clipboard.writeText($log.join("\n")).catch(() => {});
</script>

<svelte:head>
  <title>Rescue — FMC</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="page">
  <article>
    <h1>Rescue</h1>
    <p>
      For a watch that shows the CMF logo, goes black and stays there, but still shows up in the
      Bluetooth picker. This sends the watch a <strong>factory reset</strong> and nothing else: no file,
      no sync. Everything on the watch is wiped, including the face that broke it.
    </p>
    <p>
      Use the same browser you installed the face from — pairing needs a tap on the watch, and the
      key saved from that install is the only way around a screen that doesn't light up. Close
      Nothing X first so it isn't holding the watch.
    </p>
    <Button kind="danger" disabled={$busy} onClick={() => resetRequested()}>
      Factory reset the watch
    </Button>
    {#if $status}<p class="status">{$status}</p>{/if}
    {#if $error}<p class="error">{$error}</p>{/if}
    {#if $done}
      <p class="status">
        Sent. The watch should restart on its own within a minute. If it does, or if the step above
        is where it stopped, <a href="https://github.com/freethinkel/fmc/issues">tell us</a>
        — nobody has confirmed this path yet.
      </p>
    {/if}
    {#if $log.length}
      <p>
        Whatever happened, send us this log:
        <Button kind="secondary" size="small" onClick={copy}>Copy log</Button>
      </p>
      <pre>{$log.join("\n")}</pre>
    {/if}
    <a class="back" href="/help">Back to "Before you connect"</a>
  </article>
</div>

<style>
  .page {
    height: 100%;
    overflow-y: auto;
  }
  article {
    max-width: 44rem;
    margin: 0 auto;
    padding: 2rem 1rem 4rem;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }
  h1 {
    margin: 0;
    font-family: var(--font-display);
  }
  p {
    margin: 0;
    line-height: 1.5;
  }
  .status {
    color: oklch(from var(--color-text) l c h / 55%);
  }
  .error {
    color: var(--color-error);
  }
  pre {
    width: 100%;
    max-height: 20rem;
    overflow: auto;
    padding: 0.75rem;
    border-radius: var(--border-radius);
    background: oklch(from var(--color-text) l c h / 6%);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .back {
    color: var(--color-text);
  }
</style>
