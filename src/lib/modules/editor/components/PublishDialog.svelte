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
    $openedWf: openedWf,
    publishDialogClosed,
  } = marketModel;
  const { $doc: doc, buildCurrentBin, previewBlob } = editorModel;

  let name = $state("");
  let description = $state("");
  // Deliberately not defaulted to the Watch Pro 2: the editor renders both watches identically
  // (same 466x466 panel), so guessing here would re-create exactly the mislabelling this field
  // exists to end. Publish stays disabled until the creator says which watch they drew for.
  let device = $state("");
  const DEVICE_OPTIONS = [
    { value: "", label: "Select a watch…" },
    ...DEVICES.map((d) => ({ value: d.value, label: d.label })),
  ];

  $effect(() => {
    if ($open) {
      name = $doc?.name || "Custom";
      // re-publishing an own face keeps the device it already carries
      device = typeof $openedWf?.device === "string" ? $openedWf.device : "";
    }
  });

  async function publish() {
    if (!$user) return;
    publishRequested({
      name,
      description,
      device,
      ownerId: $user.id,
      published: true,
      bin: await buildCurrentBin(),
      preview: await previewBlob(),
    });
  }
</script>

<Dialog open={$open} title="Publish to marketplace" onClose={() => publishDialogClosed()}>
  <p class="desc">The watchface will be visible to everyone.</p>
  <div class="fields">
    <Field label="Name">
      <Input bind:value={name} maxlength={100} />
    </Field>
    <Field label="Watch" hint="Sets the badge on your card and which device filter finds it.">
      <Select bind:value={device} options={DEVICE_OPTIONS} />
    </Field>
    <Field label="Description">
      <Textarea bind:value={description} rows={3} maxlength={1000} />
    </Field>
  </div>
  <div class="footer">
    <Button kind="ghost" onClick={() => publishDialogClosed()}>Cancel</Button>
    <Button kind="primary" disabled={$busy || !name.trim() || !device} onClick={publish}>
      {$busy ? "Uploading…" : "Publish"}
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
