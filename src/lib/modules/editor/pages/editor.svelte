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
  import { render, parseFrame, type Hit } from "../lib/render";
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
    loadRequested,
    newFaceRequested,
    exportBin,
    buildCurrentBin,
    previewBlob,
    $rightPanel: rightPanel,
    rightPanelSet,
  } = editorModel;

  let canvas = $state<HTMLCanvasElement | null>(null);
  let mobilePanel = $state<"tree" | "props" | "sim" | null>(null); // drawer on mobile
  let hits: Hit[] = [];

  function openFile(e: Event) {
    const t = e.target;
    const f =
      (t instanceof HTMLInputElement ? t.files?.[0] : undefined) ||
      (e as DragEvent).dataTransfer?.files?.[0];

    if (f) f.arrayBuffer().then((buf) => loadRequested({ buf, label: f.name }));
    faceDetached();
    e.preventDefault();
    if (t instanceof HTMLInputElement) t.value = "";
  }

  // Save: new watchface → draft; already-open own watchface → update, keeping its status
  async function saveDraft() {
    const u = $user;

    if (!u) return;
    saveDraftRequested({
      name: $editor.face?.name || "Custom",
      ownerId: u.id,
      published: $openedWf?.published ?? false,
      bin: buildCurrentBin(),
      preview: await previewBlob(),
    });
  }

  // ---- rendering ----
  $effect(() => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    if (!ctx) return;
    let raf = 0;
    const loop = () => {
      const s = editor.getState();

      if (s.face) {
        hits = render(ctx, s.face, s.screenTag, s.sim);
        drawSelection(ctx, s.sel);
      } else {
        ctx.clearRect(0, 0, 466, 466);
      }
      raf = requestAnimationFrame(loop);
    };

    loop();
    return () => cancelAnimationFrame(raf);
  });

  function drawSelection(ctx: CanvasRenderingContext2D, sel: FaceNode | null) {
    if (!sel) return;
    const h = hits.findLast(
      (h) => h.node === sel || h.node.subs?.includes(sel),
    );

    if (!h) return;
    ctx.save();
    ctx.strokeStyle = "#4af";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(h.x - 1, h.y - 1, h.w + 2, h.h + 2);
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
    const h = hits.findLast(
      (h) => p.x >= h.x && p.x < h.x + h.w && p.y >= h.y && p.y < h.y + h.h,
    );

    select(h?.node || null);
    if (!h?.node) return;
    const st = selStruct(h.node);
    const fr = h.node.tag === TAG.group ? parseFrame(h.node) : null;

    if (fr) drag = { p, fr: h.node, x0: fr.x, y0: fr.y, moved: false };
    else if (st && st.x != null)
      drag = { p, st, x0: st.x, y0: st.y!, moved: false };
    canvas?.setPointerCapture(e.pointerId);
  }
  function onMove(e: PointerEvent) {
    const d = drag;

    if (!d) return;
    if (!d.moved) {
      checkpoint(0);
      d.moved = true;
    }
    const p = canvasXY(e);
    const dx = Math.round(p.x - d.p.x),
      dy = Math.round(p.y - d.p.y);

    if (d.st)
      patched({
        node: d.st,
        patch: { x: Math.max(0, d.x0 + dx), y: Math.max(0, d.y0 + dy) },
      });
    else setFrameXY(d.fr, Math.max(0, d.x0 + dx), Math.max(0, d.y0 + dy));
  }
  function onUp() {
    drag = null;
  }

  function onKey(e: KeyboardEvent) {
    if (
      ["INPUT", "TEXTAREA", "SELECT"].includes(
        (e.target as HTMLElement).tagName,
      )
    )
      return;
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

    if (fr)
      setFrameXY(sel, Math.max(0, fr.x + mv[0]), Math.max(0, fr.y + mv[1]));
    else if (st && st.x != null)
      patched({
        node: st,
        patch: { x: Math.max(0, st.x + mv[0]), y: Math.max(0, st.y! + mv[1]) },
      });
    e.preventDefault();
  }

  function flashWatch() {
    flashRequested(buildCurrentBin());
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

<svelte:window
  onkeydown={onKey}
  ondragover={(e) => e.preventDefault()}
  ondrop={openFile}
/>

<div class="page">
  <div class="toolbar">
    <Button kind="secondary" size="sm">
      <label class="file-label">
        <Icon name="folder-input" size={16} />
        <span class="btn-label">Import bin</span>
        <input type="file" accept=".bin" hidden onchange={openFile} />
      </label>
    </Button>
    <span class="tool-slot" title="New">
      <Button
        kind="secondary"
        size="sm"
        onClick={() => {
          faceDetached();
          newFaceRequested();
        }}
      >
        <Icon name="file-plus" size={16} /> <span class="btn-label">New</span>
      </Button>
    </span>
    {#if $editor.face}
      <span class="wf-name">{$editor.face.name}</span>
      <Tabs
        items={screenItems}
        value={$editor.screenTag === TAG.aod ? "aod" : "main"}
        onChange={(v) => screenTagSet(v === "aod" ? TAG.aod : TAG.main)}
      />
      <span class="tool-slot" title="Undo (⌘Z)">
        <Button
          kind="ghost"
          size="sm"
          disabled={!$editor.undoN}
          onClick={() => undo()}
        >
          <Icon name="undo" size={16} />
        </Button>
      </span>
      <span class="tool-slot" title="Redo (⇧⌘Z)">
        <Button
          kind="ghost"
          size="sm"
          disabled={!$editor.redoN}
          onClick={() => redo()}
        >
          <Icon name="redo" size={16} />
        </Button>
      </span>
      <span class="tool-slot" title="Export .bin">
        <Button kind="primary" size="sm" onClick={exportBin}>
          <Icon name="download" size={16} />
          <span class="btn-label">Export .bin</span>
        </Button>
      </span>
      {#if $user}
        <span
          class="tool-slot"
          title={$openedWf ? "Save changes" : "Save as draft"}
        >
          <Button kind="ghost" size="sm" onClick={saveDraft} disabled={$saving}>
            <Icon name="save" size={16} />
            <span class="btn-label">{$saving ? "Saving…" : "Save"}</span>
          </Button>
        </span>
        <span class="tool-slot" title="Publish">
          <Button
            kind="secondary"
            size="sm"
            onClick={() => publishDialogOpened()}
          >
            <Icon name="upload-cloud" size={16} />
            <span class="btn-label">Publish</span>
          </Button>
        </span>
      {/if}
    {/if}
    {#if $bleInfo && $editor.face}
      <span class="tool-slot" title="Upload to the watch">
        <Button
          kind="primary"
          size="sm"
          onClick={flashWatch}
          disabled={$flashing}
        >
          <Icon name="zap" size={16} />
          {$flashing ? "Flashing…" : "Flash"}
        </Button>
      </span>
    {/if}
  </div>

  {#if $editor.err || ($flashing && $bleStatus) || $bleStatus?.startsWith("error:")}
    <p
      class="statusbar"
      class:error={$editor.err || $bleStatus?.startsWith("error:")}
    >
      {$editor.err || $bleStatus}
    </p>
  {/if}

  <div class="layout">
    <aside class="side-panel tree-panel">
      <TreePanel />
    </aside>

    <section class="canvas-section">
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
      <p class="hint">
        click — select · drag / arrow keys (⇧ ×10) — move · ⌘Z undo
      </p>
    </section>

    <aside class="side-panel right-panel">
      <div class="tabs-row">
        <Tabs
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

<Dialog
  side
  open={mobilePanel !== null}
  title={mobileTitle}
  onClose={() => (mobilePanel = null)}
>
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
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid oklch(from var(--color-text) l c h / 12%);
  }
  .file-label {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }
  .btn-label {
    display: none;
  }
  .wf-name {
    display: none;
    max-width: 160px;
    overflow: hidden;
    padding-inline: 4px;
    font-size: 0.875rem;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    padding: 6px 12px;
    font-size: 0.875rem;
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
    min-height: 0;
  }
  @media (min-width: 768px) {
    .side-panel {
      display: flex;
      flex-direction: column;
    }
  }
  .tree-panel {
    width: 280px;
    border-inline-end: 1px solid oklch(from var(--color-text) l c h / 12%);
  }
  .right-panel {
    width: 330px;
    border-inline-start: 1px solid oklch(from var(--color-text) l c h / 12%);
  }
  .tabs-row {
    padding: 8px;
  }
  .panel-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0 12px 12px;
  }
  .canvas-section {
    display: flex;
    min-height: 0;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    overflow: hidden;
    padding: 16px;
    background: oklch(from var(--color-text) l c h / 4%);
  }
  .canvas-frame {
    aspect-ratio: 1;
    width: min(70vh, 90%, 560px);
    max-height: 100%;
    overflow: hidden;
    border-radius: 50%;
    background: oklch(0 0 0);
    box-shadow:
      0 0 0 8px oklch(0.28 0 0),
      0 0 50px oklch(0 0 0 / 60%);
    margin-top: auto;
    margin-bottom: auto;
  }
  .canvas {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
  }
  .hint {
    display: none;
    margin: 0;
    font-size: 0.75rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  @media (min-width: 768px) {
    .hint {
      display: block;
    }
  }
  .mobile-actions {
    display: flex;
    gap: 8px;
    padding: 8px;
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
