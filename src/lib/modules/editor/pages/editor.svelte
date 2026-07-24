<script>
  import { Button } from '$lib/shared/components/ui/button';
  import * as Tabs from '$lib/shared/components/ui/tabs';
  import * as Sheet from '$lib/shared/components/ui/sheet';
  import { Undo2, Redo2, FolderInput, FilePlus2, Download, UploadCloud, Zap, ListTree, SlidersHorizontal, Play, Save } from '@lucide/svelte';
  import { authModel } from '$lib/modules/auth/model';
  import { marketModel } from '$lib/modules/market/model';
  import PublishDialog from '../components/PublishDialog.svelte';
  import { bleModel } from '$lib/modules/device/model';
  import { TAG, unhex, hex } from '../lib/wf';
  import { render, parseFrame } from '../lib/render';
  import { editorModel } from '../model';
  import TreePanel from '../components/TreePanel.svelte';
  import { headerSlot } from '$lib/shared/components/header-slot.svelte.js';
  import PropsPanel from '../components/PropsPanel.svelte';
  import SimPanel from '../components/SimPanel.svelte';

  const { $user: user } = authModel;
  const { $bleStatus: bleStatus, $bleInfo: bleInfo, flashRequested, $flashing: flashing } = bleModel;
  const {
    $openedWf: openedWf, openedWfSet,
    saveDraftRequested, $savePending: saving, publishDialogOpened,
  } = marketModel;
  const { $editor: editor, select, screenTagSet, checkpoint, undo, redo, patched,
    loadRequested, newFaceRequested, exportBin, buildCurrentBin, previewBlob,
    $rightPanel: rightPanel, rightPanelSet } = editorModel;

  let canvas = $state(null);
  let mobilePanel = $state(null); // 'tree' | 'props' | 'sim' — bottom sheet on mobile
  let hits = [];

  function openFile(e) {
    const f = e.target.files?.[0] || e.dataTransfer?.files?.[0];
    if (f) f.arrayBuffer().then(buf => loadRequested({ buf, label: f.name }));
    openedWfSet(null);
    e.preventDefault();
    if (e.target.value !== undefined) e.target.value = '';
  }

  // Save: new watchface → draft; already-open own watchface → update, keeping its status
  async function saveDraft() {
    saveDraftRequested({
      name: $editor.face.name || 'Custom', ownerId: $user.id,
      published: $openedWf?.published ?? false,
      bin: buildCurrentBin(), preview: await previewBlob(),
    });
  }

  // the editor toolbar lives in the shared header while this page is open
  $effect(() => {
    headerSlot.snippet = toolbar;
    return () => (headerSlot.snippet = null);
  });

  // ---- rendering ----
  $effect(() => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
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

  function drawSelection(ctx, sel) {
    const h = hits.findLast(h => h.node === sel || h.node.subs?.includes(sel));
    if (!h) return;
    ctx.save();
    ctx.strokeStyle = '#4af';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(h.x - 1, h.y - 1, h.w + 2, h.h + 2);
    const pv = h.node.subs?.find(s => s.tag === TAG.pivot);
    const st = h.node.subs?.find(s => s.tag === TAG.struct);
    if (pv && st) {
      const px = st.x + pv.pivotX, py = st.y + pv.pivotY;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(px - 8, py); ctx.lineTo(px + 8, py);
      ctx.moveTo(px, py - 8); ctx.lineTo(px, py + 8);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---- selection and drag ----
  let drag = null;
  const canvasXY = e => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * 466 / r.width, y: (e.clientY - r.top) * 466 / r.height };
  };
  const selStruct = n => (n?.tag === TAG.struct ? n : n?.subs?.find(s => s.tag === TAG.struct));

  function setFrameXY(groupNode, x, y) {
    const f = groupNode.subs.find(s => s.tag === TAG.frame);
    const v = unhex(f.hex);
    v[0] = x; v[1] = x >> 8; v[2] = y; v[3] = y >> 8;
    patched({ node: f, patch: { hex: hex(v) } });
  }

  function onDown(e) {
    if (!$editor.face) return;
    const p = canvasXY(e);
    const h = hits.findLast(h => p.x >= h.x && p.x < h.x + h.w && p.y >= h.y && p.y < h.y + h.h);
    select(h?.node || null);
    if (!h?.node) return;
    const st = selStruct(h.node);
    const fr = h.node.tag === TAG.group ? parseFrame(h.node) : null;
    if (fr) drag = { p, fr: h.node, x0: fr.x, y0: fr.y, moved: false };
    else if (st && st.x != null) drag = { p, st, x0: st.x, y0: st.y, moved: false };
    canvas.setPointerCapture(e.pointerId);
  }
  function onMove(e) {
    if (!drag) return;
    if (!drag.moved) { checkpoint(0); drag.moved = true; }
    const p = canvasXY(e);
    const dx = Math.round(p.x - drag.p.x), dy = Math.round(p.y - drag.p.y);
    if (drag.st) patched({ node: drag.st, patch: { x: Math.max(0, drag.x0 + dx), y: Math.max(0, drag.y0 + dy) } });
    else setFrameXY(drag.fr, Math.max(0, drag.x0 + dx), Math.max(0, drag.y0 + dy));
  }
  function onUp() { drag = null; }

  function onKey(e) {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.shiftKey ? redo() : undo();
      e.preventDefault();
      return;
    }
    const sel = $editor.sel;
    if (!sel) return;
    const d = e.shiftKey ? 10 : 1;
    const mv = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
    if (!mv) return;
    checkpoint();
    const st = selStruct(sel);
    const fr = sel.tag === TAG.group ? parseFrame(sel) : null;
    if (fr) setFrameXY(sel, Math.max(0, fr.x + mv[0]), Math.max(0, fr.y + mv[1]));
    else if (st && st.x != null) patched({ node: st, patch: { x: Math.max(0, st.x + mv[0]), y: Math.max(0, st.y + mv[1]) } });
    e.preventDefault();
  }

  function flashWatch() {
    flashRequested(buildCurrentBin());
  }

  const hasAOD = $derived($editor.face?.screens.some(s => s.tag === TAG.aod));
