<script module lang="ts">
  /** One file per name in ./icons — tabler outline, inlined so the set is ours, not a dependency. */
  export type IconName =
    | "abc"
    | "align-bottom"
    | "align-center"
    | "align-left"
    | "align-middle"
    | "align-right"
    | "align-top"
    | "battery-full"
    | "bluetooth"
    | "box"
    | "braces"
    | "check"
    | "chevron-right"
    | "circle"
    | "clipboard"
    | "clipboard-check"
    | "clock-3"
    | "contrast"
    | "copy"
    | "cpu"
    | "crosshair"
    | "download"
    | "ellipsis"
    | "eraser"
    | "eye"
    | "eye-off"
    | "file-plus"
    | "film"
    | "folder"
    | "folder-heart"
    | "folder-input"
    | "folder-open"
    | "git-branch"
    | "globe"
    | "globe-lock"
    | "google"
    | "grip"
    | "hash"
    | "heart"
    | "help"
    | "image"
    | "image-plus"
    | "link"
    | "list-tree"
    | "loader"
    | "lock"
    | "lock-open"
    | "log-out"
    | "monitor"
    | "moon"
    | "pencil"
    | "play"
    | "plus"
    | "redo"
    | "save"
    | "scissors"
    | "search"
    | "sliders-horizontal"
    | "square-dashed"
    | "store"
    | "trash"
    | "type"
    | "undo"
    | "unlink"
    | "upload"
    | "upload-cloud"
    | "watch"
    | "x"
    | "zap";

  // eager: the whole set is ~20 kB of markup, and a lazily fetched icon pops in a frame late
  const ICONS = import.meta.glob("./icons/*.svg", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
</script>

<script lang="ts">
  interface Props {
    name: IconName;
    size?: number;
    color?: string;
    /** the outline set carries no fill — the liked heart asks for one */
    fill?: string;
    class?: string;
    // the tree panel's chevron is an icon that toggles a node
    onclick?: (event: MouseEvent) => void;
  }

  const { name, size = 24, color, fill = "none", class: cls, onclick }: Props = $props();
</script>

<span
  class="icon {cls ?? ''}"
  style:--size="{size}px"
  style:--fill={fill}
  style:color
  aria-hidden="true"
  {onclick}
>
  {@html ICONS[`./icons/${name}.svg`]}
</span>

<style>
  .icon {
    display: inline-flex;
  }
  .icon :global(svg) {
    width: var(--size);
    height: var(--size);
    fill: var(--fill);
  }
</style>
