<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";
  import { Button } from "$lib/shared/components/button";
  import { Icon, type IconName } from "$lib/shared/components/icon";
  import { TAG, unhex, type FaceNode } from "../lib/wf";
  import { metaInfo, ID_LABELS } from "../lib/render";
  import { editorModel } from "../model";
  const {
    $editor: editor,
    select,
    addWidgetRequested,
    deleteWidget,
    moveNode,
    invertColorsRequested,
  } = editorModel;

  const tagNames = {
    [TAG.main]: "Screen",
    [TAG.aod]: "AOD",
    [TAG.name]: "Name",
    [TAG.preview]: "Preview",
    [TAG.image]: "Image",
    [TAG.number]: "Number",
    [TAG.group]: "Group",
    [TAG.hand]: "Hand",
    [TAG.struct]: "struct",
    [TAG.bind]: "cond",
    [TAG.pivot]: "pivot",
    [TAG.fmt]: "format",
    [TAG.frame]: "frame",
    [TAG.pvStruct]: "preview",
    0x38: "Widget 0x38",
    0x80: "Arc",
    0x81: "Progress ring",
    0x82: "Arc 0x82",
    0x85: "Widget slot",
  };

  const tagIcons: Record<number, IconName> = {
    [TAG.main]: "monitor",
    [TAG.aod]: "moon",
    [TAG.name]: "type",
    [TAG.preview]: "eye",
    [TAG.image]: "image",
    [TAG.number]: "hash",
    [TAG.group]: "folder",
    [TAG.hand]: "clock-3",
    [TAG.struct]: "braces",
    [TAG.bind]: "git-branch",
    [TAG.pivot]: "crosshair",
    [TAG.fmt]: "braces",
    [TAG.frame]: "film",
    [TAG.pvStruct]: "eye",
    0x80: "circle",
    0x81: "loader",
    0x82: "circle",
    0x85: "square-dashed",
  };

  export function nodeLabel(n: FaceNode) {
    let s = tagNames[n.tag as keyof typeof tagNames] || `0x${n.tag.toString(16)}`;
    const st = n.tag === TAG.struct ? n : n.subs?.find((c) => c.tag === TAG.struct);

    if (st?.meta) {
      const { id } = metaInfo(st);

      if (id) s += ` · ${ID_LABELS[id] || "id 0x" + id.toString(16)}`;
    }
    if (n.tag === 0x85) {
      // 0x5f: [slotIndex][count][activeIdx][count × metric id] — show the currently assigned metric
      const sf = n.subs?.find((c) => c.tag === 0x5f);
      const v = sf?.hex ? unhex(sf.hex) : null;
      const activeId = v && v.length >= 3 ? v[3 + v[2]] : undefined;

      if (activeId != null) s += ` · ${ID_LABELS[activeId] || "0x" + activeId.toString(16)}`;
    }
    if (n._kind) s += ` · ${n._kind}`;
    return s;
  }

  function onAdd(kind: "image" | "number" | "hand", e: Event) {
    const t = e.target as HTMLInputElement;
    const files = t.files;

    if (files?.length) addWidgetRequested({ kind, files: [...files] });
    t.value = "";
  }

  const openNodes = new SvelteSet(); // accordion: closed by default, keyed by the node itself (tree is mutable, refs are stable)

  function toggleOpen(n: FaceNode, e: Event) {
    e.stopPropagation();
    if (openNodes.has(n)) openNodes.delete(n);
    else openNodes.add(n);
  }

  // Native HTML5 drag & drop — reorder siblings (= draw order). Dragging across parents is
  // rejected in dragover, so the drop indicator only shows on valid targets.
  // $state.raw, not $state: a proxied node would break identity checks against the tree
  let drag = $state.raw<{ node: FaceNode; parent: FaceNode | null } | null>(null);
  let dropAt = $state.raw<{ node: FaceNode; after: boolean } | null>(null);

  function onDragStart(n: FaceNode, parent: FaceNode | null, e: DragEvent) {
    drag = { node: n, parent };
    e.dataTransfer?.setData("text/plain", ""); // Firefox needs payload to start a drag
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  }

  function onDragOver(n: FaceNode, parent: FaceNode | null, e: DragEvent) {
    if (!drag || drag.node === n || drag.parent !== parent) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();

    dropAt = { node: n, after: e.clientY > r.top + r.height / 2 };
  }

  function onDrop(n: FaceNode, e: DragEvent) {
    e.preventDefault();
    // the list is reversed, so dropping visually below the target means earlier in subs
    if (drag && dropAt?.node === n) moveNode(drag.node, n, !dropAt.after);
    drag = dropAt = null;
  }
</script>

