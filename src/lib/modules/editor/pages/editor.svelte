<script lang="ts">
  import { Button } from "$lib/shared/components/button";
  import { Tabs } from "$lib/shared/components/tabs";
  import { Dialog } from "$lib/shared/components/dialog";
  import { Icon } from "$lib/shared/components/icon";
  import { authModel } from "$lib/modules/auth/model";
  import { marketModel } from "$lib/modules/market/model";
  import PublishDialog from "../components/PublishDialog.svelte";
  import { bleModel } from "$lib/modules/device/model";
  import { TAG, unhex, hex, type FaceNode } from "../lib/wf";
  import { render, parseFrame } from "../lib/render";
  import type { Hit } from "../lib/canvas";
  import { editorModel } from "../model";
  import TreePanel from "../components/TreePanel.svelte";
  import PropsPanel from "../components/PropsPanel.svelte";
  import SimPanel from "../components/SimPanel.svelte";

  const { $user: user } = authModel;
  const {
    $bleStatus: bleStatus,
    $bleInfo: bleInfo,
    flashRequested,
    $flashing: flashing,
  } = bleModel;
  const {
    $openedWf: openedWf,
    $foreignWf: foreignWf,
    faceDetached,
    saveDraftRequested,
    $savePending: saving,
    publishDialogOpened,
  } = marketModel;
  const {
    $editor: editor,
    select,
    screenTagSet,
    checkpoint,
    undo,
    redo,
    patched,
    resizeImageRequested,
    loadRequested,
    newFaceRequested,
    importFacerRequested,
    exportBin,
    errored,
    renameFace,
    buildCurrentBin,
    previewBlob,
    previewThumb,
    $rightPanel: rightPanel,
    rightPanelSet,
  } = editorModel;

  let canvas = $state<HTMLCanvasElement | null>(null);
  let mobilePanel = $state<"tree" | "props" | "sim" | null>(null); // drawer on mobile
  let hits: Hit[] = [];

  // ---- resizable side panels (desktop only — below 768px both are drawers) ----
  // Widths live in rem, like every other size here, so they keep following the :root scale knob;
  // the drag delta is in px and gets divided by the current root font size. Persisted, because a
  // panel that springs back on every reload isn't really resizable.
  const PANEL_KEY = "fmc.panel-widths";
  const SIDE_MIN = 12,
    SIDE_MAX = 35;
  const savedWidths: { tree?: number; right?: number } = JSON.parse(
    localStorage.getItem(PANEL_KEY) || "{}",
  );
  let treeW = $state(savedWidths.tree ?? 17.5);
  let rightW = $state(savedWidths.right ?? 20.625);
  let gutter = $state.raw<{ side: "tree" | "right"; x: number; from: number } | null>(null);

  const rootRem = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const setSide = (side: "tree" | "right", w: number) => {
    const clamped = Math.min(SIDE_MAX, Math.max(SIDE_MIN, w));

    if (side === "tree") treeW = clamped;
    else rightW = clamped;
  };

  $effect(() => {
    localStorage.setItem(PANEL_KEY, JSON.stringify({ tree: treeW, right: rightW }));
  });

  // The whole drag lives on the window (see <svelte:window> below) rather than on pointer
  // capture: capture drops the moves the moment it fails to engage, and it doesn't survive the
  // pointer being released outside the browser. preventDefault here is what stops the drag from
  // turning into a text selection, which is the only thing capture was buying.
  function gutterDown(side: "tree" | "right", e: PointerEvent) {
    e.preventDefault();
    gutter = { side, x: e.clientX, from: side === "tree" ? treeW : rightW };
  }

  function gutterMove(e: PointerEvent) {
    if (!gutter) return;
    // the right panel grows leftwards, so its delta is mirrored
    const dx = gutter.side === "tree" ? e.clientX - gutter.x : gutter.x - e.clientX;

    setSide(gutter.side, gutter.from + dx / rootRem());
  }

  function gutterKey(side: "tree" | "right", e: KeyboardEvent) {
    const step = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;

    if (!step) return;
    e.preventDefault();
    setSide(side, (side === "tree" ? treeW : rightW) + (side === "tree" ? step : -step));
  }

  // At a clamp the handle can only go one way, so say so with a single-headed cursor. The tree
  // panel grows to the right and the right panel to the left, hence the mirrored arms.
  function gutterCursor(side: "tree" | "right") {
    const w = side === "tree" ? treeW : rightW;
    const grow = side === "tree" ? "e-resize" : "w-resize";
    const shrink = side === "tree" ? "w-resize" : "e-resize";

    if (w <= SIDE_MIN) return grow;
    if (w >= SIDE_MAX) return shrink;
    return "col-resize";
  }

  function openFile(e: Event) {
    const t = e.target;
    const f =
      (t instanceof HTMLInputElement ? t.files?.[0] : undefined) ||
      (e as DragEvent).dataTransfer?.files?.[0];

    if (t instanceof HTMLInputElement) t.value = "";
    // this is also the window-level ondrop, so every in-app drag ends up here (layer reorder,
    // frame reorder) — only a drop carrying a file is an import. Detaching unconditionally
    // made the toolbar forget which record is open the moment you dragged anything.
    if (!f) return;
    e.preventDefault();
    f.arrayBuffer().then((buf) => loadRequested({ buf, label: f.name }));
    faceDetached();
  }

  // Facer exports are directories, so this takes a whole folder rather than one file
  function openFacer(e: Event) {
    const t = e.target;
    const files = t instanceof HTMLInputElement ? [...(t.files ?? [])] : [];

    if (t instanceof HTMLInputElement) t.value = "";
    if (!files.length) return; // cancelled picker — same as above, don't detach the record
    importFacerRequested(files);
    faceDetached();
  }

  // see marketModel's $foreignWf — the rule itself lives there, this is what the greyed-out
  // Save/Publish say when you hover them
  const FOREIGN_HINT =
    "Someone else's watchface — edit and flash it freely, but it can't be re-uploaded under your name. Export the .bin and open that file to start your own from it.";

  // An own, already-published watchface updates in place on Save (saveFx keeps its published
  // flag), so Publish would only open a dialog that does the same thing under another name.
  const isPublishedMine = $derived(Boolean($openedWf?.published) && $openedWf?.owner === $user?.id);

  // Save: new watchface → draft; already-open own watchface → update, keeping its status.
  // buildCurrentBin re-encodes and self-checks the whole file, so it can throw — without the
  // catch that reads as a dead button: no request, no message.
  async function saveDraft() {
    const u = $user;

    if (!u) return;
    try {
      saveDraftRequested({
        name: $editor.face?.name || "Custom",
        ownerId: u.id,
        published: $openedWf?.published ?? false,
        bin: await buildCurrentBin(),
        preview: await previewBlob(),
      });
    } catch (e) {
      errored(`save: ${e instanceof Error ? e.message : e}`);
    }
  }

  // ---- dev frame meter ----
  // The canvas redraws every rAF whether or not anything changed (the clock moves), so this is
  // the editor's steady-state cost. `draw` is time inside render() alone — that's the number
  // worth watching, since the gap to 16.7ms is everything else the browser is doing.
  const perf = import.meta.env.DEV;
  let fps = $state(0);
  let drawMs = $state(0);
  let frames = 0,
    drawTotal = 0,
    since = 0;

  function sampleFrame(t0: number) {
    const now = performance.now();

    frames++;
    drawTotal += now - t0;
    since ||= now;
    if (now - since >= 500) {
      fps = Math.round((frames * 1000) / (now - since));
      drawMs = Math.round((drawTotal / frames) * 10) / 10;
      frames = drawTotal = 0;
      since = now;
    }
  }

  // ---- rendering ----
  $effect(() => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    if (!ctx) return;
    let raf = 0;
    const loop = () => {
      const s = editor.getState();
      const t0 = perf && performance.now();

      if (s.face) {
        hits = render(ctx, s.face, s.screenTag, s.sim);
        drawSelection(ctx, s.sel);
      } else {
        ctx.clearRect(0, 0, 466, 466);
      }
      if (perf) sampleFrame(t0 as number);
      raf = requestAnimationFrame(loop);
    };

    loop();
    return () => cancelAnimationFrame(raf);
  });

  function drawSelection(ctx: CanvasRenderingContext2D, sel: FaceNode | null) {
    if (!sel) return;
    const h = hits.findLast((h) => h.node === sel || h.node.subs?.includes(sel));

    if (!h) return;
    ctx.save();
    ctx.strokeStyle = "#4af";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(h.x - 1, h.y - 1, h.w + 2, h.h + 2);
    if (rz) {
      // resize preview: the resource is only re-encoded on pointerup, so nothing about the
      // drawn image changes during the drag — this ghost is the whole live feedback
      ctx.strokeStyle = "#4af";
      ctx.setLineDash([2, 2]);
      ctx.strokeRect(rz.gx, rz.gy, rz.gw, rz.gh);
    }
    if (resizable(h.node)) {
      ctx.setLineDash([]);
      ctx.fillStyle = "#4af";
      for (const [cx, cy] of CORNERS) {
        const p = onDisc(h.x + cx * h.w, h.y + cy * h.h);

        ctx.fillRect(p.x - HANDLE / 2, p.y - HANDLE / 2, HANDLE, HANDLE);
      }
    }
    const pv = h.node.subs?.find((s) => s.tag === TAG.pivot);
    const st = h.node.subs?.find((s) => s.tag === TAG.struct);

    if (pv && st) {
      const px = st.x! + pv.pivotX!,
        py = st.y! + pv.pivotY!;

      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(px - 8, py);
      ctx.lineTo(px + 8, py);
      ctx.moveTo(px, py - 8);
      ctx.lineTo(px, py + 8);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---- resize handles ----
  // Any widget drawn from images gets corner handles, on its selection box. The box isn't
  // always the resource rect (a NUMBER's is the composed digits, a HAND's is the rotated
  // AABB), so the drag works in scale factors: the box is scaled uniformly and the resource
  // follows by the same factor. Groups (frame w/h, not pixels) and procedural arcs are out.
  const HANDLE = 10; // canvas units (466-space)
  const CORNERS = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ] as const;
  // the canvas frame is a circle (border-radius 50%, see .canvas-frame), so a corner of a
  // full-screen image sits in clipped-away pixels — pull handles onto the visible disc
  const onDisc = (x: number, y: number): XY => {
    const dx = x - 233,
      dy = y - 233,
      d = Math.hypot(dx, dy),
      max = 233 - HANDLE;

    return d <= max ? { x, y } : { x: 233 + (dx / d) * max, y: 233 + (dy / d) * max };
  };
  const firstRes = (n: FaceNode | null) => {
    const st = n && n.tag !== TAG.group ? n.subs?.find((s) => s.tag === TAG.struct) : null;

    return st?.images?.length ? $editor.face?.resources[st.images[0]] : undefined;
  };
  const resizable = (n: FaceNode | null): boolean => Boolean(firstRes(n));

  type Rz = {
    node: FaceNode;
    st: FaceNode;
    dirX: number;
    dirY: number;
    ax: number;
    ay: number;
    w0: number;
    h0: number;
    x0: number;
    y0: number;
    bx: number;
    by: number;
    gx: number;
    gy: number;
    gw: number;
    gh: number;
  };
  let rz: Rz | null = null;

  const selHit = () =>
    resizable($editor.sel) ? hits.findLast((h) => h.node === $editor.sel) || null : null;
  const handleAt = (p: XY, h: Hit) => {
    for (const [cx, cy] of CORNERS) {
      const c = onDisc(h.x + cx * h.w, h.y + cy * h.h);

      if (Math.abs(p.x - c.x) <= HANDLE && Math.abs(p.y - c.y) <= HANDLE) return { cx, cy };
    }
    return null;
  };

  // ---- selection and drag ----
  type XY = { x: number; y: number };
  type Drag =
    | {
        p: XY;
        x0: number;
        y0: number;
        moved: boolean;
        st: FaceNode;
        fr?: undefined;
      }
    | {
        p: XY;
        x0: number;
        y0: number;
        moved: boolean;
        fr: FaceNode;
        st?: undefined;
      };
  let drag: Drag | null = null;
  const canvasXY = (e: PointerEvent): XY => {
    const r = canvas!.getBoundingClientRect();

    return {
      x: ((e.clientX - r.left) * 466) / r.width,
      y: ((e.clientY - r.top) * 466) / r.height,
    };
  };
  const selStruct = (n: FaceNode | null) =>
    n?.tag === TAG.struct ? n : n?.subs?.find((s) => s.tag === TAG.struct);

  function setFrameXY(groupNode: FaceNode, x: number, y: number) {
    const f = groupNode.subs!.find((s) => s.tag === TAG.frame)!;
    const v = unhex(f.hex!);

    v[0] = x;
    v[1] = x >> 8;
    v[2] = y;
    v[3] = y >> 8;
    patched({ node: f, patch: { hex: hex(v) } });
  }

  function onDown(e: PointerEvent) {
    if (!$editor.face) return;
    const p = canvasXY(e);
    const sh = selHit();
    const c = sh && handleAt(p, sh);

    if (sh && c) {
      const st = selStruct($editor.sel)!;

      rz = {
        node: $editor.sel!,
        st,
        dirX: c.cx,
        dirY: c.cy,
        // the dragged corner moves, the opposite one stays put — that's the anchor
        ax: c.cx ? sh.x : sh.x + sh.w,
        ay: c.cy ? sh.y : sh.y + sh.h,
        w0: sh.w,
        h0: sh.h,
        x0: st.x ?? 0,
        y0: st.y ?? 0,
        bx: sh.x,
        by: sh.y,
        gx: sh.x,
        gy: sh.y,
        gw: sh.w,
        gh: sh.h,
      };
      canvas?.setPointerCapture(e.pointerId);
      return;
    }
    const h = hits.findLast((h) => p.x >= h.x && p.x < h.x + h.w && p.y >= h.y && p.y < h.y + h.h);

    select(h?.node || null);
    if (!h?.node) return;
    const st = selStruct(h.node);
    const fr = h.node.tag === TAG.group ? parseFrame(h.node) : null;

    if (fr) drag = { p, fr: h.node, x0: fr.x, y0: fr.y, moved: false };
    else if (st && st.x != null) drag = { p, st, x0: st.x, y0: st.y!, moved: false };
    canvas?.setPointerCapture(e.pointerId);
  }
  function onMove(e: PointerEvent) {
    if (rz) {
      const p = canvasXY(e);
      // uniform scale (corner drags keep proportions — free w/h lives in the props panel)
      const s = Math.max(Math.abs(p.x - rz.ax) / rz.w0, Math.abs(p.y - rz.ay) / rz.h0);

      rz.gw = Math.max(1, Math.round(rz.w0 * s));
      rz.gh = Math.max(1, Math.round(rz.h0 * s));
      rz.gx = rz.dirX ? rz.ax : rz.ax - rz.gw;
      rz.gy = rz.dirY ? rz.ay : rz.ay - rz.gh;
      return;
    }
    const d = drag;

    if (!d) {
      const sh = canvas && selHit();
      const c = sh && handleAt(canvasXY(e), sh);

      if (canvas) canvas.style.cursor = c ? (c.cx === c.cy ? "nwse-resize" : "nesw-resize") : "";
      return;
    }
    if (!d.moved) {
      checkpoint(0);
      d.moved = true;
    }
    const p = canvasXY(e);
    const dx = Math.round(p.x - d.p.x),
      dy = Math.round(p.y - d.p.y);

    // widget x/y are int16 — negatives are legal (and used by stock faces), so no clamp here;
    // group frames stay >=0, their x/y round-trip through the file as unsigned
    if (d.st) patched({ node: d.st, patch: { x: d.x0 + dx, y: d.y0 + dy } });
    else setFrameXY(d.fr, d.x0 + dx, d.y0 + dy); // frame x/y are int16 — a group may hang off
  }
  function onUp() {
    if (rz) {
      const r0 = firstRes(rz.node);
      const scale = rz.gw / rz.w0;

      // a hand's x/y is owned by the pivot math in resizeImageFx — don't fight it. Everything
      // else keeps the anchored corner: delta-based, like alignSelected, since st.x is
      // widget-local while the hit box is screen space.
      if (
        r0 &&
        !rz.node.subs?.some((s) => s.tag === TAG.pivot) &&
        (rz.gx !== rz.bx || rz.gy !== rz.by)
      ) {
        checkpoint(0);
        patched({
          node: rz.st,
          patch: {
            x: rz.x0 + Math.round(rz.gx - rz.bx),
            y: rz.y0 + Math.round(rz.gy - rz.by),
          },
        });
      }
      if (r0)
        resizeImageRequested({
          node: rz.node,
          w: Math.round(r0.w * scale),
          h: Math.round(r0.h * scale),
        });
      rz = null;
    }
    drag = null;
  }

  function onKey(e: KeyboardEvent) {
    if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement).tagName)) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      if (e.shiftKey) redo();
      else undo();
      e.preventDefault();
      return;
    }
    const sel = $editor.sel;

    if (!sel) return;
    const d = e.shiftKey ? 10 : 1;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-d, 0],
      ArrowRight: [d, 0],
      ArrowUp: [0, -d],
      ArrowDown: [0, d],
    };
    const mv = moves[e.key];

    if (!mv) return;
    checkpoint();
    const st = selStruct(sel);
    const fr = sel.tag === TAG.group ? parseFrame(sel) : null;

    if (fr) setFrameXY(sel, fr.x + mv[0], fr.y + mv[1]);
    else if (st && st.x != null)
      patched({ node: st, patch: { x: st.x + mv[0], y: st.y! + mv[1] } });
    e.preventDefault();
  }

  async function flashWatch() {
    // thumbnail so the watch popover can show this face by picture rather than by id; key so
    // re-flashing it lands on the slot it already occupies instead of taking another one
    flashRequested({
      bin: await buildCurrentBin(),
      preview: previewThumb(),
      key: $openedWf?.id,
    });
  }

  const hasAOD = $derived($editor.face?.screens.some((s) => s.tag === TAG.aod));
  const screenItems = $derived([
    { value: "main", label: "Main" },
    { value: "aod", label: "AOD", disabled: !hasAOD },
  ]);
  const panelItems = $derived([
    { value: "props", label: "Properties" },
    { value: "sim", label: "Simulator", disabled: !$editor.face },
  ]);
  const mobileTitle = $derived(
    mobilePanel === "tree"
      ? "Tree"
      : mobilePanel === "props"
        ? "Properties"
        : mobilePanel === "sim"
          ? "Simulator"
          : undefined,
  );
