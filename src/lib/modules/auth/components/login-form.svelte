<script>
	import { Button } from "$lib/shared/components/ui/button/index.js";
	import * as Card from "$lib/shared/components/ui/card/index.js";
	import {
		FieldGroup,
		Field,
		FieldLabel,
		FieldDescription,
		FieldSeparator,
	} from "$lib/shared/components/ui/field/index.js";
	import { Input } from "$lib/shared/components/ui/input/index.js";
	import { cn } from "$lib/shared/helpers";
	import { authModel } from "../model";
	const { loginFx, oauthFx } = authModel;
	import { goto } from "$app/navigation";
	let { class: className, ...restProps } = $props();

	const id = $props.id();

	let email = $state("");
	let password = $state("");
	let err = $state("");
	const busy = loginFx.pending;

	async function go() {
		err = "";
		try {
			await loginFx({ email, password });
			goto("/market");
		} catch (e) {
			err = e.data?.data?.email?.message || e.data?.data?.password?.message || e.message;
		}
	}

	async function oauth(provider) {
		err = "";
		try {
			await oauthFx(provider);
			goto("/market");
		} catch (e) {
			err = `login: ${e.message}`;
		}
	}
</script>

<div class={cn("flex flex-col gap-6", className)} {...restProps}>
	<Card.Root>
		<Card.Header class="text-center">
			<Card.Title class="text-xl">Welcome back</Card.Title>
			<Card.Description>Login with your Google account</Card.Description>
		</Card.Header>
		<Card.Content>
			<form onsubmit={(e) => { e.preventDefault(); go(); }}>
				<FieldGroup>
					<Field>
						<Button variant="outline" type="button" disabled={$busy} onclick={() => oauth("google")}>
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
								<path
									d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
									fill="currentColor"
								/>
							</svg>
							Login with Google
						</Button>
					</Field>
					<FieldSeparator class="*:data-[slot=field-separator-content]:bg-card">
						Or continue with
					</FieldSeparator>
					<Field>
						<FieldLabel for="email-{id}">Email</FieldLabel>
						<Input id="email-{id}" type="email" placeholder="m@example.com" required autocomplete="email" bind:value={email} />
					</Field>
					<Field>
						<FieldLabel for="password-{id}">Password</FieldLabel>
						<Input id="password-{id}" type="password" required minlength={8} autocomplete="current-password" bind:value={password} />
					</Field>
					{#if err}
						<p class="text-destructive text-sm">{err}</p>
					{/if}
					<Field>
						<Button type="submit" disabled={$busy}>Login</Button>
						<FieldDescription class="text-center">
							Don't have an account? <a href="/register">Sign up</a>
						</FieldDescription>
					</Field>
				</FieldGroup>
			</form>
		</Card.Content>
	</Card.Root>
</div>
