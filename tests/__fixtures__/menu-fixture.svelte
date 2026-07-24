<script lang="ts">
  import { Menu, MenuItem } from "$lib/shared/components/menu";
</script>

<button data-testid="outside">outside</button>
<Menu>
  {#snippet trigger({ toggle })}
    <button data-testid="trigger" onclick={toggle}>open</button>
  {/snippet}
  <MenuItem onClick={() => {}}>Item A</MenuItem>
</Menu>
