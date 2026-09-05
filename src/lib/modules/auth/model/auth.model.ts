// Auth: effector wrapper around pb.authStore.
import { createEvent, createStore, sample } from "effector";
import { reset } from "patronum";
import type { AuthRecord } from "pocketbase";
import { pb } from "$lib/shared/api";
import * as authApi from "./auth.api";

// stores
export const $user = createStore<AuthRecord>(pb.authStore.record);
export const $loginPending = authApi.loginFx.pending;
export const $oauthPending = authApi.oauthFx.pending;
export const $registerPending = authApi.registerFx.pending;
export const $registerErr = createStore("");
// shared between password login and oauth — the form shows one error line regardless of method
export const $loginErr = createStore("");

// events
const userChanged = createEvent<AuthRecord>();
export const logout = createEvent();
// effects (authApi.*) stay private to the model — components only dispatch these events
export const loginRequested = createEvent<{
  email: string;
  password: string;
}>();
export const registerRequested = createEvent<{
  email: string;
  password: string;
  name?: string;
}>();
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
  clock: loginRequested,
  target: authApi.loginFx,
});

sample({
  clock: oauthRequested,
  target: authApi.oauthFx,
});

sample({
  clock: authApi.loginFx.failData,
  fn: (e: any) => e.data?.data?.email?.message || e.data?.data?.password?.message || e.message,
  target: $loginErr,
});
sample({
  clock: authApi.oauthFx.failData,
  fn: (e: Error) => `login: ${e.message}`,
  target: $loginErr,
});

sample({
  clock: registerRequested,
  target: authApi.registerFx,
});

sample({
  clock: authApi.registerFx.done,
  fn: () => undefined,
  target: registered,
});

sample({
  clock: authApi.registerFx.failData,
  fn: (e: any) => e.data?.data?.email?.message || e.data?.data?.password?.message || e.message,
  target: $registerErr,
});

reset({ clock: registerRequested, target: $registerErr });
reset({ clock: [loginRequested, oauthRequested], target: $loginErr });
