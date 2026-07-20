<script>
	import { goto } from '$app/navigation';

	// hands start at real time: negative delay offsets the animation
	const now = new Date();
	const s = now.getSeconds();
	const m = now.getMinutes() * 60 + s;
	const h = (now.getHours() % 12) * 3600 + m;
</script>

<svelte:head><title>FMC Watchfaces — watchface editor for CMF Watch Pro 2</title></svelte:head>

<div class="min-h-screen overflow-hidden bg-[#0a0a0a] text-zinc-200">
	<!-- dot grid -->
	<div class="pointer-events-none fixed inset-0 opacity-40"
		style="background-image: radial-gradient(circle, #27272a 1px, transparent 1px); background-size: 28px 28px;">
	</div>
	<!-- orange glow -->
	<div class="pointer-events-none fixed -right-40 top-1/4 size-[600px] rounded-full bg-cmf/10 blur-[120px]"></div>

	<header class="relative z-10 flex items-center justify-between px-6 py-5 md:px-12">
		<span class="font-display text-sm font-bold tracking-widest">FMC<span class="text-cmf">·</span>WF</span>
		<nav class="flex gap-6 font-mono text-xs text-zinc-400">
			<a href="/market" class="transition-colors hover:text-cmf">marketplace</a>
			<a href="/editor" class="transition-colors hover:text-cmf">editor</a>
		</nav>
	</header>

	<main class="relative z-10 mx-auto grid max-w-6xl items-center gap-16 px-6 pb-24 pt-12 md:grid-cols-[1.2fr_1fr] md:px-12 md:pt-24">
		<section>
			<p class="mb-6 font-mono text-xs uppercase tracking-[0.3em] text-cmf">
				CMF Watch Pro 2 · .bin · Web Bluetooth
			</p>
			<h1 class="font-display text-4xl font-black leading-[1.05] text-white md:text-6xl">
				Your own<br />watchface.<br /><span class="text-cmf">In one evening.</span>
			</h1>
			<p class="mt-6 max-w-md text-sm leading-relaxed text-zinc-400">
				Open any .bin, drag widgets around, watch the live preview — then flash it to the
				watch straight from the browser. Or publish it to the marketplace and collect likes.
			</p>
			<div class="mt-10 flex flex-wrap gap-4">
				<button onclick={() => goto('/editor')}
					class="bg-cmf px-7 py-3 font-mono text-sm font-medium text-black transition-transform hover:-translate-y-0.5">
					Open the editor →
				</button>
				<button onclick={() => goto('/market')}
					class="border border-zinc-700 px-7 py-3 font-mono text-sm text-zinc-300 transition-colors hover:border-cmf hover:text-cmf">
					Marketplace
				</button>
			</div>
		</section>

		<!-- CSS watch -->
		<section class="flex justify-center">
			<div class="relative aspect-square w-72 rounded-full border border-zinc-800 bg-black shadow-[0_0_0_10px_#18181b,0_0_80px_rgba(255,92,0,0.15)] md:w-80">
				<!-- minute ticks -->
				<div class="absolute inset-2 rounded-full"
					style="background: repeating-conic-gradient(#3f3f46 0deg 0.6deg, transparent 0.6deg 30deg); mask: radial-gradient(circle closest-side, transparent 87%, black 88%);">
				</div>
				<div class="absolute inset-0 grid place-items-center">
					<span class="mt-24 font-mono text-[10px] tracking-[0.4em] text-zinc-600">FMC·WF</span>
				</div>
				{#each [{ len: 26, w: 4, dur: 43200, off: h, cls: 'bg-zinc-300' }, { len: 36, w: 3, dur: 3600, off: m, cls: 'bg-zinc-400' }, { len: 42, w: 1, dur: 60, off: s, cls: 'bg-cmf' }] as hand}
				<div class="absolute left-1/2 top-1/2 origin-bottom rounded-full {hand.cls}"
					style="width: {hand.w}px; height: {hand.len}%; translate: -50% -100%; animation: spin {hand.dur}s linear infinite; animation-delay: -{hand.off}s;">
				</div>
				{/each}
				<div class="absolute left-1/2 top-1/2 size-3 -translate-1/2 rounded-full border-2 border-cmf bg-black"></div>
			</div>
		</section>
	</main>

	<section class="relative z-10 border-t border-zinc-900">
		<div class="mx-auto grid max-w-6xl gap-px bg-zinc-900 px-0 md:grid-cols-3">
			{#each [
				{ n: '01', t: 'Editor in the browser', d: 'Drag & drop, undo/redo, live preview with hands and simulated data.' },
				{ n: '02', t: 'Marketplace', d: 'Publish watchfaces, collect likes and downloads, remix others as a base.' },
				{ n: '03', t: 'Flash over BLE', d: 'Push the .bin to the watch right from the tab — no wires, no toolchains.' }
			] as f}
				<article class="group bg-[#0a0a0a] p-8 transition-colors hover:bg-[#0f0f0f]">
					<p class="font-mono text-xs text-cmf">{f.n}</p>
					<h3 class="mt-3 font-display text-sm font-bold text-white">{f.t}</h3>
					<p class="mt-3 text-xs leading-relaxed text-zinc-500">{f.d}</p>
				</article>
			{/each}
		</div>
	</section>

	<footer class="relative z-10 border-t border-zinc-900 px-6 py-6 md:px-12">
		<p class="font-mono text-[10px] tracking-widest text-zinc-600">
			FMC WATCHFACES — unofficial tooling for CMF Watch Pro 2
		</p>
	</footer>
</div>

<style>
	/* -global-: referenced from inline styles, must not be scoped */
	@keyframes -global-spin {
		to { rotate: 360deg; }
	}
</style>
