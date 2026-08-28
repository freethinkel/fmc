<script lang="ts">
  interface Props {
    name: string;
    src?: string;
  }
  const { name, src }: Props = $props();
  const initials = $derived(name.slice(0, 2).toUpperCase());
</script>

<span class="avatar">
  {#if src}<img {src} alt={name} />{:else}{initials}{/if}
</span>

<style>
  .avatar {
    --size: var(--avatar-size, 2rem);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--size);
    height: var(--size);
    overflow: hidden;
    border-radius: 10em;
    font-size: calc(var(--size) * 0.38);
    font-weight: 600;
    background: var(--color-accent);
    color: light-dark(var(--color-text), var(--color-background));

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }
</style>
