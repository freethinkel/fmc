<script lang="ts">
  import { Button } from "$lib/shared/components/button";
  import { Tabs } from "$lib/shared/components/tabs";
  import { Dialog } from "$lib/shared/components/dialog";
  import { Loader } from "$lib/shared/components/loader";
  import { Icon } from "$lib/shared/components/icon";
  import { authModel } from "$lib/modules/auth/model";
  import { marketModel } from "$lib/modules/market/model";
  import PublishDialog from "../components/PublishDialog.svelte";
  import GlyphsDialog from "../components/GlyphsDialog.svelte";
  import { bleModel } from "$lib/modules/device/model";
  import { renderDoc, type ResizePreview } from "../core/render/render";
  import { CENTER, SCREEN } from "../core/render/screen";
  import type { ImageStore, LayerHit } from "../core/render/canvas";
  import { framesOf, isPlaced, type Layer, type NodeId } from "../core/document/doc";
  import { containerOrigin, findLayer, parentOf } from "../core/document/edits";
  import { snapAxis, snapTargets, type SnapTargets } from "../core/render/snap";
  import { SNAP_THRESHOLD, GUIDE_WIDTH, GUIDE_COLOR } from "../shared/constants";
  import { inField, isRoving, matchShortcut, type ShortcutActions } from "../shared/shortcuts";
  import { editorModel } from "../model";
  import TreePanel from "../components/TreePanel.svelte";
  import PropsPanel from "../components/PropsPanel.svelte";
  import SimPanel from "../components/SimPanel.svelte";
  import ShortcutsDialog from "../components/ShortcutsDialog.svelte";

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
    $doc: doc,
    $store: store,
    $sim: sim,
    $screen: screen,
    $sel: sel,
    $selected: selected,
    $err: err,
    $undoN: undoN,
    $redoN: redoN,
    select,
    selectToggled,
    selectAllRequested,
    siblingSelected,
    nestSelected,
    screenSet,
    checkpoint,
    undo,
    redo,
    layerPatched,
    aodAdded,
    copyRequested,
    cutRequested,
    pasteRequested,
    duplicateRequested,
    deleteRequested,
    orderMoved,
    resizeImageRequested,
    resizeGroupRequested,
    $lockAspect: lockAspect,
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
    $loading: loading,
  } = editorModel;

  let canvas = $state<HTMLCanvasElement | null>(null);

  let mobilePanel = $state<"tree" | "props" | "sim" | null>(null); // drawer on mobile
  let helpOpen = $state(false); // the `?` overlay
  let hits: LayerHit[] = [];

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
    e.stopPropagation(); // the window handler would also read this as "move the selection"
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
        name: $doc?.name || "Custom",
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
  // A plain (non-$state) mirror of the stores: the rAF loop reads them every frame, and reading
  // them inside the render effect would make the effect re-run — tearing down and restarting the
  // loop — on every update.
  const snapshot = () => ({
    doc: $doc,
    store: $store,
    sim: $sim,
    screen: $screen,
    sel: $sel,
    selected: $selected,
  });
  let scene = snapshot();

  $effect(() => {
    scene = snapshot();
  });

  $effect(() => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    if (!ctx) return;
    let raf = 0;
    const loop = () => {
      const s = scene;
      const t0 = perf && performance.now();

      if (s.doc) {
        hits = renderDoc(ctx, s.doc, s.store, s.screen, s.sim, resizePreview());
        // extra picks get a plain box; the primary one carries the handles and the pivot cross
        for (const l of s.selected.slice(1)) drawBox(ctx, l.id);
        drawSelection(ctx, s.sel);
        drawGuides(ctx);
      } else {
        ctx.clearRect(0, 0, SCREEN, SCREEN);
      }
      if (perf) sampleFrame(t0 as number);
      raf = requestAnimationFrame(loop);
    };

    loop();
    return () => cancelAnimationFrame(raf);
  });

  const hitOf = (id: NodeId | null) => (id ? hits.findLast((h) => h.layer.id === id) : undefined);

  /** Where a layer WOULD sit when the render skipped it: a widget slot with placeholders turned
   *  off draws nothing at all, and a layer a condition hides this frame is in the same boat — so
   *  selecting one from the tree left no box anywhere and no way to tell where it is. */
  function ghostBox(id: NodeId | null) {
    const l = id && $doc ? findLayer($doc, id) : null;

    if (!l || !isPlaced(l) || !l.meta.w || !l.meta.h) return null;
    // containerOrigin counts the layer it is given, so ask about the PARENT — a group child's
    // own x/y is measured from its group's frame
    const o = containerOrigin($doc!, parentOf($doc!, l.id)?.id ?? null);

    return { x: o.x + l.x, y: o.y + l.y, w: l.meta.w, h: l.meta.h, ghost: true as const };
  }

  const boxOf = (id: NodeId | null) => hitOf(id) ?? ghostBox(id);

  function outline(
    ctx: CanvasRenderingContext2D,
    b: { x: number; y: number; w: number; h: number },
    ghost = false,
  ) {
    ctx.save();
    ctx.strokeStyle = "#4af";
    ctx.lineWidth = 2;
    // a longer dash for the ghost, so "here, but not drawn" doesn't read as an ordinary selection
    ctx.setLineDash(ghost ? [2, 5] : [6, 4]);
    ctx.strokeRect(b.x - 1, b.y - 1, b.w + 2, b.h + 2);
    ctx.restore();
  }

  function drawBox(ctx: CanvasRenderingContext2D, id: NodeId) {
    const b = boxOf(id);

    if (b) outline(ctx, b, "ghost" in b);
  }

  function drawSelection(ctx: CanvasRenderingContext2D, id: NodeId | null) {
    const h = hitOf(id);

    if (!h) {
      const g = ghostBox(id);

      if (g) outline(ctx, g, true);
      return;
    }
    outline(ctx, h);
    ctx.save();
    // a locked layer gets the outline and nothing else: no handles to grab, no pivot to aim
    if (h.layer.locked) {
      ctx.restore();
      return;
    }
    if (resizable(h.layer)) {
      ctx.setLineDash([]);
      ctx.fillStyle = "#4af";
      for (const [cx, cy] of CORNERS) {
        const p = onDisc(h.x + cx * h.w, h.y + cy * h.h);

        ctx.fillRect(p.x - HANDLE / 2, p.y - HANDLE / 2, HANDLE, HANDLE);
      }
    }
    // a hand rotates around x+pivot — mark that point, it's what the user aims when centring
    if (h.layer.kind === "hand") {
      const px = h.layer.x + h.layer.pivotX,
        py = h.layer.y + h.layer.pivotY;

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
  const HANDLE = 10; // canvas units (SCREEN-space)
  const CORNERS = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ] as const;
  // the canvas frame is a circle (border-radius 50%, see .canvas-frame), so a corner of a
  // full-screen image sits in clipped-away pixels — pull handles onto the visible disc
  const onDisc = (x: number, y: number): XY => {
    const dx = x - CENTER,
      dy = y - CENTER,
      d = Math.hypot(dx, dy),
      max = CENTER - HANDLE;

    return d <= max ? { x, y } : { x: CENTER + (dx / d) * max, y: CENTER + (dy / d) * max };
  };
  const firstAsset = (l: Layer | null) => {
    const ids = l && l.kind !== "group" ? framesOf(l) : [];

    return ids.length ? $doc?.images.get(ids[0]) : undefined;
  };

  /** Does anything under this layer have pixels to scale? A group has none of its own. */
  const hasArt = (l: Layer): boolean =>
    framesOf(l).length > 0 || (l.kind === "group" && l.children.some(hasArt));
  // locked is editor-only (see doc.ts): the layer still draws, it just stops answering the canvas
  const resizable = (l: Layer | null): boolean => Boolean(l) && hasArt(l!) && !l!.locked;

  type Rz = {
    layer: Layer;
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
    rw0: number; // the asset's size when the drag started — the target scales off it
    rh0: number;
    dx0: number; // anchor -> grab point. The scale is measured against THIS, not against the box:
    dy0: number; // a handle drawn off the true corner (see onDisc) would otherwise jump on move 1
    started: boolean; // the pointer actually moved — until then there's nothing to preview
  };
  let rz: Rz | null = null;

  // What the canvas draws mid-drag: the layer scaled around its anchor, no assets touched. The
  // real rescale happens once, on pointerup — see applyResize.
  const resizePreview = (): ResizePreview | null =>
    rz && rz.started
      ? { id: rz.layer.id, kw: rz.gw / rz.w0, kh: rz.gh / rz.h0, ax: rz.ax, ay: rz.ay }
      : null;

  // Rescale the assets to the target box (g*) — one call, at the end of the drag.
  function applyResize(z: Rz) {
    // the box and the asset scale by the same factors — separately per axis, so a corner drag
    // can change the aspect ratio
    const kw = z.gw / z.w0,
      kh = z.gh / z.h0;
    // a hand's x/y is owned by the pivot math in resizeImageFx — don't fight it. Everything else
    // keeps the anchored corner: delta-based, like alignRequested, since a layer's x/y is
    // container-local while the hit box is screen space.
    const pinned = z.layer.kind === "hand";

    const at = pinned
      ? undefined
      : { x: z.x0 + Math.round(z.gx - z.bx), y: z.y0 + Math.round(z.gy - z.by) };

    // a group has no pixels of its own: resizing it scales everything under it, by factor
    if (z.layer.kind === "group") {
      resizeGroupRequested({ layer: z.layer.id, kw, kh, at });
      return;
    }
    resizeImageRequested({
      layer: z.layer.id,
      w: Math.round(z.rw0 * kw),
      h: Math.round(z.rh0 * kh),
      at,
    });
  }

  const selHit = () => {
    const h = hitOf($sel);

    return h && resizable(h.layer) ? h : null;
  };
  const handleAt = (p: XY, h: LayerHit) => {
    for (const [cx, cy] of CORNERS) {
      const c = onDisc(h.x + cx * h.w, h.y + cy * h.h);

      if (Math.abs(p.x - c.x) <= HANDLE && Math.abs(p.y - c.y) <= HANDLE) return { cx, cy };
    }
    return null;
  };

  // ---- snapping ----
  // Targets are collected once on pointerdown: hits is rebuilt every frame, and the dragged
  // node's own box would otherwise snap to itself. ⌥ holds the drag off the guides.
  let snapT: SnapTargets | null = null;
  let cvScale = 1; // canvas units per screen px — the thresholds are in screen px
  let box0: LayerHit | null = null;
  let guides: { x: number[]; y: number[] } = { x: [], y: [] };

  function drawGuides(ctx: CanvasRenderingContext2D) {
    if (!guides.x.length && !guides.y.length) return;
    ctx.save();
    ctx.strokeStyle = GUIDE_COLOR;
    ctx.lineWidth = GUIDE_WIDTH * cvScale;
    ctx.beginPath();
    for (const x of guides.x) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, SCREEN);
    }
    for (const y of guides.y) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(SCREEN, y + 0.5);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ---- selection and drag ----
  type XY = { x: number; y: number };
  // one entry per dragged layer — a multi-selection moves as a block. The layer is captured when
  // the drag starts, so x0/y0 stay the origin the whole gesture measures from.
  type DragItem = { layer: Layer; x0: number; y0: number };
  let drag: { p: XY; items: DragItem[]; moved: boolean } | null = null;
  const canvasXY = (e: PointerEvent): XY => {
    const r = canvas!.getBoundingClientRect();

    return {
      x: ((e.clientX - r.left) * SCREEN) / r.width,
      y: ((e.clientY - r.top) * SCREEN) / r.height,
    };
  };

  /** What a layer moves by: its own x/y, or its frame's when it is a group. */
  function dragItem(l: Layer): DragItem | null {
    if (l.locked) return null;
    if (l.kind === "group") return { layer: l, x0: l.frame.x, y0: l.frame.y };
    return l.kind === "raw" ? null : { layer: l, x0: l.x, y0: l.y };
  }

  // No clamp on either kind: x/y is int16 for a widget and for a group's frame alike, so a layer
  // may hang off the left or top edge — stock faces do it, and the inspector has always let you
  // type it. See shiftLayer, which is the same move by a delta.
  const moveItem = (it: DragItem, x: number, y: number) =>
    layerPatched({
      id: it.layer.id,
      patch: (it.layer.kind === "group"
        ? { frame: { ...it.layer.frame, x, y } }
        : { x, y }) as Partial<Layer>,
    });

  function onDown(e: PointerEvent) {
    if (!$doc) return;
    const p = canvasXY(e);
    const sh = selHit();
    const c = sh && handleAt(p, sh);

    if (sh && c) {
      // a group scales by factor, so its base size is the box itself
      const r0 = firstAsset(sh.layer) ?? { w: sh.w, h: sh.h };
      const origin = dragItem(sh.layer);
      // The point that stays put while the box grows: normally the corner opposite the dragged
      // one, but a hand scales around its rotation centre — that's the invariant resizeImageFx
      // keeps, and the preview has to agree with it or the hand jumps on release.
      // ponytail: a hand's x/y is container-local, so this is off for one nested in a group —
      // no corpus face does that; read the centre off the hit box if one ever turns up.
      const hand = sh.layer.kind === "hand" ? sh.layer : null;
      const ax = hand ? hand.x + hand.pivotX : c.cx ? sh.x : sh.x + sh.w;
      const ay = hand ? hand.y + hand.pivotY : c.cy ? sh.y : sh.y + sh.h;

      rz = {
        started: false,
        rw0: r0.w,
        rh0: r0.h,
        layer: sh.layer,
        dirX: c.cx,
        dirY: c.cy,
        ax,
        ay,
        w0: sh.w,
        h0: sh.h,
        x0: origin?.x0 ?? 0,
        y0: origin?.y0 ?? 0,
        bx: sh.x,
        by: sh.y,
        gx: sh.x,
        gy: sh.y,
        gw: sh.w,
        gh: sh.h,
        dx0: Math.max(1, Math.abs(p.x - ax)),
        dy0: Math.max(1, Math.abs(p.y - ay)),
      };
      canvas?.setPointerCapture(e.pointerId);
      return;
    }
    const h = hits.findLast(
      (h) => !h.layer.locked && p.x >= h.x && p.x < h.x + h.w && p.y >= h.y && p.y < h.y + h.h,
    );

    if (!h) {
      select(null);
      return;
    }
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      selectToggled(h.layer.id); // add/remove — no drag, the modifier click is the whole gesture
      return;
    }
    // pressing inside an existing multi-selection keeps it, so the whole block can be dragged
    const inSelection = $selected.some((l) => l.id === h.layer.id);
    const layers = inSelection ? $selected : (select(h.layer.id), [h.layer]);
    const items = layers.map(dragItem).filter((i): i is DragItem => i !== null);

    if (items.length) {
      drag = { p, items, moved: false };
      // the hitbox, not the layer's x/y — a number's box is its composed digits, a hand's the
      // rotated AABB. Everything in the drag moves by one delta, so snapping this box is enough.
      box0 = h;
      snapT = snapTargets(hits, layers);
      // the canvas doesn't resize mid-drag, so one layout read is enough for the whole gesture
      cvScale = SCREEN / (canvas?.getBoundingClientRect().width || SCREEN);
    }
    canvas?.setPointerCapture(e.pointerId);
  }

  function onMove(e: PointerEvent) {
    if (rz) {
      const p = canvasXY(e);
      // The dragged corner follows the pointer on BOTH axes, each measured against the grab
      // point (dx0/dy0), so the box starts at 1:1 wherever the handle happened to be drawn.
      // Free w/h when the aspect lock is off: a uniform scale is driven by the long side, so on a
      // wide layer pulling the short side barely moved it. Shift inverts the lock, as usual.
      const rx = Math.abs(p.x - rz.ax) / rz.dx0,
        ry = Math.abs(p.y - rz.ay) / rz.dy0;
      const locked = $lockAspect !== e.shiftKey;
      const [sw, sh] = locked ? [Math.max(rx, ry), Math.max(rx, ry)] : [rx, ry];

      rz.gw = Math.max(1, Math.round(rz.w0 * sw));
      rz.gh = Math.max(1, Math.round(rz.h0 * sh));
      rz.gx = rz.dirX ? rz.ax : rz.ax - rz.gw;
      rz.gy = rz.dirY ? rz.ay : rz.ay - rz.gh;
      rz.started = true; // from here the canvas draws the preview (resizePreview)
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
    let dx = Math.round(p.x - d.p.x),
      dy = Math.round(p.y - d.p.y);

    guides = { x: [], y: [] };
    if (box0 && snapT && !e.altKey) {
      const tol = SNAP_THRESHOLD * cvScale;
      const sx = snapAxis(box0.x + dx, box0.w, snapT.xs, tol);
      const sy = snapAxis(box0.y + dy, box0.h, snapT.ys, tol);

      if (sx) {
        dx += Math.round(sx.corr);
        guides.x = [sx.line];
      }
      if (sy) {
        dy += Math.round(sy.corr);
        guides.y = [sy.line];
      }
    }
    // one delta for the whole drag, so a multi-selection keeps its shape while it snaps
    for (const it of d.items) moveItem(it, it.x0 + dx, it.y0 + dy);
  }
  function onUp() {
    if (rz) {
      if (rz.started) applyResize(rz); // the whole drag lands as one rescale
      rz = null;
    }
    drag = box0 = snapT = null;
    guides = { x: [], y: [] };
  }

  // ---- keyboard ----
  // The whole keymap lives in shared/shortcuts.ts; this file only says what each action means.
  function nudgeMove(dx: number, dy: number) {
    checkpoint();
    for (const l of $selected) {
      const it = dragItem(l);

      if (it) moveItem(it, it.x0 + dx, it.y0 + dy);
    }
  }

  // The keyboard twin of applyResize: the box grows from its top-left, so unlike a corner drag
  // there is no anchor to correct for and the layer's x/y are left alone.
  // ponytail: the primary selection only — resizing N layers by 1px each needs N async rescales
  // and a way to keep them in one undo step. Nobody has asked for it yet.
  function nudgeResize(dw: number, dh: number) {
    const l = $selected[0];

    if (!resizable(l)) return;
    const b = boxOf(l.id);

    if (!b || b.w < 1 || b.h < 1) return;
    const kw = Math.max(1, b.w + dw) / b.w,
      kh = Math.max(1, b.h + dh) / b.h;

    if (l.kind === "group") {
      resizeGroupRequested({ layer: l.id, kw, kh });
      return;
    }
    const r0 = firstAsset(l);

    if (!r0) return;
    resizeImageRequested({
      layer: l.id,
      w: Math.max(1, Math.round(r0.w * kw)),
      h: Math.max(1, Math.round(r0.h * kh)),
    });
  }

  const actions: ShortcutActions = {
    undo: () => undo(),
    redo: () => redo(),
    copy: () => copyRequested(),
    cut: () => cutRequested(),
    paste: () => pasteRequested(),
    duplicate: () => duplicateRequested(),
    remove: () => deleteRequested(),
    order: (dir) => orderMoved(dir),
    clearSelection: () => select(null),
    selectAll: () => selectAllRequested(),
    sibling: (dir) => siblingSelected(dir),
    nest: (dir) => nestSelected(dir),
    move: nudgeMove,
    resize: nudgeResize,
    save: () => void saveDraft(),
    exportBin: () => exportBin(),
    flash: () => void flashWatch(),
    panel: (tab) => rightPanelSet(tab),
    // picking AOD with no AOD screen creates one — the same thing the tab does
    screen: (kind) => (kind === "aod" && !hasAOD ? aodAdded() : screenSet(kind)),
    help: () => (helpOpen = true),
  };

  function onKey(e: KeyboardEvent) {
    const hit = matchShortcut(e, {
      doc: Boolean($doc),
      selection: $selected.length > 0,
      field: inField(e.target),
      roving: isRoving(e.target),
    });

    if (!hit) return;
    e.preventDefault();
    hit.run(actions, e);
  }

  async function flashWatch() {
    // thumbnail so the watch popover can show this face by picture rather than by id; key so
    // re-flashing it lands on the slot it already occupies instead of taking another one
    flashRequested({
      bin: await buildCurrentBin(),
      preview: await previewThumb(),
      key: $openedWf?.id,
    });
  }

  const hasAOD = $derived($doc?.screens.some((s) => s.kind === "aod"));
  const screenItems = $derived([
    { value: "main", label: "Main" },
    // not disabled when the face has no AOD screen — picking it creates one (see aodAdded)
    { value: "aod", label: hasAOD ? "AOD" : "AOD +", disabled: !$doc },
  ]);
  const panelItems = $derived([
    { value: "props", label: "Properties" },
    { value: "sim", label: "Simulator", disabled: !$doc },
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
    {#if $doc}
      <!-- commits on blur/Enter, not per keystroke: every rename is one undo step, and the
           header field only holds 15 bytes anyway (see renameFace) -->
      <input
        class="wf-name"
        value={$doc.name}
        title="Watchface name — the watch's own list shows the first 15 characters"
        maxlength="63"
        onchange={(e) => renameFace(e.currentTarget.value.trim())}
        onkeydown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      <Tabs
        items={screenItems}
        value={$screen}
        onChange={(v) =>
          v === "aod" ? (hasAOD ? screenSet("aod") : aodAdded()) : screenSet("main")}
      />
      <span class="tool-slot" title="Undo (⌘Z)">
        <Button kind="ghost" disabled={!$undoN} onClick={() => undo()}>
          <Icon name="undo" size={16} />
        </Button>
      </span>
      <span class="tool-slot" title="Redo (⇧⌘Z)">
        <Button kind="ghost" disabled={!$redoN} onClick={() => redo()}>
          <Icon name="redo" size={16} />
        </Button>
      </span>
      <span class="tool-slot" title="Export .bin">
        <Button kind="primary" onClick={() => exportBin()}>
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
    {#if $bleInfo && $doc}
      <span class="tool-slot" title="Upload to the watch">
        <Button kind="primary" onClick={flashWatch} disabled={$flashing}>
          <Icon name="zap" size={16} />
          {$flashing ? "Flashing…" : "Flash"}
        </Button>
      </span>
    {/if}
  </div>

  {#if $err || ($flashing && $bleStatus) || $bleStatus?.startsWith("error:")}
    <p class="statusbar" class:error={$err || $bleStatus?.startsWith("error:")}>
      {$err || $bleStatus}
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
            width={SCREEN}
            height={SCREEN}
            class="canvas"
            onpointerdown={onDown}
            onpointermove={onMove}
            onpointerup={onUp}
          ></canvas>
          <!-- the market opens the editor before the .bin has even arrived (see editRequested) —
               this is what the user watches while it does -->
          {#if $loading}
            <div class="canvas-loading"><Loader /></div>
          {/if}
        </div>
      </div>
      {#if perf && $doc}
        <p class="fps" class:slow={fps > 0 && fps < 50}>{fps} fps · {drawMs} ms draw</p>
      {/if}
      <p class="hint">
        click — select · drag / arrow keys (⇧ ×10) — move · ⌥ drag — no snap · corners — resize (⇧
        inverts the aspect lock) ·
        <button class="hint-key" onclick={() => (helpOpen = true)}>? — all shortcuts</button>
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

    {#if $doc}
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
<GlyphsDialog />

<ShortcutsDialog open={helpOpen} onClose={() => (helpOpen = false)} />

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
    position: relative; /* the loading overlay sits on the dial */
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
  .canvas-loading {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: oklch(1 0 0 / 70%);
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
  /* the hint itself ignores the pointer so it can't shadow the canvas — the one clickable word
     in it has to opt back in */
  .hint-key {
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    color: inherit;
    cursor: pointer;
    pointer-events: auto;
    text-decoration: underline dotted;
    text-underline-offset: 0.125rem;
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
