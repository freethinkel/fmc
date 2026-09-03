<script lang="ts">
  import { Dialog } from "$lib/shared/components/dialog";
  import { Button } from "$lib/shared/components/button";
  import { Field } from "$lib/shared/components/field";
  import { Input } from "$lib/shared/components/input";
  import { Select } from "$lib/shared/components/select";
  import { Textarea } from "$lib/shared/components/textarea";
  import { authModel } from "$lib/modules/auth/model";
  import { marketModel } from "$lib/modules/market/model";
  import { DEVICES } from "$lib/modules/market/lib/devices";
  import { editorModel } from "../model";

  const { $user: user } = authModel;
  const {
    publishRequested,
    $savePending: busy,
    $publishDialogOpen: open,
    $publishForm: form,
    $publishEditing: editing,
    $publishReady: ready,
    publishFormPatched,
    publishDialogClosed,
  } = marketModel;
  const { buildCurrentBin, previewBlob } = editorModel;

  const DEVICE_OPTIONS = [
    { value: "", label: "Select a watch…" },
    ...DEVICES.map((d) => ({ value: d.value, label: d.label })),
  ];

  async function publish() {
    if (!$user) return;
    publishRequested({
      ...$form,
      ownerId: $user.id,
      published: true,
      bin: await buildCurrentBin(),
      preview: await previewBlob(),
    });
  }
</script>

<Dialog
  open={$open}
  title={$editing ? "Edit details" : "Publish to marketplace"}
  onClose={() => publishDialogClosed()}
>
  {#if !$editing}
    <p class="desc">The watchface will be visible to everyone.</p>
  {/if}
  <div class="fields">
    <Field label="Name">
      <Input value={$form.name} maxlength={100} onInput={(name) => publishFormPatched({ name })} />
    </Field>
    <Field label="Watch" hint="Sets the badge on your card and which device filter finds it.">
      <Select
        value={$form.device}
        options={DEVICE_OPTIONS}
        onChange={(device) => publishFormPatched({ device })}
      />
    </Field>
    <Field label="Description">
      <Textarea
        value={$form.description}
        rows={3}
        maxlength={1000}
        onInput={(description) => publishFormPatched({ description })}
      />
    </Field>
  </div>
  <div class="footer">
    <Button kind="ghost" onClick={() => publishDialogClosed()}>Cancel</Button>
    <Button kind="primary" disabled={$busy || !$ready} onClick={publish}>
      {$busy ? "Uploading…" : $editing ? "Save" : "Publish"}
    </Button>
  </div>
</Dialog>

<style>
  .desc {
    margin: 0 0 0.75rem;
    font-size: 0.75rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  .fields {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
  }
</style>
