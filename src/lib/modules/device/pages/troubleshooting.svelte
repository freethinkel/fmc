<script lang="ts">
  // The page the "Before you connect" note in the watch panel links to. Prose only: every claim
  // here is either checkable in device/lib (the protocol) or a report we can point at, and the
  // page deliberately stops short of "nothing can go wrong".
  import { Icon } from "$lib/shared/components/icon";
  import { WF_CAPACITY } from "../lib/ble";

  const ISSUES = "https://github.com/freethinkel/fmc/issues";
</script>

<svelte:head>
  <title>Before you connect — FMC</title>
  <meta
    name="description"
    content="What FMC does to your CMF watch, what it cannot do, and how to fix the Bluetooth conflict with the Nothing X app."
  />
</svelte:head>

<div class="page">
  <article>
    <header>
      <h1>Before you connect</h1>
      <p class="lead">
        FMC talks to your watch straight from the browser, with no phone app in between. Here is
        what that does and does not mean — and how to get out of the two problems people actually
        hit.
      </p>
    </header>

    <section>
      <h2>What FMC can and cannot do</h2>
      <ul>
        <li>
          <b>It cannot write firmware.</b> The protocol FMC speaks has exactly one firmware command
          and it is a read: it asks the watch which version it runs. There is no write counterpart
          in the code — see
          <a
            href="https://github.com/freethinkel/fmc/blob/main/src/lib/modules/device/lib/ble-protocol.ts"
          >
            <code>ble-protocol.ts</code></a
          >, where <code>fwGet</code>/<code>fwRet</code> are the whole firmware story.
        </li>
        <li>
          <b>It installs watchfaces through the watch's own installer.</b> Every byte goes through the
          same handshake the official app uses — start, describe the file, send it in chunks, finish.
          The watch acknowledges each step and is free to refuse the file; FMC already handles that refusal
          and tells you instead of retrying blindly.
        </li>
        <li>
          <b>So the worst case we know of is a bad watchface</b> — one the watch refuses, or one that
          installs and looks wrong. You delete it on the watch itself (below) and move on.
        </li>
        <li>
          <b>What we will not claim is that nothing can go wrong.</b> FMC is developed and tested
          against a CMF Watch Pro 2; firmware we have never seen can behave differently, and we
          would rather say so than promise you a guarantee we cannot check. If something does go
          wrong,
          <a href={ISSUES}>tell us</a> — the fix below exists because someone did.
        </li>
      </ul>
    </section>

    <section>
      <h2>Only one app can hold the watch at a time</h2>
      <p>
        The watch accepts a single Bluetooth connection. If Nothing X is connected — including in
        the background — FMC's <b>Connect</b> will sit there and eventually time out. Close Nothing X,
        or disconnect the watch inside it, before you connect here.
      </p>
      <p>
        The reverse is just as true: while an FMC tab holds the watch, Nothing X cannot have it.
        When you are done, close the tab or press <b>Forget device</b> in the watch panel. Two FMC tabs
        collide with each other in the same way.
      </p>
    </section>

    <section>
      <h2>Nothing X stopped seeing the watch after I used FMC</h2>
      <p>
        This is the one that looks like a brick and is not. It is a Bluetooth pairing conflict on
        the phone, and it clears with a re-pair:
      </p>
      <ol>
        <li>Close the FMC tab, so nothing is holding the watch.</li>
        <li>Turn the phone's Bluetooth off, wait a few seconds, turn it back on.</li>
        <li>In the phone's Bluetooth settings, forget the watch.</li>
        <li>Put the watch back into pairing mode and add it again in Nothing X.</li>
      </ol>
      <p class="note">
        Reported in
        <a href="https://github.com/freethinkel/fmc/issues/27">issue #27</a>, where another user
        answered with these steps within hours. It has not needed a factory reset.
      </p>
    </section>

    <section>
      <h2>Deleting a watchface on the watch itself</h2>
      <p>
        You do not need FMC or Nothing X for this. On the watch, long-press the face you are looking
        at until the carousel of installed faces appears, swipe to the one you want gone, and swipe
        up on it to remove it.
      </p>
      <p>
        The watch holds {WF_CAPACITY} watchfaces. When they are all taken, FMC asks you which one to overwrite
        rather than picking for you — the factory faces are as replaceable as the rest, and Nothing X
        can put them back.
      </p>
    </section>

    <section>
      <h2>When an upload is refused</h2>
      <p>
        A refusal is the installer doing its job. FMC surfaces what the watch said: the watch is
        full, the slot you picked is no longer installed, or it rejected the finished file.
        Reconnect and try again — and if the same face is refused twice, it is the file, not the
        watch.
      </p>
    </section>

    <section>
      <h2>Which browsers work</h2>
      <p>
        Connecting needs Web Bluetooth: Chrome or Edge, on desktop or Android. Firefox does not
        implement it, and neither does any browser on iOS — the editor still works there, you just
        cannot install from it.
      </p>
    </section>

    <footer>
      <p>
        Something here does not match what your watch did? <a href={ISSUES}>Open an issue</a> with your
        browser, the watch model and the firmware version the watch panel shows — that is enough for us
        to reproduce it.
      </p>
      <a class="back" href="/">
        <Icon name="storefront" size={18} />
        Back to the watchfaces
      </a>
    </footer>
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
    gap: 2rem;
  }
  h1 {
    margin: 0 0 0.75rem;
    font-family: var(--font-display);
    font-size: 1.75rem;
  }
  h2 {
    margin: 0 0 0.75rem;
    font-size: 1.125rem;
  }
  .lead {
    margin: 0;
    color: oklch(from var(--color-text) l c h / 75%);
  }
  p {
    margin: 0 0 0.75rem;
    line-height: 1.6;

    &:last-child {
      margin-bottom: 0;
    }
  }
  ul,
  ol {
    margin: 0;
    padding-left: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    line-height: 1.6;
  }
  li::marker {
    color: oklch(from var(--color-text) l c h / 45%);
  }
  code {
    font-family: var(--font-mono);
    font-size: 0.875em;
  }
  .note {
    margin-top: 0.75rem;
    font-size: 0.75rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  a {
    color: var(--color-accent);
    text-decoration-color: oklch(from var(--color-accent) l c h / 45%);
  }
  footer {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding-top: 1.5rem;
    border-top: 1px solid oklch(from var(--color-text) l c h / 12%);
  }
  .back {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    align-self: flex-start;
    color: var(--color-text);
    text-decoration: none;
  }
</style>
