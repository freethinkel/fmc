<script lang="ts">
  interface Props {
    name: string;
    size?: number;
  }
  const { name, size = 32 }: Props = $props();
  const initials = $derived(name.slice(0, 2).toUpperCase());
</script>

<span class="avatar" style:--size="{size}px">{initials}</span>

<style>
  .avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--size);
    height: var(--size);
    border-radius: calc(var(--border-radius) / 1.5);
    font-size: calc(var(--size) * 0.38);
    font-weight: 600;
    color: var(--color-accent);
    background: oklch(from var(--color-accent) l c h / 15%);
  }
</style>
