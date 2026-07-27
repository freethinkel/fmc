<script lang="ts">
  import { Button } from "$lib/shared/components/button";
  import { Field } from "$lib/shared/components/field";
  import { Input } from "$lib/shared/components/input";
  import { authModel } from "../model";

  const { registerRequested, $registerPending: busy, $registerErr: registerErr } = authModel;

  let name = $state("");
  let email = $state("");
  let password = $state("");
  let confirm = $state("");
  let mismatchErr = $state("");
  const err = $derived(mismatchErr || $registerErr);

  function submit(e: Event) {
    e.preventDefault();
    if (password !== confirm) {
      mismatchErr = "Passwords do not match.";
      return;
    }
    mismatchErr = "";
    registerRequested({ email, password, name });
  }
</script>

<form onsubmit={submit}>
  <Field label="Full Name">
    <Input type="text" placeholder="John Doe" required autocomplete="name" bind:value={name} />
  </Field>
  <Field label="Email">
    <Input
      type="email"
      placeholder="m@example.com"
      required
      autocomplete="email"
      bind:value={email}
    />
  </Field>
  <Field label="Password" hint="Must be at least 8 characters long.">
    <Input
      type="password"
      required
      minlength={8}
      autocomplete="new-password"
      bind:value={password}
    />
  </Field>
  <Field label="Confirm Password">
    <Input
      type="password"
      required
      minlength={8}
      autocomplete="new-password"
      bind:value={confirm}
    />
  </Field>
  {#if err}
    <p class="error">{err}</p>
  {/if}
  <Button type="submit" kind="primary" disabled={$busy}>Create Account</Button>
  <p class="link">Already have an account? <a href="/login">Sign in</a></p>
</form>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .error {
    margin: 0;
    font-size: 0.75rem;
    color: var(--color-error);
  }
  .link {
    margin: 0;
    text-align: center;
    font-size: 0.75rem;
    color: oklch(from var(--color-text) l c h / 55%);

    a {
      color: var(--color-accent);
    }
  }
</style>
