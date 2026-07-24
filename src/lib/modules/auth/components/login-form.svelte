<script lang="ts">
  import { Button } from "$lib/shared/components/button";
  import { Field } from "$lib/shared/components/field";
  import { Input } from "$lib/shared/components/input";
  import { authModel } from "../model";

  const { loginRequested, $loginPending: busy, $loginErr: err } = authModel;

  let email = $state("");
  let password = $state("");
</script>

<form
  onsubmit={(e) => {
    e.preventDefault();
    loginRequested({ email, password });
  }}
>
  <Field label="Email">
    <Input
      type="email"
      placeholder="m@example.com"
      required
      autocomplete="email"
      bind:value={email}
    />
  </Field>
  <Field label="Password">
    <Input type="password" required autocomplete="current-password" bind:value={password} />
  </Field>
  {#if $err}
    <p class="error">{$err}</p>
  {/if}
  <Button type="submit" kind="primary" disabled={$busy}>Login</Button>
  <p class="link">Don't have an account? <a href="/register">Sign up</a></p>
</form>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .error {
    margin: 0;
    font-size: 0.875rem;
    color: var(--color-error);
  }
  .link {
    margin: 0;
    text-align: center;
    font-size: 0.875rem;
    color: oklch(from var(--color-text) l c h / 55%);

    a {
      color: var(--color-accent);
    }
  }
</style>
