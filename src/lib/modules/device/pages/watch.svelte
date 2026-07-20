<script>
	import { Button } from '$lib/shared/components/ui/button';
	import * as Card from '$lib/shared/components/ui/card/index.js';
	import { Badge } from '$lib/shared/components/ui/badge/index.js';
	import { Bluetooth, BatteryFull, Cpu, Hash, Zap, Eraser } from '@lucide/svelte';
	import { bleModel } from '../model';
	import { dialName, dialGroup } from '../lib/catalog-names';

	const { bleStatus, bleInfo, connectFx, forgetFx, dials } = bleModel;

	const connecting = connectFx.pending;
	const forgetting = forgetFx.pending;
	// какой циферблат реально активен, протокол не сообщает — показываем последний прошитый нами
	const lastFlashed = Number(localStorage.getItem('fmc_last_wfid') || 0);
</script>

<svelte:head><title>Watch — FCM Watchfaces</title></svelte:head>

<main class="flex flex-1 flex-col gap-4 overflow-y-auto p-4 lg:p-6">
	<!-- ponytail: не гейтим по navigator.bluetooth при рендере — Safari-полифилл инжектится позже; реальная проверка в ble.ts при клике -->
	{#if !$bleInfo}
		<Card.Root class="max-w-md">
			<Card.Header>
				<Card.Title>Connect your watch</Card.Title>
				<Card.Description>CMF Watch Pro 2 over Web Bluetooth.</Card.Description>
			</Card.Header>
			<Card.Content class="flex items-center gap-3">
				<Button onclick={() => connectFx().catch(() => {})} disabled={$connecting}>
					<Bluetooth class="size-4" /> {$connecting ? 'Connecting…' : 'Connect'}
				</Button>
				<Button variant="ghost" size="sm" onclick={() => forgetFx().catch(() => {})} disabled={$forgetting}
					title="Clear Chrome's device permission and the saved auth key — does not affect pairing state on the watch itself">
					<Eraser class="size-4" /> {$forgetting ? 'Forgetting…' : 'Forget device'}
				</Button>
				{#if $bleStatus}<span class="text-xs text-muted-foreground">{$bleStatus}</span>{/if}
			</Card.Content>
		</Card.Root>
	{:else}
		<Card.Root class="max-w-md">
			<Card.Header>
				<Card.Title>CMF Watch Pro 2</Card.Title>
				<Card.Description>{$bleStatus}</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-2 text-sm">
				<p class="flex items-center gap-2"><BatteryFull class="size-4 text-emerald-500" /> Battery: {$bleInfo.battery ?? '?'}%</p>
				<p class="flex items-center gap-2"><Cpu class="size-4 text-muted-foreground" /> Firmware: {$bleInfo.firmware ?? '?'}</p>
				<p class="flex items-center gap-2"><Hash class="size-4 text-muted-foreground" /> Serial: {$bleInfo.serial ?? '?'}</p>
				{#if lastFlashed}
					<p class="flex items-center gap-2"><Zap class="size-4 text-muted-foreground" /> Last flashed by us: <Badge variant="secondary">#{lastFlashed}</Badge></p>
				{/if}
			</Card.Content>
		</Card.Root>

		{#if $dials}
			<Card.Root class="max-w-md">
				<Card.Header>
					<Card.Title>Watchfaces on the watch</Card.Title>
					<Card.Description>
						Reported by the watch; side-loaded dials are not listed by the firmware.
					</Card.Description>
				</Card.Header>
				<Card.Content class="flex flex-col gap-4 text-sm">
					<div>
						<p class="mb-2 text-xs font-medium uppercase text-muted-foreground">Built-in ({$dials.builtin.length})</p>
						<div class="flex flex-wrap gap-1.5">
							{#each $dials.builtin as id (id)}
								<Badge variant="outline" title={dialGroup(id)}>{dialName(id)}</Badge>
							{/each}
						</div>
					</div>
					<div>
						<p class="mb-2 text-xs font-medium uppercase text-muted-foreground">Downloaded ({$dials.gallery.length})</p>
						<div class="flex flex-wrap gap-1.5">
							{#each $dials.gallery as id (id)}
								<Badge variant="outline" title={dialGroup(id)}>{dialName(id)}</Badge>
							{:else}
								<span class="text-xs text-muted-foreground">none</span>
							{/each}
						</div>
					</div>
				</Card.Content>
			</Card.Root>
		{/if}
	{/if}
</main>
