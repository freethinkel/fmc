<script lang="ts">
  // "Edit profile" on the user's own page: avatar, name, bio. Same shell as the Watch panel — a
  // drawer beside the rail on desktop, the swipeable sheet on the phone.
  import { AdaptivePopover } from "$lib/shared/components/adaptive-popover";
  import { Avatar } from "$lib/shared/components/avatar";
  import { Button } from "$lib/shared/components/button";
  import { Field } from "$lib/shared/components/field";
  import { Icon } from "$lib/shared/components/icon";
  import { Input } from "$lib/shared/components/input";
  import { Textarea } from "$lib/shared/components/textarea";
  import { profileModel } from "../model";

  const {
    BIO_MAX,
    $profileEditOpen: open,
    $profileForm: form,
    $profileErr: err,
    $profileSaving: saving,
    $profileReady: ready,
    $avatarSrc: avatarSrc,
    profileEditClosed,
    profileFormPatched,
    profileSaveRequested,
  } = profileModel;
</script>

<AdaptivePopover open={$open} title="Edit profile" onClose={() => profileEditClosed()}>
  <form
    onsubmit={(e) => {
      e.preventDefault();
      profileSaveRequested();
    }}
  >
    <div class="photo">
      <Avatar name={$form.name || "?"} src={$avatarSrc ?? undefined} />
      <div class="avatar-actions">
        <label class="pick">
          <Icon name="photo_camera" size={18} />
          Change photo
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onchange={(e) => {
              const file = e.currentTarget.files?.[0];

              if (file) profileFormPatched({ avatar: file });
              e.currentTarget.value = ""; // picking the same file again must fire again
            }}
          />
        </label>
        {#if $avatarSrc}
          <Button kind="ghost" size="small" onClick={() => profileFormPatched({ avatar: null })}>
            Remove
          </Button>
        {/if}
      </div>
    </div>

    <Field label="Name">
      <Input
        value={$form.name}
        required
        autocomplete="nickname"
        onInput={(name) => profileFormPatched({ name })}
      />
    </Field>
    <Field label="Bio" hint="{$form.bio.length} / {BIO_MAX}">
      <Textarea
        value={$form.bio}
        rows={4}
        maxlength={BIO_MAX}
        placeholder="A line or two about you and your faces"
        onInput={(bio) => profileFormPatched({ bio })}
      />
    </Field>

    {#if $err}<p class="error">{$err}</p>{/if}

    <div class="actions">
      <Button kind="ghost" onClick={() => profileEditClosed()}>Cancel</Button>
      <Button type="submit" disabled={!$ready || $saving}>
        {$saving ? "Saving…" : "Save"}
      </Button>
    </div>
  </form>
</AdaptivePopover>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .photo {
    display: flex;
    align-items: center;
    gap: 1rem;
    --avatar-size: 4rem;

    /* Avatar is a flex item here — don't let a narrow drawer squeeze it into an oval */
    > :global(*:first-child) {
      flex: none;
    }
  }
  .avatar-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }
  .pick {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    border-radius: 10em;
    background: oklch(from var(--color-text) l c h / 6%);
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;

    &:has(input:focus-visible) {
      outline: 2px solid var(--color-accent);
    }
    input {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
    }
  }
  .error {
    margin: 0;
    font-size: 0.75rem;
    color: var(--color-error);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
</style>
