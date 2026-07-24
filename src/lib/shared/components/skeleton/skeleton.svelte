<script lang="ts">
  interface Props {
    width?: string;
    height?: string;
  }
  const { width = "100%", height = "16px" }: Props = $props();
</script>

<div class="skeleton" style:width style:height></div>

<style>
  .skeleton {
    border-radius: calc(var(--border-radius) / 2);
    background: oklch(from var(--color-text) l c h / 8%);
    animation: pulse 1.4s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.5;
    }
  }
</style>
