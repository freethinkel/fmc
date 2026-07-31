<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";
  import { Button } from "$lib/shared/components/button";
  import { Icon, type IconName } from "$lib/shared/components/icon";
  import { Menu, MenuItem } from "$lib/shared/components/menu";
  import { TAG } from "../core/format";
  import { pickerLabel, describeConditions } from "../core/document/sources";
  import { contains, parentOf } from "../core/document/edits";
  import { framesOf, type Layer, type NodeId, type Screen } from "../core/document/doc";
  import { editorModel } from "../model";
  const {
    $doc: doc,
    $screen: screen,
    $sel: sel,
    $selected: selected,
    select,
    selectToggled,
    nodeAdded,
    slotAdded,
    aodRemoved,
    layerFlagsSet,
    widgetAdded,
    deleteRequested,
    duplicateRequested,
    copyRequested,
    cutRequested,
    pasteRequested,
    $clipboard: clipboard,
    groupRequested,
    ungroupRequested,
    moveRequested,
  } = editorModel;

  // A Doc layer is already interpreted, so the tree lists layers only — the struct/pivot/fmt/frame
  // rows the old TLV tree showed are fields on the layer now, edited in the inspector.
  const kindNames: Record<Layer["kind"], string> = {
    image: "Image",
    number: "Number",
    hand: "Hand",
    ring: "Progress ring",
    slot: "Widget slot",
    group: "Group",
    raw: "Node",
  };
  const kindIcons: Record<Layer["kind"], IconName> = {
    image: "image",
    number: "hash",
    hand: "clock-3",
    ring: "loader",
    slot: "square-dashed",
    group: "folder",
    raw: "box",
  };
  // the handful of raw tags that do turn up, so their rows aren't all called "Node"
  const rawNames: Record<number, string> = {
    [TAG.name]: "Name",
    [TAG.preview]: "Preview",
    [TAG.pvStruct]: "preview",
  };

  /** The derived label — what a layer is called until it is renamed. */
  export function layerLabel(l: Layer) {
    let s = l.kind === "raw" ? (rawNames[l.tag] ?? `0x${l.tag.toString(16)}`) : kindNames[l.kind];

    if (l.kind !== "group" && l.kind !== "raw" && l.meta.source)
      s += ` · ${pickerLabel(l.meta.source)}`;
    if (l.kind === "slot") s += ` · ${pickerLabel(l.metrics[l.active])}`;
    if (l.kind === "hand" && l.meta.source) s += ` · hand`;
    if (l.conditions.length) s += ` · ${describeConditions(l.conditions).join(", ")}`;
    return s;
  }

  // the file-backed layer kinds share one hidden input per kind, clicked from the Add menu —
  // a <label><input type=file> can't live inside a MenuItem's own <button>
  let fileInput = $state<Record<string, HTMLInputElement | undefined>>({});

  function onAdd(kind: "image" | "number" | "hand", e: Event) {
    const t = e.target as HTMLInputElement;
    const files = t.files;

    if (files?.length) widgetAdded({ kind, files: [...files] });
    t.value = "";
  }

  const currentScreen = $derived($doc?.screens.find((s) => s.kind === $screen) ?? null);
  const pickedIds = $derived(new Set($selected.map((l) => l.id)));
  const isPicked = (id: NodeId) => pickedIds.has(id);

  // grouping happens at screen level only, and one parent at a time — see groupRequested
  const canGroup = $derived.by(() => {
    if (!$doc || !$selected.length) return false;
    return $selected.every((l) => parentOf($doc, l.id) === null);
  });
  const selIsGroup = $derived($selected.length === 1 && $selected[0].kind === "group");

  // ponytail: a modifier click toggles one layer — shift does the same as ctrl rather than
  // selecting a range, which would need the visible rows flattened into a list first
  function onRowClick(id: NodeId, e: MouseEvent) {
    if (e.shiftKey || e.metaKey || e.ctrlKey) selectToggled(id);
    else select(id);
  }

  // Right-click menu, positioned at the pointer inside .tree-panel. Same actions as the
  // toolbar's "…" — declared once in the layerActions snippet below.
  let ctx = $state<{ x: number; y: number; screen?: boolean } | null>(null);

  const menuAt = (e: MouseEvent, screen = false) => {
    const r = (e.currentTarget as HTMLElement).closest(".tree-panel")!.getBoundingClientRect();

    ctx = { x: e.clientX - r.left, y: e.clientY - r.top, screen };
  };

  function onRowMenu(id: NodeId, e: MouseEvent) {
    e.preventDefault();
    if (!isPicked(id)) select(id); // right-clicking outside the selection moves it, like a file manager
    menuAt(e);
  }

  // The AOD root row is the screen itself, so its menu is about the screen, not a layer. The main
  // screen has no menu: a face without one has nothing to draw.
  function onScreenMenu(s: Screen, e: MouseEvent) {
    e.preventDefault();
    if (s.kind !== "aod") return;
    select(null);
    menuAt(e, true);
  }

  // The per-row eye/lock buttons act on that row alone; the menu entries below act on the whole
  // selection, keyed off the primary layer's current state.
  function toggleFlag(e: MouseEvent, l: Layer, key: "hidden" | "locked") {
    e.stopPropagation();
    layerFlagsSet({ ids: [l.id], patch: { [key]: !l[key] } });
  }

  const flagOfSelection = (key: "hidden" | "locked") =>
    layerFlagsSet({
      ids: $selected.map((l) => l.id),
      patch: { [key]: !$selected[0]?.[key] },
    });

  // Renaming: the row swaps for an input. The name is editor-only — the .bin has no string node
  // for a layer — so it lives as long as the document does and is lost on reload.
  let renaming = $state.raw<NodeId | null>(null);

  function commitRename(l: Layer, value: string) {
    const name = value.trim();

    renaming = null;
    if (name !== (l.name ?? "")) layerFlagsSet({ ids: [l.id], patch: { name: name || undefined } });
  }

  // accordion: closed by default, keyed by layer id — ids survive an immutable edit, object
  // references don't
  const openNodes = new SvelteSet<NodeId>();

  // reveal the selection: clicking a widget on the canvas must open the accordion down to its
  // row, otherwise the selected layer isn't even mounted
  $effect(() => {
    if (!$doc || !$sel) return;
    for (let p = parentOf($doc, $sel); p; p = parentOf($doc, p.id)) openNodes.add(p.id);
    if (currentScreen) openNodes.add(currentScreen.id);
  });

  function toggleOpen(id: NodeId, e: Event) {
    e.stopPropagation();
    if (openNodes.has(id)) openNodes.delete(id);
    else openNodes.add(id);
  }

  // Native HTML5 drag & drop. Three drop zones: the top/bottom quarter of a row reorders next to
  // it (across parents too — the model fixes the coordinates up), the middle of a *group* row
  // drops into that group.
  let drag = $state.raw<NodeId | null>(null);
  let dropAt = $state.raw<{ id: NodeId; after: boolean; into: boolean } | null>(null);

  function onDragStart(id: NodeId, e: DragEvent) {
    drag = id;
    e.dataTransfer?.setData("text/plain", ""); // Firefox needs payload to start a drag
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  }

  function onDragOver(l: Layer, e: DragEvent) {
    const dragged = drag && $doc ? findDragged() : null;

    // dropping a layer into its own subtree would detach it from the document
    if (!dragged || contains(dragged, l.id)) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const rel = (e.clientY - r.top) / r.height;

    // only a group's middle is a drop-into zone — nothing else can hold children
    dropAt = {
      id: l.id,
      after: rel > 0.5,
      into: l.kind === "group" && rel > 0.25 && rel < 0.75,
    };
  }

  const findDragged = () =>
    $doc && drag ? ($selected.find((l) => l.id === drag) ?? layerById(drag)) : null;

  function layerById(id: NodeId): Layer | null {
    const walk = (ls: readonly Layer[]): Layer | null => {
      for (const l of ls) {
        if (l.id === id) return l;
        const hit = walk(childrenOf(l));

        if (hit) return hit;
      }
      return null;
    };

    return $doc ? walk(currentScreen?.layers ?? []) : null;
  }

  const childrenOf = (l: Layer): readonly Layer[] =>
    l.kind === "group" ? l.children : l.kind === "raw" ? (l.children ?? []) : [];

  function onDrop(l: Layer, e: DragEvent) {
    e.preventDefault();
    // the list is reversed, so dropping visually below the target means earlier in layer order
    if (drag && dropAt?.id === l.id)
      moveRequested({ id: drag, target: l.id, after: !dropAt.after, into: dropAt.into });
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
          <Button kind="secondary" disabled={!$doc} onClick={toggle}>
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
      <MenuItem onClick={() => nodeAdded("ring")}>
        <Icon name="loader" size={14} /> Progress ring
      </MenuItem>
      <MenuItem onClick={() => nodeAdded("group")}>
        <Icon name="folder" size={14} /> Group
      </MenuItem>
      <MenuItem onClick={() => slotAdded()}>
        <Icon name="square-dashed" size={14} /> Widget slot
      </MenuItem>
    </Menu>
    <div class="spacer"></div>
    <Menu>
      {#snippet trigger({ toggle })}
        <span class="tool-slot" title="Selected layer">
          <Button kind="ghost" disabled={!$sel} onClick={toggle}>
            <Icon name="ellipsis" size={16} />
          </Button>
        </span>
      {/snippet}
      {@render layerActions()}
    </Menu>
  </div>
  <div class="list">
    {#if currentScreen}
      {@render screenRow(currentScreen)}
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
      {#if ctx.screen}
        <MenuItem danger onClick={aodRemoved}>
          <Icon name="trash" size={14} /> Delete AOD screen
        </MenuItem>
      {:else}
        {@render layerActions()}
      {/if}
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
  {#if $sel && $selected.length === 1}
    <MenuItem onClick={() => (renaming = $sel)}>
      <Icon name="pencil" size={14} /> Rename
    </MenuItem>
  {/if}
  <MenuItem onClick={duplicateRequested}>
    <Icon name="copy" size={14} /> Duplicate
  </MenuItem>
  <MenuItem onClick={copyRequested}>
    <Icon name="clipboard" size={14} /> Copy
  </MenuItem>
  <MenuItem onClick={cutRequested}>
    <Icon name="scissors" size={14} /> Cut
  </MenuItem>
  {#if $clipboard}
    <MenuItem onClick={pasteRequested}>
      <Icon name="clipboard-check" size={14} /> Paste
    </MenuItem>
  {/if}
  {#if selIsGroup}
    <MenuItem onClick={ungroupRequested}>
      <Icon name="folder-open" size={14} /> Ungroup
    </MenuItem>
  {:else if canGroup}
    <MenuItem onClick={groupRequested}>
      <Icon name="folder" size={14} /> Group
    </MenuItem>
  {/if}
  <MenuItem onClick={() => flagOfSelection("hidden")}>
    <Icon name={$selected[0]?.hidden ? "eye" : "eye-off"} size={14} />
    {$selected[0]?.hidden ? "Show" : "Hide"}
  </MenuItem>
  <MenuItem onClick={() => flagOfSelection("locked")}>
    <Icon name={$selected[0]?.locked ? "lock-open" : "lock"} size={14} />
    {$selected[0]?.locked ? "Unlock" : "Lock"}
  </MenuItem>
  <MenuItem danger onClick={deleteRequested}>
    <Icon name="trash" size={14} /> Delete
  </MenuItem>
{/snippet}

<!-- The screen is not a layer, so its row is its own thing: it can't be dragged, and it has no
     drop zone either. ponytail: moving a layer back out to the top level is done by dropping it
     next to another top-level row, which is how it already worked in practice. -->
{#snippet screenRow(s: Screen)}
  {@const kids = [...s.layers].reverse()}
  <button
    type="button"
    class="node-row"
    style="padding-inline-start: 0.5rem"
    onclick={() => select(null)}
    oncontextmenu={(e) => onScreenMenu(s, e)}
  >
    {#if kids.length}
      <Icon
        name="chevron-right"
        size={12}
        class={openNodes.has(s.id) ? "chevron open" : "chevron"}
        onclick={(e: MouseEvent) => toggleOpen(s.id, e)}
      />
    {:else}
      <span class="chevron-spacer"></span>
    {/if}
    <Icon name={s.kind === "aod" ? "moon" : "monitor"} size={14} class="node-icon" />
    <span class="label">{s.kind === "aod" ? "AOD" : "Screen"}</span>
  </button>
  {#if kids.length && openNodes.has(s.id)}
    {#each kids as l (l.id)}
      {@render treeNode(l, 1)}
    {/each}
  {/if}
{/snippet}

{#snippet treeNode(l: Layer, depth: number)}
  <!-- reversed: layer order is draw order, so the last one is topmost and goes first -->
  {@const kids = [...childrenOf(l)].reverse()}
  {#if renaming === l.id}
    <!-- an <input> can't live inside the row's own <button>, so the whole row swaps -->
    <div class="node-row" style="padding-inline-start: {0.5 + depth * 0.75}rem">
      <span class="chevron-spacer"></span>
      <Icon name={kindIcons[l.kind]} size={14} class="node-icon" />
      <input
        class="rename"
        value={l.name ?? ""}
        placeholder={layerLabel(l)}
        onblur={(e) => commitRename(l, e.currentTarget.value)}
        onkeydown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") renaming = null;
        }}
        {@attach (el: HTMLInputElement) => {
          el.focus();
          el.select();
        }}
      />
    </div>
  {:else}
    <button
      type="button"
      class="node-row"
      class:selected={isPicked(l.id)}
      class:primary={$sel === l.id && $selected.length > 1}
      class:dragging={drag === l.id}
      class:drop-into={dropAt?.id === l.id && dropAt.into}
      class:drop-before={dropAt?.id === l.id && !dropAt.into && !dropAt.after}
      class:drop-after={dropAt?.id === l.id && !dropAt.into && dropAt.after}
      style="padding-inline-start: {0.5 + depth * 0.75}rem"
      draggable="true"
      onclick={(e) => onRowClick(l.id, e)}
      ondblclick={() => (renaming = l.id)}
      oncontextmenu={(e) => onRowMenu(l.id, e)}
      ondragstart={(e) => onDragStart(l.id, e)}
      ondragover={(e) => onDragOver(l, e)}
      ondrop={(e) => onDrop(l, e)}
      ondragend={() => (drag = dropAt = null)}
    >
      {#if kids.length}
        <Icon
          name="chevron-right"
          size={12}
          class={openNodes.has(l.id) ? "chevron open" : "chevron"}
          onclick={(e: MouseEvent) => toggleOpen(l.id, e)}
        />
      {:else}
        <span class="chevron-spacer"></span>
      {/if}
      <Icon name={kindIcons[l.kind]} size={14} class="node-icon" />
      <span class="label">{l.name || layerLabel(l)}</span>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <span class="flags">
        <Icon
          name={l.hidden ? "eye-off" : "eye"}
          size={12}
          class={l.hidden ? "flag on" : "flag"}
          onclick={(e: MouseEvent) => toggleFlag(e, l, "hidden")}
        />
        <Icon
          name={l.locked ? "lock" : "lock-open"}
          size={12}
          class={l.locked ? "flag on" : "flag"}
          onclick={(e: MouseEvent) => toggleFlag(e, l, "locked")}
        />
      </span>
    </button>
  {/if}
  {#if kids.length && openNodes.has(l.id)}
    {#each kids as c (c.id)}
      {@render treeNode(c, depth + 1)}
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
  .flags {
    display: inline-flex;
    margin-inline-start: auto;
    gap: 0.25rem;
    padding-inline-start: 0.25rem;
  }
  /* a flag that is off only shows on hover — an eye and a padlock on every row is noise */
  :global(.flag) {
    flex-shrink: 0;
    opacity: 0;
    color: oklch(from var(--color-text) l c h / 55%);

    &:hover {
      opacity: 1;
    }
  }
  :global(.flag.on),
  .node-row:hover :global(.flag) {
    opacity: 0.75;
  }
  .rename {
    flex: 1;
    min-width: 0;
    border: none;
    background: transparent;
    padding: 0;
    font: inherit;
    color: var(--color-text);
    outline: none;
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