<div class="tree-panel">
  <div class="toolbar">
    <span class="tool-slot" title="Add image widget">
      <Button kind="secondary" disabled={!$editor.face}>
        <label class="file-label">
          <Icon name="image-plus" size={16} />
          <input
            type="file"
            accept="image/*"
            hidden
            disabled={!$editor.face}
            onchange={(e) => onAdd("image", e)}
          />
        </label>
      </Button>
    </span>
    <span class="tool-slot" title="Add number widget — select 10 digit images (0…9)">
      <Button kind="secondary" disabled={!$editor.face}>
        <label class="file-label">
          <Icon name="hash" size={16} />
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            disabled={!$editor.face}
            onchange={(e) => onAdd("number", e)}
          />
        </label>
      </Button>
    </span>
    <span class="tool-slot" title="Add hand widget">
      <Button kind="secondary" disabled={!$editor.face}>
        <label class="file-label">
          <Icon name="clock-3" size={16} />
          <input
            type="file"
            accept="image/*"
            hidden
            disabled={!$editor.face}
            onchange={(e) => onAdd("hand", e)}
          />
        </label>
      </Button>
    </span>
    <span
      class="tool-slot"
      title={$editor.sel
        ? "Invert colors of the selected layer"
        : "Invert colors of the whole screen"}
    >
      <Button kind="secondary" disabled={!$editor.face} onClick={() => invertColorsRequested()}>
        <Icon name="contrast" size={16} />
      </Button>
    </span>
    <div class="spacer"></div>
    <span class="tool-slot" title="Delete selected widget">
      <Button kind="ghost" disabled={!$editor.sel} onClick={deleteWidget}>
        <Icon name="trash" size={16} color="var(--color-error)" />
      </Button>
    </span>
  </div>
  <div class="list">
    {#if $editor.face}
      {#each $editor.face.screens.filter((s) => s.tag === $editor.screenTag) as scr}
        {@render treeNode(scr, 0, null)}
      {/each}
    {:else}
      <p class="empty">Drop a .bin here or grab one from the marketplace.</p>
    {/if}
  </div>
</div>

{#snippet treeNode(n: FaceNode, depth: number, parent: FaceNode | null)}
  {@const nodeIcon = tagIcons[n.tag] || "box"}
  <!-- reversed: subs order is draw order, so the last sub is the topmost layer and goes first -->
  {@const kids =
    depth < 4 ? (n.subs || []).filter((c) => c.subs || c.tag === TAG.struct).reverse() : []}
  <button
    type="button"
    class="node-row"
    class:selected={$editor.sel === n}
    class:dragging={drag?.node === n}
    class:drop-before={dropAt?.node === n && !dropAt.after}
    class:drop-after={dropAt?.node === n && dropAt.after}
    style="padding-inline-start: {8 + depth * 12}px"
    draggable={!!parent}
    onclick={() => select(n)}
    ondragstart={(e) => onDragStart(n, parent, e)}
    ondragover={(e) => onDragOver(n, parent, e)}
    ondrop={(e) => onDrop(n, e)}
    ondragend={() => (drag = dropAt = null)}
  >
    {#if kids.length}
      <Icon
        name="chevron-right"
        size={12}
        class={openNodes.has(n) ? "chevron open" : "chevron"}
        onclick={(e: MouseEvent) => toggleOpen(n, e)}
      />
    {:else}
      <span class="chevron-spacer"></span>
    {/if}
    <Icon name={nodeIcon} size={14} class="node-icon" />
    <span class="label">{nodeLabel(n)}</span>
  </button>
  {#if kids.length && openNodes.has(n)}
    {#each kids as c}
      {@render treeNode(c, depth + 1, n)}
    {/each}
  {/if}
{/snippet}

<style>
  .tree-panel {
    display: flex;
    height: 100%;
    flex-direction: column;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px;
    border-bottom: 1px solid oklch(from var(--color-text) l c h / 10%);
  }
  .tool-slot {
    display: inline-flex;
  }
  .file-label {
    display: flex;
    align-items: center;
    cursor: pointer;
  }
  .spacer {
    flex: 1;
  }
  .list {
    flex: 1;
    overflow-y: auto;
    padding-block: 4px;
    font-size: 0.875rem;
  }
  .empty {
    margin: 0;
    padding: 12px;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  .node-row {
    display: flex;
    align-items: center;
    width: 100%;
    gap: 6px;
    border: none;
    background: transparent;
    padding-block: 2px;
    padding-inline-end: 8px;
    font: inherit;
    color: var(--color-text);
    text-align: start;
    cursor: pointer;

    &:hover {
      background: oklch(from var(--color-text) l c h / 6%);
    }
    &.selected {
      background: oklch(from var(--color-accent) l c h / 12%);
      color: var(--color-accent);
    }
    &.dragging {
      opacity: 0.4;
    }
    /* drop line: accent hue rotated to yellow, so it reads against the orange selection */
    &.drop-before {
      box-shadow: inset 0 2px 0 oklch(from var(--color-accent) l c 100);
    }
    &.drop-after {
      box-shadow: inset 0 -2px 0 oklch(from var(--color-accent) l c 100);
    }
    &:not(.selected) :global(.node-icon) {
      color: oklch(from var(--color-text) l c h);
      opacity: 0.55;
    }
  }
  .label {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .chevron-spacer {
    flex-shrink: 0;
    width: 12px;
    height: 12px;
  }
  :global(.chevron) {
    flex-shrink: 0;
    color: oklch(from var(--color-text) l c h / 55%);
    transition: transform 0.15s ease;
  }
  :global(.chevron.open) {
    transform: rotate(90deg);
  }
  :global(.node-icon) {
    flex-shrink: 0;
  }
</style>
