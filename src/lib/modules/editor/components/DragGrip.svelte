<script lang="ts">
  // A touch drag handle for a reorderable list. Mobile browsers don't start an HTML5 drag from a
  // touch (or hide it behind a long press that also opens the context menu), so the grip drives
  // the drag with pointer events instead. The pointer is captured, so the move/up events keep
  // coming here wherever the finger goes, and only the finger that went down counts — a second
  // one lifting doesn't drop. The owner sees the row under the finger and a drop/cancel at the end.
  import { Icon } from "$lib/shared/components/icon";

  interface Props {
    /** selector of the rows the grip can be dropped on */
    rows: string;
    size?: number;
    /** show on a fine pointer too — by default only a coarse one gets the grip */
    always?: boolean;
    onStart: () => void;
    onMove: (row: HTMLElement | null, y: number) => void;
    /** `drop` is false on a cancel: the gesture was taken over (scroll, system UI, lost capture) */
    onEnd: (drop: boolean) => void;
  }

  const { rows, size = 20, always = false, onStart, onMove, onEnd }: Props = $props();
  let pointer: number | null = null;

  function down(e: PointerEvent) {
    if (pointer !== null) return;
    e.preventDefault(); // no text selection or emulated mouse events from this touch
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointer = e.pointerId;
    onStart();
  }

  function move(e: PointerEvent) {
    if (e.pointerId !== pointer) return;
    const row = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>(rows);

    onMove(row ?? null, e.clientY);
  }

  function end(e: PointerEvent) {
    if (e.pointerId !== pointer) return;
    pointer = null;
    onEnd(e.type === "pointerup");
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<span
  class="grip"
  class:always
  onpointerdown={down}
  onpointermove={move}
  onpointerup={end}
  onpointercancel={end}
  onlostpointercapture={end}
  oncontextmenu={(e) => {
    // a long press on the grip is the drag, not the row's context menu
    e.preventDefault();
    e.stopPropagation();
  }}
>
  <Icon name="drag_indicator" {size} />
</span>

<style>
  .grip {
    display: none;
    flex-shrink: 0;
    touch-action: none; /* the finger drags the row, not the list */
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none; /* iOS: no callout on a long press */
    color: oklch(from var(--color-text) l c h / 55%);
    cursor: grab;

    /* any-, not plain pointer: a touch laptop or an iPad with a trackpad has a touchscreen too */
    @media (any-pointer: coarse) {
      display: inline-flex;
    }
    &.always {
      display: inline-flex;
    }
  }
</style>
