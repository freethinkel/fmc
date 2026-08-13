<script lang="ts">
  // The watchface, running: the editor's renderer pointed at a parsed market face, ticking
  // against the wall clock (defaultSim().live) instead of a simulator panel.
  import { renderDoc } from "$lib/modules/editor/core/render/render";
  import { defaultSim } from "$lib/modules/editor/core/document/sources";
  import { SCREEN } from "$lib/modules/editor/core/render/screen";
  import type { LiveFace } from "../../model/market.model";

  interface Props {
    face: LiveFace;
  }
  const { face }: Props = $props();

  let canvas = $state<HTMLCanvasElement>();
  // no panel to change it here, so one sim for the lifetime of the component — `live` makes
  // renderDoc read the current time on every frame
  const sim = defaultSim();

  $effect(() => {
    const ctx = canvas?.getContext("2d");

    if (!ctx) return;
    // read here, not inside the loop: the loop must not re-run the effect
    const { doc, store } = face;
    let raf = 0;
    const loop = () => {
      ctx.clearRect(0, 0, SCREEN, SCREEN);
      renderDoc(ctx, doc, store, "main", sim);
      // ponytail: a plain rAF, like the editor's canvas — drop to a timer if a market page ever
      // needs to run several of these at once
      raf = requestAnimationFrame(loop);
    };

    loop();
    return () => cancelAnimationFrame(raf);
  });
</script>

<canvas bind:this={canvas} width={SCREEN} height={SCREEN}></canvas>

<style>
  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
