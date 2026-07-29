<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";
  import { Button } from "$lib/shared/components/button";
  import { Icon, type IconName } from "$lib/shared/components/icon";
  import { Menu, MenuItem } from "$lib/shared/components/menu";
  import { TAG, unhex, type FaceNode } from "../lib/wf";
  import { metaInfo, pickerLabel, describeBind } from "../lib/sources";
  import { contains, findParent } from "../lib/tree";
  import { editorModel } from "../model";
  const {
    $editor: editor,
    select,
    selectToggled,
    selectedNodes,
    addNode,
    addSlotRequested,
    addWidgetRequested,
    deleteWidget,
    duplicateSelected,
    groupSelected,
    ungroupSelected,
    moveNode,
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

      if (id) s += ` · ${pickerLabel(id)}`;
    }
    // a condition node's own row: show what it gates, not just "cond"
    if (n.tag === TAG.bind) s += ` · ${describeBind(n.hex).join(", ") || "empty"}`;
    if (n.tag === 0x85) {
      // 0x5f: [slotIndex][count][activeIdx][count × metric id] — show the currently assigned metric
      const sf = n.subs?.find((c) => c.tag === 0x5f);
      const v = sf?.hex ? unhex(sf.hex) : null;
      const activeId = v && v.length >= 3 ? v[3 + v[2]] : undefined;

      if (activeId != null) s += ` · ${pickerLabel(activeId)}`;
    }
    if (n._kind) s += ` · ${n._kind}`;
    return s;
  }

  // the file-backed layer kinds share one hidden input per kind, clicked from the Add menu —
  // a <label><input type=file> can't live inside a MenuItem's own <button>
  let fileInput = $state<Record<string, HTMLInputElement | undefined>>({});

  function onAdd(kind: "image" | "number" | "hand", e: Event) {
    const t = e.target as HTMLInputElement;
    const files = t.files;

    if (files?.length) addWidgetRequested({ kind, files: [...files] });
    t.value = "";
  }

  const picked = $derived(selectedNodes($editor));
  const isPicked = (n: FaceNode) => picked.includes(n);

  // grouping happens at screen level only, and one parent at a time — see groupSelected
  const canGroup = $derived.by(() => {
    const face = $editor.face;

    if (!face || !picked.length) return false;
    const parents = picked.map((n) => findParent(face.screens, n));

    return parents.every((p) => p === parents[0] && (p?.tag === TAG.main || p?.tag === TAG.aod));
  });

  // ponytail: a modifier click toggles one node — shift does the same as ctrl rather than
  // selecting a range, which would need the visible rows flattened into a list first
  function onRowClick(n: FaceNode, e: MouseEvent) {
    if (e.shiftKey || e.metaKey || e.ctrlKey) selectToggled(n);
    else select(n);
  }

  // Right-click menu, positioned at the pointer inside .tree-panel. Same actions as the
  // toolbar's "…" — declared once in the layerActions snippet below.
  let ctx = $state<{ x: number; y: number } | null>(null);

  function onRowMenu(n: FaceNode, e: MouseEvent) {
    e.preventDefault();
    if (!isPicked(n)) select(n); // right-clicking outside the selection moves it, like a file manager
    const r = (e.currentTarget as HTMLElement).closest(".tree-panel")!.getBoundingClientRect();

    ctx = { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  const openNodes = new SvelteSet(); // accordion: closed by default, keyed by the node itself (tree is mutable, refs are stable)

  // reveal the selection: clicking a widget on the canvas must open the accordion down to its
  // row, otherwise the selected node isn't even mounted
  $effect(() => {
    const { face, sel } = $editor;

    if (!face || !sel) return;
    for (let p = findParent(face.screens, sel); p; p = findParent(face.screens, p))
      openNodes.add(p);
  });

  function toggleOpen(n: FaceNode, e: Event) {
    e.stopPropagation();
    if (openNodes.has(n)) openNodes.delete(n);
    else openNodes.add(n);
  }

  // Native HTML5 drag & drop. Three drop zones: the top/bottom quarter of a row reorders next
  // to it (across parents too — moveNode fixes the coordinates up), the middle of a *group* row
  // drops into that group.
  // $state.raw, not $state: a proxied node would break identity checks against the tree
  let drag = $state.raw<FaceNode | null>(null);
  let dropAt = $state.raw<{ node: FaceNode; after: boolean; into: boolean } | null>(null);

  function onDragStart(n: FaceNode, e: DragEvent) {
    drag = n;
    e.dataTransfer?.setData("text/plain", ""); // Firefox needs payload to start a drag
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  }

  function onDragOver(n: FaceNode, parent: FaceNode | null, e: DragEvent) {
    // no parent = a screen row: it can still take children, but only by dropping into it
    if (!drag || contains(drag, n)) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const rel = (e.clientY - r.top) / r.height;
    const groupish = n.tag === TAG.group || !parent;

    dropAt = { node: n, after: rel > 0.5, into: groupish && rel > 0.25 && rel < 0.75 };
  }

  function onDrop(n: FaceNode, e: DragEvent) {
    e.preventDefault();
    // the list is reversed, so dropping visually below the target means earlier in subs
    if (drag && dropAt?.node === n)
      moveNode({ node: drag, target: n, after: !dropAt.after, into: dropAt.into });
    drag = dropAt = null;
  }
</script>

<div class="tree-panel">
  <div class="toolbar">
    <input
      bind:this={fileInput.image}
      type="file"
      accept="image/*"
      hidden
      onchange={(e) => onAdd("image", e)}
    />
    <input
      bind:this={fileInput.number}
      type="file"
      accept="image/*"
      multiple
      hidden
      onchange={(e) => onAdd("number", e)}
    />
    <input
      bind:this={fileInput.hand}
      type="file"
      accept="image/*"
      hidden
      onchange={(e) => onAdd("hand", e)}
    />
    <Menu align="start">
      {#snippet trigger({ toggle })}
        <span class="tool-slot" title="Add a layer">
          <Button kind="secondary" disabled={!$editor.face} onClick={toggle}>
            <Icon name="plus" size={16} />
          </Button>
        </span>
      {/snippet}
      <MenuItem onClick={() => fileInput.image?.click()}>
        <Icon name="image" size={14} /> Image…
      </MenuItem>
      <MenuItem onClick={() => fileInput.number?.click()}>
        <Icon name="hash" size={14} /> Number…
      </MenuItem>
      <MenuItem onClick={() => fileInput.hand?.click()}>
        <Icon name="clock-3" size={14} /> Hand…
      </MenuItem>
      <MenuItem onClick={() => addNode("ring")}>
        <Icon name="loader" size={14} /> Progress ring
      </MenuItem>
      <MenuItem onClick={() => addNode("group")}>
        <Icon name="folder" size={14} /> Group
      </MenuItem>
      <MenuItem onClick={() => addSlotRequested()}>
        <Icon name="square-dashed" size={14} /> Widget slot
      </MenuItem>
    </Menu>
    <div class="spacer"></div>
    <Menu>
      {#snippet trigger({ toggle })}
        <span class="tool-slot" title="Selected layer">
          <Button kind="ghost" disabled={!$editor.sel} onClick={toggle}>
            <Icon name="ellipsis" size={16} />
          </Button>
        </span>
      {/snippet}
      {@render layerActions()}
    </Menu>
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
  {#if ctx}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
    <div
      class="ctx-menu"
      role="menu"
      tabindex="-1"
      style="inset-inline-start: {ctx.x}px; top: {ctx.y}px"
      onclick={() => (ctx = null)}
    >
      {@render layerActions()}
    </div>
  {/if}
</div>

<svelte:window
  onpointerdown={(e) => {
    if (ctx && !(e.target as HTMLElement).closest(".ctx-menu")) ctx = null;
  }}
  onkeydown={(e) => e.key === "Escape" && (ctx = null)}
/>

{#snippet layerActions()}
  <MenuItem onClick={duplicateSelected}>
    <Icon name="copy" size={14} /> Duplicate
  </MenuItem>
  {#if picked.length === 1 && $editor.sel?.tag === TAG.group}
    <MenuItem onClick={ungroupSelected}>
      <Icon name="folder-open" size={14} /> Ungroup
    </MenuItem>
  {:else if canGroup}
    <MenuItem onClick={groupSelected}>
      <Icon name="folder" size={14} /> Group
    </MenuItem>
  {/if}
  <MenuItem danger onClick={deleteWidget}>
    <Icon name="trash" size={14} /> Delete
  </MenuItem>
{/snippet}

{#snippet treeNode(n: FaceNode, depth: number, parent: FaceNode | null)}
  {@const nodeIcon = tagIcons[n.tag] || "box"}
  <!-- reversed: subs order is draw order, so the last sub is the topmost layer and goes first -->
  {@const kids = (n.subs || []).filter((c) => c.subs || c.tag === TAG.struct).reverse()}
  <button
    type="button"
    class="node-row"
    class:selected={isPicked(n)}
    class:primary={$editor.sel === n && picked.length > 1}
    class:dragging={drag === n}
    class:drop-into={dropAt?.node === n && dropAt.into}
    class:drop-before={dropAt?.node === n && !dropAt.into && !dropAt.after}
    class:drop-after={dropAt?.node === n && !dropAt.into && dropAt.after}
    style="padding-inline-start: {0.5 + depth * 0.75}rem"
    draggable={!!parent}
    onclick={(e) => onRowClick(n, e)}
    oncontextmenu={(e) => onRowMenu(n, e)}
    ondragstart={(e) => onDragStart(n, e)}
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
    position: relative; /* the context menu is positioned inside it */
    display: flex;
    height: 100%;
    flex-direction: column;
  }
  /* same look as shared/components/menu, which can only anchor to its own trigger */
  .ctx-menu {
    position: absolute;
    z-index: 50;
    min-width: 11.25rem;
    padding: 0.25rem;
    display: flex;
    flex-direction: column;
    border-radius: var(--border-radius);
    background: var(--color-background);
    border: 1px solid oklch(from var(--color-text) l c h / 10%);
    box-shadow: 0 8px 24px oklch(0 0 0 / 12%);
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem;
    border-bottom: 1px solid oklch(from var(--color-text) l c h / 10%);
  }
  .tool-slot {
    display: inline-flex;
  }
  .spacer {
    flex: 1;
  }
  .list {
    flex: 1;
    overflow-y: auto;
    padding-block: 0.25rem;
    font-size: 0.75rem;
  }
  .empty {
    margin: 0;
    padding: 0.75rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  .node-row {
    display: flex;
    align-items: center;
    width: 100%;
    gap: 0.375rem;
    border: none;
    background: transparent;
    padding-block: 0.125rem;
    padding-inline-end: 0.5rem;
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
    /* the primary pick — the one the props panel edits — reads a notch stronger */
    &.primary {
      background: oklch(from var(--color-accent) l c h / 22%);
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
    /* dropping INTO a group — the whole row is the target, so outline it rather than edge it */
    &.drop-into {
      box-shadow: inset 0 0 0 2px oklch(from var(--color-accent) l c 100);
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
    width: 0.75rem;
    height: 0.75rem;
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
