<script>
	import SignupForm from "../components/signup-form.svelte";
	import { authModel } from "../model";
	import { goto } from "$app/navigation";

	const { $user: user } = authModel;
	// ponytail: already logged in — nothing to see on this page
	$effect(() => { if ($user) goto("/market"); });
</script>

<svelte:head><title>Sign up — FMC Watchfaces</title></svelte:head>

<div class="bg-muted flex flex-1 items-center justify-center overflow-y-auto p-6 md:p-10">
	<SignupForm class="w-full max-w-sm" />
</div>
