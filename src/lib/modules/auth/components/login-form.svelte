<script lang="ts">
  import { Button } from "$lib/shared/components/button";
  import { Field } from "$lib/shared/components/field";
  import { Icon } from "$lib/shared/components/icon";
  import { Input } from "$lib/shared/components/input";
  import { authModel } from "../model";

  const { loginRequested, oauthRequested, $loginPending: busy, $loginErr: err } = authModel;

  let email = $state("");
  let password = $state("");
</script>

<form
  onsubmit={(e) => {
    e.preventDefault();
    loginRequested({ email, password });
  }}
>
  <Button type="button" kind="secondary" disabled={$busy} onClick={() => oauthRequested("google")}>
    <Icon name="google" size={16} />
    Login with Google
  </Button>
  <div class="divider"><span>Or continue with</span></div>
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
    <Input
      type="password"
      required
      minlength={8}
      autocomplete="current-password"
      bind:value={password}
    />
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
    gap: 0.75rem;
  }
  .divider {
    display: flex;
    align-items: center;
    gap: 0.5rem;

    &::before,
    &::after {
      content: "";
      flex: 1;
      height: 1px;
      background: oklch(from var(--color-text) l c h / 12%);
    }

    span {
      font-size: 0.625rem;
      color: oklch(from var(--color-text) l c h / 55%);
    }
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