</script>

<!-- the resize drag ends on the WINDOW, not the handle: releasing outside the browser (or losing
     the pointer to a cancel) otherwise leaves the gutter stuck to the cursor -->
<svelte:window
  onkeydown={onKey}
  ondragover={(e) => e.preventDefault()}
  ondrop={openFile}
  onpointermove={gutterMove}
  onpointerup={() => (gutter = null)}
  onpointercancel={() => (gutter = null)}
  onblur={() => (gutter = null)}
/>

<div class="page">
  <div class="toolbar">
    <Button kind="secondary">
      <label class="file-label">
        <Icon name="folder-input" size={16} />
        <span class="btn-label">Import bin</span>
        <input type="file" accept=".bin" hidden onchange={openFile} />
      </label>
    </Button>
    <span class="tool-slot" title="Import a Facer or WatchMaker export folder">
      <Button kind="secondary">
        <label class="file-label">
          <Icon name="watch" size={16} />
          <span class="btn-label">Import folder</span>
          <input type="file" webkitdirectory hidden onchange={openFacer} />
        </label>
      </Button>
    </span>
    <span class="tool-slot" title="New">
      <Button
        kind="secondary"
        onClick={() => {
          faceDetached();
          newFaceRequested();
        }}
      >
        <Icon name="file-plus" size={16} /> <span class="btn-label">New</span>
      </Button>
    </span>
    {#if $editor.face}
      <!-- commits on blur/Enter, not per keystroke: every rename is one undo step, and the
           header field only holds 15 bytes anyway (see renameFace) -->
      <input
        class="wf-name"
        value={$editor.face.name}
        title="Watchface name — the watch's own list shows the first 15 characters"
        maxlength="63"
        onchange={(e) => renameFace(e.currentTarget.value.trim())}
        onkeydown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      <Tabs
        items={screenItems}
        value={$editor.screenTag === TAG.aod ? "aod" : "main"}
        onChange={(v) => screenTagSet(v === "aod" ? TAG.aod : TAG.main)}
      />
      <span class="tool-slot" title="Undo (⌘Z)">
        <Button kind="ghost" disabled={!$editor.undoN} onClick={() => undo()}>
          <Icon name="undo" size={16} />
        </Button>
      </span>
      <span class="tool-slot" title="Redo (⇧⌘Z)">
        <Button kind="ghost" disabled={!$editor.redoN} onClick={() => redo()}>
          <Icon name="redo" size={16} />
        </Button>
      </span>
      <span class="tool-slot" title="Export .bin">
        <Button kind="primary" onClick={exportBin}>
          <Icon name="download" size={16} />
          <span class="btn-label">Export .bin</span>
        </Button>
      </span>
      {#if $user}
        <span
          class="tool-slot"
          title={$foreignWf
            ? FOREIGN_HINT
            : isPublishedMine
              ? "Update the published watchface"
              : $openedWf
                ? "Save changes"
                : "Save as draft"}
        >
          <Button
            kind={isPublishedMine ? "secondary" : "ghost"}
            onClick={saveDraft}
            disabled={$saving || $foreignWf}
          >
            <Icon name="save" size={16} />
            <span class="btn-label"
              >{$saving ? "Saving…" : isPublishedMine ? "Update" : "Save"}</span
            >
          </Button>
        </span>
        {#if !isPublishedMine}
          <span class="tool-slot" title={$foreignWf ? FOREIGN_HINT : "Publish"}>
            <Button kind="secondary" onClick={() => publishDialogOpened()} disabled={$foreignWf}>
              <Icon name="upload-cloud" size={16} />
              <span class="btn-label">Publish</span>
            </Button>
          </span>
        {/if}
      {/if}
    {/if}
    {#if $bleInfo && $editor.face}
      <span class="tool-slot" title="Upload to the watch">
        <Button kind="primary" onClick={flashWatch} disabled={$flashing}>
          <Icon name="zap" size={16} />
          {$flashing ? "Flashing…" : "Flash"}
        </Button>
      </span>
    {/if}
  </div>

  {#if $editor.err || ($flashing && $bleStatus) || $bleStatus?.startsWith("error:")}
    <p class="statusbar" class:error={$editor.err || $bleStatus?.startsWith("error:")}>
      {$editor.err || $bleStatus}
    </p>
  {/if}

  <div class="layout">
    <aside class="side-panel tree-panel" style="width: {treeW}rem">
      <TreePanel />
      {@render gutterHandle("tree")}
    </aside>

    <section class="canvas-section">
      <div class="canvas-scroll">
        <div class="canvas-frame">
          <canvas
            bind:this={canvas}
            width="466"
            height="466"
            class="canvas"
            onpointerdown={onDown}
            onpointermove={onMove}
            onpointerup={onUp}
          ></canvas>
        </div>
      </div>
      {#if perf && $editor.face}
        <p class="fps" class:slow={fps > 0 && fps < 50}>{fps} fps · {drawMs} ms draw</p>
      {/if}
      <p class="hint">
        click — select · drag / arrow keys (⇧ ×10) — move · corners — resize · ⌘Z undo
      </p>
    </section>

    <aside class="side-panel right-panel" style="width: {rightW}rem">
      {@render gutterHandle("right")}
      <div class="tabs-row">
        <Tabs
          full
          items={panelItems}
          value={$rightPanel}
          onChange={(v) => rightPanelSet(v as "props" | "sim")}
        />
      </div>
      <div class="panel-body">
        {#if $rightPanel === "sim"}
          <SimPanel />
        {:else}
          <PropsPanel />
        {/if}
      </div>
    </aside>

    {#if $editor.face}
      <div class="mobile-actions">
        <Button kind="secondary" onClick={() => (mobilePanel = "tree")}>
          <Icon name="list-tree" size={16} /> Tree
        </Button>
        <Button kind="secondary" onClick={() => (mobilePanel = "props")}>
          <Icon name="sliders-horizontal" size={16} /> Props
        </Button>
        <Button kind="secondary" onClick={() => (mobilePanel = "sim")}>
          <Icon name="play" size={16} /> Sim
        </Button>
      </div>
    {/if}
  </div>
</div>

{#snippet gutterHandle(side: "tree" | "right")}
  <!-- a FOCUSABLE separator is the ARIA window-splitter widget, so tabindex + arrow keys are
       exactly right here — svelte's rules only know the static, non-interactive separator -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    tabindex="0"
    class="gutter gutter-{side}"
    class:active={gutter?.side === side}
    role="separator"
    aria-orientation="vertical"
    aria-label="Resize panel"
    aria-valuenow={Math.round(side === "tree" ? treeW : rightW)}
    aria-valuemin={SIDE_MIN}
    aria-valuemax={SIDE_MAX}
    style="cursor: {gutterCursor(side)}"
    onpointerdown={(e) => gutterDown(side, e)}
    ondblclick={() => setSide(side, side === "tree" ? 17.5 : 20.625)}
    onkeydown={(e) => gutterKey(side, e)}
  ></div>
{/snippet}

<Dialog side open={mobilePanel !== null} title={mobileTitle} onClose={() => (mobilePanel = null)}>
  {#if mobilePanel === "tree"}
    <TreePanel />
  {:else if mobilePanel === "props"}
    <PropsPanel />
  {:else if mobilePanel === "sim"}
    <SimPanel />
  {/if}
</Dialog>

<PublishDialog />

<style>
  .page {
    display: flex;
    min-height: 0;
    height: 100%;
    flex-direction: column;
    background: var(--color-background);
    color: var(--color-text);
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid oklch(from var(--color-text) l c h / 12%);
  }
  .file-label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    cursor: pointer;
  }
  .btn-label {
    display: none;
  }
  .wf-name {
    display: none;
    width: 10rem;
    overflow: hidden;
    border: 1px solid transparent;
    border-radius: var(--border-radius);
    background: transparent;
    padding-inline: 0.25rem;
    font: inherit;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--color-text);
    text-overflow: ellipsis;
    white-space: nowrap;

    &:hover {
      border-color: oklch(from var(--color-text) l c h / 12%);
    }
    &:focus {
      border-color: var(--color-accent);
      outline: none;
    }
  }
  .tool-slot {
    display: inline-flex;
  }
  @media (min-width: 1024px) {
    .btn-label,
    .wf-name {
      display: inline-block;
    }
  }
  .statusbar {
    margin: 0;
    padding: 0.375rem 0.75rem;
    font-size: 0.75rem;
    color: oklch(from var(--color-text) l c h / 55%);
    border-bottom: 1px solid oklch(from var(--color-text) l c h / 12%);

    &.error {
      color: var(--color-error);
    }
  }
  .layout {
    display: grid;
    min-height: 0;
    flex: 1;
    grid-template-columns: 1fr;
    grid-template-rows: minmax(0, 1fr) auto;
  }
  @media (min-width: 768px) {
    .layout {
      grid-template-columns: auto 1fr auto;
      grid-template-rows: 1fr;
    }
  }
  .side-panel {
    display: none;
    position: relative; /* the resize gutter straddles the panel's inner edge */
    min-height: 0;
  }
  @media (min-width: 768px) {
    .side-panel {
      display: flex;
      flex-direction: column;
    }
  }
  .tree-panel {
    border-inline-end: 1px solid oklch(from var(--color-text) l c h / 12%);
  }
  .right-panel {
    border-inline-start: 1px solid oklch(from var(--color-text) l c h / 12%);
  }
  /* invisible until hovered/dragged — the panel border already draws the seam */
  .gutter {
    position: absolute;
    z-index: 1;
    top: 0;
    bottom: 0;
    width: 0.5rem;
    border: none;
    padding: 0;
    background: transparent;
    /* cursor is set inline — it turns single-headed at a clamp, see gutterCursor */
    touch-action: none;
    transition: background-color 0.15s ease;

    &:hover,
    &:focus-visible,
    &.active {
      background: oklch(from var(--color-accent) l c h / 35%);
    }
  }
  .gutter-tree {
    inset-inline-end: -0.25rem;
  }
  .gutter-right {
    inset-inline-start: -0.25rem;
  }
  .tabs-row {
    padding: 0.5rem;
  }
  .panel-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0 0.75rem 0.75rem;
  }
  /* The dial stops shrinking at --canvas-min and scrolls instead — otherwise wide side panels
     (they're resizable) squeeze it down to an unusable disc. The scroller is the whole section,
     so its scrollbar runs along the section's own bottom edge rather than cutting the hint line
     off the dial. The tinted background and the hint stay put (the section doesn't scroll), so
     the hint still wraps to what's visible, not to the scrolled-out canvas width. */
  .canvas-section {
    --canvas-min: 16rem;

    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: oklch(from var(--color-text) l c h / 4%);
  }
  /* no align-items/justify-content centering here: flex centering clips whatever overflows past
     the start edge, so the dial is centred by its own auto margins, which don't */
  .canvas-scroll {
    position: absolute;
    inset: 0;
    display: flex;
    overflow: auto;
    /* padding on the SCROLLER, not the section: it keeps the dial's ring and glow off the edge
       without the scrollbar leaving the section's own border edge */
    padding: 1.5rem;
  }
  .canvas-frame {
    aspect-ratio: 1;
    width: min(70vh, 90%, 35rem);
    min-width: var(--canvas-min);
    min-height: var(--canvas-min);
    max-height: 100%;
    flex-shrink: 0;
    overflow: hidden;
    border-radius: 50%;
    background: oklch(0 0 0);
    box-shadow:
      0 0 0 0.5rem oklch(0.28 0 0),
      0 0 3.125rem oklch(0 0 0 / 60%);
    margin: auto;
  }
  .canvas {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
  }
  /* dev only — same overlay treatment as .hint, pinned to the opposite corner */
  .fps {
    position: absolute;
    top: 0.5rem;
    inset-inline-start: 0.5rem;
    z-index: 2;
    margin: 0;
    padding: 0.125rem 0.375rem;
    border-radius: calc(var(--border-radius) - 0.25rem);
    background: oklch(from var(--color-background) l c h / 70%);
    font-family: var(--font-mono);
    font-size: 0.625rem;
    color: oklch(from var(--color-text) l c h / 55%);
    pointer-events: none;

    &.slow {
      color: var(--color-error);
    }
  }
  /* floats over the scroller rather than taking a row of its own, so the scrollbar stays on the
     section's bottom edge — one layer across the whole width, under the text */
  .hint {
    display: none;
    position: absolute;
    inset-inline: 0;
    bottom: 0.75rem;
    margin: 0;
    padding-inline: 0.5rem;
    pointer-events: none;
    text-align: center;
    font-size: 0.625rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  @media (min-width: 768px) {
    .hint {
      display: block;
    }
  }
  .mobile-actions {
    display: flex;
    gap: 0.5rem;
    padding: 0.5rem;
    border-top: 1px solid oklch(from var(--color-text) l c h / 12%);
  }
  .mobile-actions :global(.btn) {
    flex: 1;
  }
  @media (min-width: 768px) {
    .mobile-actions {
      display: none;
    }
  }
</style>
