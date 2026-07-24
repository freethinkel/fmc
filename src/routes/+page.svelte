<script lang="ts">
  import { goto } from "$app/navigation";
  import { Button } from "$lib/shared/components/button";
  import { Badge } from "$lib/shared/components/badge";

  const now = new Date();
  const s = now.getSeconds();
  const m = now.getMinutes() * 60 + s;
  const h = (now.getHours() % 12) * 3600 + m;

  const FEATURES = [
    {
      n: "01",
      t: "Editor in the browser",
      d: "Drag & drop, undo/redo, live preview with hands and simulated data.",
    },
    {
      n: "02",
      t: "Marketplace",
      d: "Publish watchfaces, collect likes and downloads, remix others as a base.",
    },
    {
      n: "03",
      t: "Flash over BLE",
      d: "Push the .bin to the watch right from the tab — no wires, no toolchains.",
    },
  ];

  const HANDS = [
    { kind: "hour", len: 26, w: 4, dur: 43200, off: h },
    { kind: "minute", len: 36, w: 3, dur: 3600, off: m },
    { kind: "second", len: 42, w: 1, dur: 60, off: s },
  ];
</script>

<svelte:head><title>FMC Watchfaces — watchface editor for CMF Watch Pro 2</title></svelte:head>

<div class="page">
  <!-- dot grid -->
  <div class="dot-grid" aria-hidden="true"></div>
  <!-- orange glow -->
  <div class="glow" aria-hidden="true"></div>

  <header>
    <span class="logo">FMC<span class="accent">·</span>WF</span>
    <nav>
      <a href="/market">marketplace</a>
      <a href="/editor">editor</a>
    </nav>
  </header>

  <main class="hero">
    <section class="pitch">
      <Badge>CMF Watch Pro 2 · .bin · Web Bluetooth</Badge>
      <h1>Your own<br />watchface.<br /><span class="accent">In one evening.</span></h1>
      <p class="lede">
        Open any .bin, drag widgets around, watch the live preview — then flash it to the watch
        straight from the browser. Or publish it to the marketplace and collect likes.
      </p>
      <div class="cta-row">
        <Button kind="primary" onClick={() => goto("/editor")}>Open the editor →</Button>
        <Button kind="secondary" onClick={() => goto("/market")}>Marketplace</Button>
      </div>
    </section>

    <!-- CSS watch -->
    <section class="watch-wrap">
      <div class="watch">
        <div class="ticks"></div>
        <div class="center-label"><span>FMC·WF</span></div>
        {#each HANDS as hand}
          <div
            class="hand hand__{hand.kind}"
            style="width: {hand.w}px; height: {hand.len}%; animation-duration: {hand.dur}s; animation-delay: -{hand.off}s;"
          ></div>
        {/each}
        <div class="hub"></div>
      </div>
    </section>
  </main>

  <section class="features">
    <div class="grid">
      {#each FEATURES as f}
        <article>
          <p class="num">{f.n}</p>
          <h3>{f.t}</h3>
          <p class="desc">{f.d}</p>
        </article>
      {/each}
    </div>
  </section>

  <footer>
    <p>FMC WATCHFACES — unofficial tooling for CMF Watch Pro 2</p>
  </footer>
</div>

<style>
  /* -global-: the spin animation is also started from an inline style (per-hand
     duration/delay are computed per item), so its name must not be scoped */
  @keyframes -global-spin {
    to {
      rotate: 360deg;
    }
  }

  .page {
    position: relative;
    min-height: 100dvh;
    overflow-x: hidden;
    background: var(--color-background);
    color: var(--color-text);
    font-family: var(--font-family);
  }

  .dot-grid {
    position: fixed;
    inset: 0;
    pointer-events: none;
    background-image: radial-gradient(
      circle,
      oklch(from var(--color-text) l c h / 15%) 1px,
      transparent 1px
    );
    background-size: 28px 28px;
  }

  .glow {
    position: fixed;
    top: 25%;
    right: -160px;
    width: 600px;
    height: 600px;
    border-radius: 50%;
    pointer-events: none;
    background: oklch(from var(--color-accent) l c h / 10%);
    filter: blur(120px);
  }

  header {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;

    @media (min-width: 768px) {
      padding: 20px 48px;
    }
  }

  .logo {
    font-family: var(--font-display);
    font-size: 0.875rem;
    font-weight: 700;
    letter-spacing: 0.1em;
  }

  .accent {
    color: var(--color-accent);
  }

  nav {
    display: flex;
    gap: 24px;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: oklch(from var(--color-text) l c h / 55%);

    a {
      color: inherit;
      text-decoration: none;
      transition: color 0.15s ease;

      &:hover {
        color: var(--color-accent);
      }
    }
  }

  .hero {
    position: relative;
    z-index: 1;
    display: grid;
    align-items: center;
    gap: 64px;
    max-width: 1152px;
    margin: 0 auto;
    padding: 48px 24px 96px;

    @media (min-width: 768px) {
      grid-template-columns: 1.2fr 1fr;
      padding: 96px 48px 96px;
    }
  }

  .pitch h1 {
    margin: 24px 0 0;
    font-family: var(--font-display);
    font-size: 2.25rem;
    font-weight: 900;
    line-height: 1.05;

    @media (min-width: 768px) {
      font-size: 3.75rem;
    }
  }

  .lede {
    max-width: 448px;
    margin: 24px 0 0;
    font-size: 0.875rem;
    line-height: 1.6;
    color: oklch(from var(--color-text) l c h / 55%);
  }

  .cta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin-top: 40px;
  }

  .watch-wrap {
    display: flex;
    justify-content: center;
  }

  .watch {
    position: relative;
    aspect-ratio: 1 / 1;
    width: 288px;
    border-radius: 50%;
    border: 1px solid oklch(from var(--color-text) l c h / 12%);
    background: var(--color-background);
    box-shadow:
      0 0 0 10px oklch(from var(--color-text) l c h / 6%),
      0 0 80px oklch(from var(--color-accent) l c h / 15%);

    @media (min-width: 768px) {
      width: 320px;
    }
  }

  .ticks {
    position: absolute;
    inset: 8px;
    border-radius: 50%;
    background: repeating-conic-gradient(
      oklch(from var(--color-text) l c h / 30%) 0deg 0.6deg,
      transparent 0.6deg 30deg
    );
    mask: radial-gradient(circle closest-side, transparent 87%, black 88%);
  }

  .center-label {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;

    span {
      margin-top: 96px;
      font-family: var(--font-mono);
      font-size: 10px;
      letter-spacing: 0.4em;
      color: oklch(from var(--color-text) l c h / 40%);
    }
  }

  .hand {
    position: absolute;
    top: 50%;
    left: 50%;
    transform-origin: bottom;
    translate: -50% -100%;
    border-radius: 999px;
    animation-name: spin;
    animation-timing-function: linear;
    animation-iteration-count: infinite;
  }
  .hand__hour {
    background: oklch(from var(--color-text) l c h / 80%);
  }
  .hand__minute {
    background: oklch(from var(--color-text) l c h / 65%);
  }
  .hand__second {
    background: var(--color-accent);
  }

  .hub {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 12px;
    height: 12px;
    translate: -50% -50%;
    border-radius: 50%;
    border: 2px solid var(--color-accent);
    background: var(--color-background);
  }

  .features {
    position: relative;
    z-index: 1;
    border-top: 1px solid oklch(from var(--color-text) l c h / 10%);
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1px;
    max-width: 1152px;
    margin: 0 auto;
    background: oklch(from var(--color-text) l c h / 10%);

    @media (min-width: 768px) {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  article {
    padding: 32px;
    background: var(--color-background);
    transition: background-color 0.15s ease;

    &:hover {
      background: oklch(from var(--color-text) l c h / 4%);
    }

    h3 {
      margin: 12px 0 0;
      font-family: var(--font-display);
      font-size: 0.875rem;
      font-weight: 700;
    }

    .desc {
      margin: 12px 0 0;
      font-size: 0.75rem;
      line-height: 1.6;
      color: oklch(from var(--color-text) l c h / 55%);
    }
  }

  .num {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--color-accent);
  }

  footer {
    position: relative;
    z-index: 1;
    border-top: 1px solid oklch(from var(--color-text) l c h / 10%);
    padding: 24px;

    @media (min-width: 768px) {
      padding: 24px 48px;
    }

    p {
      margin: 0;
      font-family: var(--font-mono);
      font-size: 10px;
      letter-spacing: 0.1em;
      color: oklch(from var(--color-text) l c h / 40%);
    }
  }
</style>
