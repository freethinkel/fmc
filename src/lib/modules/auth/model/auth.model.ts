// Auth: effector wrapper around pb.authStore.
import { createEvent, createStore, sample } from 'effector';
import type { AuthRecord } from 'pocketbase';
import { pb } from '$lib/shared/api';
import * as authApi from './auth.api';

const userChanged = createEvent<AuthRecord>();
export const $user = createStore<AuthRecord>(pb.authStore.record);
sample({ clock: userChanged, target: $user });
pb.authStore.onChange(() => userChanged(pb.authStore.record));

export const logout = createEvent();
sample({ clock: logout, target: authApi.logoutFx });

// effects (authApi.*) stay private to the model — components only dispatch these events
export const loginRequested = createEvent<{ email: string; password: string }>();
sample({ clock: loginRequested, target: authApi.loginFx });
export const $loginPending = authApi.loginFx.pending;

export const oauthRequested = createEvent<string>();
sample({ clock: oauthRequested, target: authApi.oauthFx });
export const $oauthPending = authApi.oauthFx.pending;

// shared between password login and oauth — the form shows one error line regardless of method
export const $loginErr = createStore('').reset([loginRequested, oauthRequested]);
sample({
  clock: authApi.loginFx.failData,
  fn: (e: any) => e.data?.data?.email?.message || e.data?.data?.password?.message || e.message,
  target: $loginErr,
});
sample({ clock: authApi.oauthFx.failData, fn: (e: Error) => `login: ${e.message}`, target: $loginErr });

export const registerRequested = createEvent<{ email: string; password: string; name?: string }>();
sample({ clock: registerRequested, target: authApi.registerFx });
export const $registerPending = authApi.registerFx.pending;
export const $registerErr = createStore('').reset(registerRequested);
sample({
  clock: authApi.registerFx.failData,
  fn: (e: any) => e.data?.data?.email?.message || e.data?.data?.password?.message || e.message,
  target: $registerErr,
});
