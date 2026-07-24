<script>
  import { Input } from '$lib/shared/components/ui/input';
  import { Label } from '$lib/shared/components/ui/label';
  import { Switch } from '$lib/shared/components/ui/switch';
  import { Button } from '$lib/shared/components/ui/button';
  import { ID_LABELS } from '../lib/render';
  import { editorModel } from '../model';
  const { $editor: editor, simPatched, overrideSet } = editorModel;

  // default for the baked-in sentinel color (see cmf-format-reference.md "Accent color
  // sentinel") — just shown in the picker until the user picks their own
  const ACCENT_DEFAULT = '#ff2c00';

  const fields = [
    ['steps', 'steps'], ['hr', 'heart rate'], ['battery', 'battery'],
    ['calories', 'kcal'], ['temp', 'temp °'], ['distance', 'distance, m'],
    ['stepsGoal', 'steps goal'], ['calGoal', 'kcal goal'], ['stands', 'stand hrs'],
  ];

  function localISO(t) {
    return new Date(t - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19);
  }
</script>

<div class="space-y-3 text-sm">
  <div class="flex items-center gap-2">
    <Switch checked={$editor.sim.live} onCheckedChange={v => simPatched({ live: v })} id="live" /><Label for="live">live time</Label>
  </div>
  {#if !$editor.sim.live}
    <Input class="h-8" type="datetime-local" step="1" value={localISO($editor.sim.time)}
      oninput={e => simPatched({ time: new Date(e.target.value).getTime() })} />
  {/if}
  <div class="flex items-center gap-2">
    <Switch checked={$editor.sim.is24h} onCheckedChange={v => simPatched({ is24h: v })} id="h24" /><Label for="h24">24-hour format</Label>
  </div>
  <div class="flex items-center gap-2">
    <Switch checked={$editor.sim.showSlotPlaceholders} onCheckedChange={v => simPatched({ showSlotPlaceholders: v })} id="slotph" />
    <Label for="slotph">widget-slot placeholders</Label>
  </div>
  <div>
    <Label class="text-xs text-muted-foreground">Accent color</Label>
    <div class="mt-0.5 flex items-center gap-2">
      <input type="color" class="h-8 w-12 cursor-pointer rounded border" value={$editor.sim.accentColor || ACCENT_DEFAULT}
        oninput={e => simPatched({ accentColor: e.target.value })} title="Watch accent color (recolors widgets flagged via meta[7]===4, see metaInfo in lib/render.ts)" />
      {#if $editor.sim.accentColor}
        <Button size="sm" variant="ghost" class="h-8" onclick={() => simPatched({ accentColor: null })}>Reset</Button>
      {/if}
    </div>
  </div>
  <div class="grid grid-cols-2 gap-x-3 gap-y-2">
    {#each fields as [key, label]}
      <div>
        <Label class="text-xs text-muted-foreground">{label}</Label>
        <Input class="mt-0.5 h-8" type="number" value={$editor.sim[key]}
          oninput={e => simPatched({ [key]: e.target.value === '' ? '' : +e.target.value })} />
      </div>
    {/each}
  </div>

  {#if $editor.ids.length}
    <h3 class="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Data sources</h3>
    <div class="space-y-1.5">
      {#each $editor.ids as { id, max }}
        <div class="flex items-center gap-2">
          <Label class="w-36 truncate font-mono text-xs">0x{id.toString(16)} {ID_LABELS[id] || '?'}</Label>
          <Input class="h-7 w-24" type="number" placeholder="auto" value={$editor.sim.overrides[id] ?? ''}
            oninput={e => overrideSet({ id, value: e.target.value })} />
          {#if max}<span class="text-xs text-muted-foreground">/{max}</span>{/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
