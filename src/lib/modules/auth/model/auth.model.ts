// Auth: effector wrapper around pb.authStore.
import { createEvent, createStore, sample } from "effector";
import { reset } from "patronum";
import type { AuthRecord } from "pocketbase";
import { pb, pbErrorMessage } from "$lib/shared/api";
import * as authApi from "./auth.api";

export type LoginForm = { email: string; password: string };
export type SignupForm = { name: string; email: string; password: string; confirm: string };

// stores
export const $user = createStore<AuthRecord>(pb.authStore.record);
export const $loginPending = authApi.loginFx.pending;
export const $oauthPending = authApi.oauthFx.pending;
export const $registerPending = authApi.registerFx.pending;
export const $registerErr = createStore("");
// shared between password login and oauth — the form shows one error line regardless of method
export const $loginErr = createStore("");
export const $loginForm = createStore<LoginForm>({ email: "", password: "" });
export const $signupForm = createStore<SignupForm>({
  name: "",
  email: "",
  password: "",
  confirm: "",
});

// events
const userChanged = createEvent<AuthRecord>();
export const logout = createEvent();
// effects (authApi.*) stay private to the model — components only dispatch these events
export const loginFormPatched = createEvent<Partial<LoginForm>>();
export const signupFormPatched = createEvent<Partial<SignupForm>>();
export const loginRequested = createEvent();
export const registerRequested = createEvent();
export const oauthRequested = createEvent<string>();
// cross-module signal (analytics counts signups) — exposed as an event, not the effect itself,
// so other models react without touching authApi. OAuth has no equivalent: the provider call is
// the same for a new account and a returning one.
export const registered = createEvent();

// business logic
pb.authStore.onChange(() => userChanged(pb.authStore.record));

sample({
  clock: userChanged,
  target: $user,
});

sample({
  clock: logout,
  target: authApi.logoutFx,
});

sample({
  clock: loginFormPatched,
  source: $loginForm,
  fn: (form, patch) => ({ ...form, ...patch }),
  target: $loginForm,
});
sample({
  clock: signupFormPatched,
  source: $signupForm,
  fn: (form, patch) => ({ ...form, ...patch }),
  target: $signupForm,
});

sample({
  clock: loginRequested,
  source: $loginForm,
  target: authApi.loginFx,
});

sample({
  clock: oauthRequested,
  target: authApi.oauthFx,
});

sample({
  clock: authApi.loginFx.failData,
  fn: (e) => pbErrorMessage(e, "email", "password"),
  target: $loginErr,
});
sample({
  clock: authApi.oauthFx.failData,
  fn: (e: Error) => `login: ${e.message}`,
  target: $loginErr,
});

// the browser checks each field on its own; only the pair is left to check here
const passwordsMatch = (f: SignupForm) => f.password === f.confirm;

sample({
  clock: registerRequested,
  source: $signupForm,
  fn: (f) => (passwordsMatch(f) ? "" : "Passwords do not match."),
  target: $registerErr,
});
sample({
  clock: registerRequested,
  source: $signupForm,
  filter: passwordsMatch,
  fn: ({ email, password, name }) => ({ email, password, name }),
  target: authApi.registerFx,
});

sample({
  clock: authApi.registerFx.done,
  fn: () => undefined,
  target: registered,
});

sample({
  clock: authApi.registerFx.failData,
  fn: (e) => pbErrorMessage(e, "email", "password"),
  target: $registerErr,
});

reset({ clock: [loginRequested, oauthRequested], target: $loginErr });
