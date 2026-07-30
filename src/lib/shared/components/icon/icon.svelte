<script lang="ts" module>
  import IconBrandGoogleFilled from "@tabler/icons-svelte/icons/brand-google-filled";
  import IconBuildingStore from "@tabler/icons-svelte/icons/building-store";
  import IconDeviceWatch from "@tabler/icons-svelte/icons/device-watch";
  import IconPencil from "@tabler/icons-svelte/icons/pencil";
  import IconLogout from "@tabler/icons-svelte/icons/logout";
  import IconArrowBackUp from "@tabler/icons-svelte/icons/arrow-back-up";
  import IconArrowForwardUp from "@tabler/icons-svelte/icons/arrow-forward-up";
  import IconX from "@tabler/icons-svelte/icons/x";
  import IconCheck from "@tabler/icons-svelte/icons/check";
  import IconFolderHeart from "@tabler/icons-svelte/icons/folder-heart";
  import IconBluetooth from "@tabler/icons-svelte/icons/bluetooth";
  import IconBattery4 from "@tabler/icons-svelte/icons/battery-4";
  import IconCpu from "@tabler/icons-svelte/icons/cpu";
  import IconHash from "@tabler/icons-svelte/icons/hash";
  import IconEraser from "@tabler/icons-svelte/icons/eraser";
  import IconLayoutAlignLeft from "@tabler/icons-svelte/icons/layout-align-left";
  import IconLayoutAlignCenter from "@tabler/icons-svelte/icons/layout-align-center";
  import IconLayoutAlignRight from "@tabler/icons-svelte/icons/layout-align-right";
  import IconLayoutAlignTop from "@tabler/icons-svelte/icons/layout-align-top";
  import IconLayoutAlignMiddle from "@tabler/icons-svelte/icons/layout-align-middle";
  import IconLayoutAlignBottom from "@tabler/icons-svelte/icons/layout-align-bottom";
  import IconDownload from "@tabler/icons-svelte/icons/download";
  import IconTypography from "@tabler/icons-svelte/icons/typography";
  import IconEye from "@tabler/icons-svelte/icons/eye";
  import IconEyeOff from "@tabler/icons-svelte/icons/eye-off";
  import IconLock from "@tabler/icons-svelte/icons/lock";
  import IconLockOpen from "@tabler/icons-svelte/icons/lock-open";
  import IconPhoto from "@tabler/icons-svelte/icons/photo";
  import IconContrast from "@tabler/icons-svelte/icons/contrast";
  import IconFolder from "@tabler/icons-svelte/icons/folder";
  import IconFolderOpen from "@tabler/icons-svelte/icons/folder-open";
  import IconPlus from "@tabler/icons-svelte/icons/plus";
  import IconDots from "@tabler/icons-svelte/icons/dots";
  import IconCopy from "@tabler/icons-svelte/icons/copy";
  import IconScissors from "@tabler/icons-svelte/icons/scissors";
  import IconClipboard from "@tabler/icons-svelte/icons/clipboard";
  import IconClipboardCheck from "@tabler/icons-svelte/icons/clipboard-check";
  import IconBraces from "@tabler/icons-svelte/icons/braces";
  import IconGitBranch from "@tabler/icons-svelte/icons/git-branch";
  import IconCrosshair from "@tabler/icons-svelte/icons/crosshair";
  import IconMovie from "@tabler/icons-svelte/icons/movie";
  import IconCircle from "@tabler/icons-svelte/icons/circle";
  import IconLoader2 from "@tabler/icons-svelte/icons/loader-2";
  import IconSquareDashed from "@tabler/icons-svelte/icons/square-dashed";
  import IconBox from "@tabler/icons-svelte/icons/box";
  import IconChevronRight from "@tabler/icons-svelte/icons/chevron-right";
  import IconPhotoPlus from "@tabler/icons-svelte/icons/photo-plus";
  import IconClockHour3 from "@tabler/icons-svelte/icons/clock-hour-3";
  import IconTrash from "@tabler/icons-svelte/icons/trash";
  import IconDeviceDesktop from "@tabler/icons-svelte/icons/device-desktop";
  import IconMoon from "@tabler/icons-svelte/icons/moon";
  import IconCloudUpload from "@tabler/icons-svelte/icons/cloud-upload";
  import IconBolt from "@tabler/icons-svelte/icons/bolt";
  import IconListTree from "@tabler/icons-svelte/icons/list-tree";
  import IconAdjustmentsHorizontal from "@tabler/icons-svelte/icons/adjustments-horizontal";
  import IconPlayerPlay from "@tabler/icons-svelte/icons/player-play";
  import IconDeviceFloppy from "@tabler/icons-svelte/icons/device-floppy";
  import IconFileImport from "@tabler/icons-svelte/icons/file-import";
  import IconFilePlus from "@tabler/icons-svelte/icons/file-plus";
  import IconHeart from "@tabler/icons-svelte/icons/heart";
  import IconSearch from "@tabler/icons-svelte/icons/search";
  import IconGlobe from "@tabler/icons-svelte/icons/globe";
  import IconGlobeOff from "@tabler/icons-svelte/icons/globe-off";
  import IconHelp from "@tabler/icons-svelte/icons/help";
  import IconLink from "@tabler/icons-svelte/icons/link";
  import IconUnlink from "@tabler/icons-svelte/icons/unlink";
  import IconGripVertical from "@tabler/icons-svelte/icons/grip-vertical";

  // Central icon registry — the single place to retune an icon app-wide.
  // Keys are OUR semantic names (used at call sites); values are Tabler components.
  // Non-obvious / approximate picks (no exact Tabler equivalent) are commented inline —
  // see .superpowers/sdd/icons-report.md for the full name mapping table.
  const ICONS = {
    google: IconBrandGoogleFilled, // filled variant reads better at button size than the outline
    store: IconBuildingStore,
    watch: IconDeviceWatch,
    pencil: IconPencil,
    "log-out": IconLogout,
    undo: IconArrowBackUp,
    redo: IconArrowForwardUp,
    x: IconX,
    check: IconCheck,
    "folder-heart": IconFolderHeart,
    bluetooth: IconBluetooth,
    "battery-full": IconBattery4, // no "full" battery in tabler — battery-4 is the fullest level
    cpu: IconCpu,
    hash: IconHash,
    eraser: IconEraser,
    "align-left": IconLayoutAlignLeft,
    "align-center": IconLayoutAlignCenter,
    "align-right": IconLayoutAlignRight,
    "align-top": IconLayoutAlignTop,
    "align-middle": IconLayoutAlignMiddle,
    "align-bottom": IconLayoutAlignBottom,
    download: IconDownload,
    type: IconTypography,
    eye: IconEye,
    "eye-off": IconEyeOff,
    lock: IconLock,
    "lock-open": IconLockOpen,
    image: IconPhoto,
    contrast: IconContrast,
    folder: IconFolder,
    "folder-open": IconFolderOpen,
    plus: IconPlus,
    ellipsis: IconDots,
    copy: IconCopy,
    scissors: IconScissors,
    clipboard: IconClipboard,
    "clipboard-check": IconClipboardCheck,
    braces: IconBraces,
    "git-branch": IconGitBranch,
    crosshair: IconCrosshair,
    film: IconMovie,
    circle: IconCircle,
    loader: IconLoader2,
    "square-dashed": IconSquareDashed,
    box: IconBox,
    "chevron-right": IconChevronRight,
    "image-plus": IconPhotoPlus,
    "clock-3": IconClockHour3,
    trash: IconTrash,
    monitor: IconDeviceDesktop,
    moon: IconMoon,
    "upload-cloud": IconCloudUpload,
    zap: IconBolt,
    "list-tree": IconListTree,
    "sliders-horizontal": IconAdjustmentsHorizontal,
    play: IconPlayerPlay,
    save: IconDeviceFloppy,
    "folder-input": IconFileImport, // no folder-input equivalent — file-import keeps the "arrow entering a container" import glyph
    "file-plus": IconFilePlus,
    heart: IconHeart,
    search: IconSearch,
    globe: IconGlobe,
    "globe-lock": IconGlobeOff, // no globe+lock icon in tabler — globe-off (same family as "globe") reads as "not public"
    help: IconHelp,
    link: IconLink, // aspect-ratio lock: chain link, like Figma's constrain-proportions toggle
    unlink: IconUnlink,
    grip: IconGripVertical,
  } as const;

  export type IconName = keyof typeof ICONS;
</script>

<script lang="ts">
  interface Props {
    name: IconName;
    size?: number;
    [key: string]: unknown;
  }

  let { name, size = 24, ...rest }: Props = $props();
  const Cmp = $derived(ICONS[name]);
</script>

<Cmp {size} {...rest} stroke={1.5} />
