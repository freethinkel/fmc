<script lang="ts">
  import "../theme.css";
  import "../app.css";
  import "$lib/styles/tokens.css";
  import favicon from "$lib/assets/favicon.svg";

  let { children } = $props();
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
