<script>
	import { cn } from "$lib/shared/helpers";
	import { Button } from "$lib/shared/components/ui/button/index.js";
	import * as Card from "$lib/shared/components/ui/card/index.js";
	import * as Field from "$lib/shared/components/ui/field/index.js";
	import { Input } from "$lib/shared/components/ui/input/index.js";
	import { authModel } from "../model";
	const { registerFx } = authModel;
	import { goto } from "$app/navigation";

	let { class: className, ...restProps } = $props();

	let name = $state("");
	let email = $state("");
	let password = $state("");
	let confirm = $state("");
	let err = $state("");
	const busy = registerFx.pending;

	async function submit(e) {
		e.preventDefault();
		if (password !== confirm) {
			err = "Passwords do not match.";
			return;
		}
		err = "";
		try {
			await registerFx({ email, password, name });
			goto("/market");
		} catch (e) {
			err = e.data?.data?.email?.message || e.data?.data?.password?.message || e.message;
		}
	}
</script>

<div class={cn("flex flex-col gap-6", className)} {...restProps}>
	<Card.Root>
		<Card.Header class="text-center">
			<Card.Title class="text-xl">Create your account</Card.Title>
			<Card.Description>Enter your email below to create your account</Card.Description>
		</Card.Header>
		<Card.Content>
			<form onsubmit={submit}>
				<Field.Group>
					<Field.Field>
						<Field.Label for="name">Full Name</Field.Label>
						<Input id="name" type="text" placeholder="John Doe" required autocomplete="name" bind:value={name} />
					</Field.Field>
					<Field.Field>
						<Field.Label for="email">Email</Field.Label>
						<Input id="email" type="email" placeholder="m@example.com" required autocomplete="email" bind:value={email} />
					</Field.Field>
					<Field.Field>
						<Field.Field class="grid grid-cols-2 gap-4">
							<Field.Field>
								<Field.Label for="password">Password</Field.Label>
								<Input id="password" type="password" required minlength={8} autocomplete="new-password" bind:value={password} />
							</Field.Field>
							<Field.Field>
								<Field.Label for="confirm-password">Confirm Password</Field.Label>
								<Input id="confirm-password" type="password" required minlength={8} autocomplete="new-password" bind:value={confirm} />
							</Field.Field>
						</Field.Field>
						<Field.Description>Must be at least 8 characters long.</Field.Description>
					</Field.Field>
					{#if err}
						<p class="text-destructive text-sm">{err}</p>
					{/if}
					<Field.Field>
						<Button type="submit" disabled={$busy}>Create Account</Button>
						<Field.Description class="text-center">
							Already have an account? <a href="/login">Sign in</a>
						</Field.Description>
					</Field.Field>
				</Field.Group>
			</form>
		</Card.Content>
	</Card.Root>
</div>
