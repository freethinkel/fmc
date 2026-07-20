<script>
  import * as Dialog from '$lib/shared/components/ui/dialog';
  import { Button } from '$lib/shared/components/ui/button';
  import { Input } from '$lib/shared/components/ui/input';
  import { Label } from '$lib/shared/components/ui/label';
  import { Textarea } from '$lib/shared/components/ui/textarea';
  import { goto } from '$app/navigation';
  import { authModel } from '$lib/modules/auth/model';
  import { marketModel } from '$lib/modules/market/model';
  import { editorModel } from '../model';

  const { user } = authModel;
  const { saveFx } = marketModel;
  const { editor, buildCurrentBin, previewBlob, errored } = editorModel;

  let { open = $bindable(false) } = $props();
  let name = $state('');
  let description = $state('');
  const busy = saveFx.pending;

  $effect(() => {
    if (open) name = $editor.face?.name || 'Custom';
  });

  async function publish() {
    try {
      await saveFx({
        name, description, ownerId: $user.id, published: true,
        bin: buildCurrentBin(), preview: await previewBlob(),
      });
      open = false;
      goto('/market');
    } catch (e) {
      errored(`publish: ${e.message}`);
      open = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-w-sm">
    <Dialog.Header>
      <Dialog.Title>Publish to marketplace</Dialog.Title>
      <Dialog.Description>The watchface will be visible to everyone.</Dialog.Description>
    </Dialog.Header>
    <div class="flex flex-col gap-3">
      <div class="flex flex-col gap-1.5">
        <Label for="pub-name">Name</Label>
        <Input id="pub-name" bind:value={name} maxlength={100} />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="pub-desc">Description</Label>
        <Textarea id="pub-desc" bind:value={description} rows={3} maxlength={1000} />
      </div>
    </div>
    <Dialog.Footer>
      <Button disabled={$busy || !name.trim()} onclick={publish}>
        {$busy ? 'Uploading…' : 'Publish'}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