</script>

<svelte:window onkeydown={onKey} ondragover={e => e.preventDefault()} ondrop={openFile} />

{#snippet toolbar()}
  <Button size="sm" variant="outline">
    <label class="flex cursor-pointer items-center gap-1.5"><FolderInput class="size-4" /> <span class="hidden lg:inline">Import bin</span>
      <input type="file" accept=".bin" hidden onchange={openFile} /></label>
  </Button>
  <Button size="sm" variant="outline" onclick={() => { openedWfSet(null); newFaceRequested(); }} title="New">
    <FilePlus2 class="size-4" /> <span class="hidden lg:inline">New</span>
  </Button>
  {#if $editor.face}
    <span class="hidden max-w-40 truncate px-1 text-sm text-emerald-400 lg:inline">{$editor.face.name}</span>
    <Tabs.Root value={$editor.screenTag === TAG.aod ? 'aod' : 'main'}
      onValueChange={v => screenTagSet(v === 'aod' ? TAG.aod : TAG.main)}>
      <Tabs.List class="h-8">
        <Tabs.Trigger value="main" class="text-xs">Main</Tabs.Trigger>
        <Tabs.Trigger value="aod" class="text-xs" disabled={!hasAOD}>AOD</Tabs.Trigger>
      </Tabs.List>
    </Tabs.Root>
    <Button size="sm" variant="ghost" disabled={!$editor.undoN} onclick={() => undo()} title="Undo (⌘Z)"><Undo2 class="size-4" /></Button>
    <Button size="sm" variant="ghost" disabled={!$editor.redoN} onclick={() => redo()} title="Redo (⇧⌘Z)"><Redo2 class="size-4" /></Button>
    <Button size="sm" onclick={exportBin} title="Export .bin"><Download class="size-4" /> <span class="hidden lg:inline">Export .bin</span></Button>
    {#if $user}
      <Button size="sm" variant="secondary" onclick={saveDraft} disabled={$saving}
        title={$openedWf ? 'Save changes' : 'Save as draft'}>
        <Save class="size-4" /> <span class="hidden lg:inline">{$saving ? 'Saving…' : 'Save'}</span>
      </Button>
      <Button size="sm" variant="secondary" onclick={() => publishDialogOpened()} title="Publish">
        <UploadCloud class="size-4" /> <span class="hidden lg:inline">Publish</span>
      </Button>
    {/if}
  {/if}
  {#if $bleInfo && $editor.face}
    <Button size="sm" onclick={flashWatch} disabled={$flashing} title="Upload to the watch">
      <Zap class="size-4" /> {$flashing ? 'Flashing…' : 'Flash'}
    </Button>
  {/if}
{/snippet}

<div class="flex h-full min-h-0 flex-1 flex-col bg-background text-foreground">
  {#if $editor.err || ($flashing && $bleStatus) || $bleStatus?.startsWith('error:')}
    <p class="border-b px-3 py-1.5 text-sm {$editor.err || $bleStatus?.startsWith('error:') ? 'text-destructive' : 'text-muted-foreground'}">
      {$editor.err || $bleStatus}
    </p>
  {/if}

  <div class="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] md:grid-cols-[280px_1fr_330px] md:grid-rows-1">
    <aside class="hidden min-h-0 border-r md:block">
      <TreePanel />
    </aside>

    <section class="flex min-h-0 flex-col items-center justify-center gap-2 overflow-hidden bg-black/20 p-4">
      <div class="aspect-square w-[min(70vh,90%,560px)] max-h-full overflow-hidden rounded-full bg-black shadow-[0_0_0_8px_theme(colors.zinc.800),0_0_50px_rgba(0,0,0,0.6)]">
        <canvas bind:this={canvas} width="466" height="466"
          class="block h-full w-full touch-none"
          onpointerdown={onDown} onpointermove={onMove} onpointerup={onUp}></canvas>
      </div>
      <p class="hidden text-xs text-muted-foreground md:block">click — select · drag / arrow keys (⇧ ×10) — move · ⌘Z undo</p>
    </section>

    <aside class="hidden min-h-0 flex-col border-l md:flex">
      <Tabs.Root value={$rightPanel} onValueChange={rightPanelSet} class="flex min-h-0 flex-1 flex-col gap-0">
        <Tabs.List class="m-2 grid grid-cols-2">
          <Tabs.Trigger value="props" class="text-xs">Properties</Tabs.Trigger>
          <Tabs.Trigger value="sim" class="text-xs" disabled={!$editor.face}>Simulator</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="props" class="min-h-0 flex-1 overflow-y-auto p-3 pt-0"><PropsPanel /></Tabs.Content>
        <Tabs.Content value="sim" class="min-h-0 flex-1 overflow-y-auto p-3 pt-0"><SimPanel /></Tabs.Content>
      </Tabs.Root>
    </aside>

    <!-- mobile panel buttons: each opens the bottom sheet -->
    {#if $editor.face}
      <div class="flex gap-2 border-t p-2 md:hidden">
        <Button variant="outline" class="flex-1" onclick={() => (mobilePanel = 'tree')}>
          <ListTree class="size-4" /> Tree
        </Button>
        <Button variant="outline" class="flex-1" onclick={() => (mobilePanel = 'props')}>
          <SlidersHorizontal class="size-4" /> Props
        </Button>
        <Button variant="outline" class="flex-1" onclick={() => (mobilePanel = 'sim')}>
          <Play class="size-4" /> Sim
        </Button>
      </div>
    {/if}
  </div>
</div>

<Sheet.Root open={mobilePanel !== null} onOpenChange={o => { if (!o) mobilePanel = null; }}>
  <Sheet.Content side="bottom" class="overflow-y-auto pb-[env(safe-area-inset-bottom)] data-[side=bottom]:h-[65svh]">
    {#if mobilePanel === 'tree'}
      <TreePanel />
    {:else if mobilePanel === 'props'}
      <div class="p-3"><PropsPanel /></div>
    {:else if mobilePanel === 'sim'}
      <div class="p-3"><SimPanel /></div>
    {/if}
  </Sheet.Content>
</Sheet.Root>

<PublishDialog />
