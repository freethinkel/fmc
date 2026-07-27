<script lang="ts">
  import { Card } from "$lib/shared/components/card";
  import SignupForm from "../components/signup-form.svelte";
  import { authModel } from "../model";
  import { goto } from "$app/navigation";

  const { $user: user } = authModel;
  // ponytail: already logged in — nothing to see on this page
  $effect(() => {
    if ($user) goto("/market");
  });
</script>

<svelte:head><title>Sign up — FMC Watchfaces</title></svelte:head>

<div class="wrapper">
  <div class="panel">
    <h1>Create your account</h1>
    <Card>
      <SignupForm />
    </Card>
  </div>
</div>

<style>
  .wrapper {
    display: grid;
    place-items: center;
    height: 100%;
  }
  .panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
    max-width: 23.75rem;
  }
  h1 {
    margin: 0;
    text-align: center;
    font-family: var(--font-display);
    font-size: 1.3125rem;
  }
</style>
