<script lang="ts">
  interface Props {
    name: string;
    size?: number;
    src?: string;
  }
  const { name, size = 32, src }: Props = $props();
  const initials = $derived(name.slice(0, 2).toUpperCase());
</script>

<span class="avatar" style:--size="{size}px">
  {#if src}<img {src} alt={name} />{:else}{initials}{/if}
</span>

<style>
  .avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--size);
    height: var(--size);
    overflow: hidden;
    border-radius: calc(var(--border-radius) / 1.5);
    font-size: calc(var(--size) * 0.38);
    font-weight: 600;
    color: var(--color-accent);
    background: oklch(from var(--color-accent) l c h / 15%);

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }
</style>
