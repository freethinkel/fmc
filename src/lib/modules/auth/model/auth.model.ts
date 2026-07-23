// Auth: effector wrapper around pb.authStore.
import { createEffect, createEvent, createStore } from 'effector';
import type { AuthRecord } from 'pocketbase';
import { pb } from '$lib/shared/api';

const userChanged = createEvent<AuthRecord>();
export const user = createStore<AuthRecord>(pb.authStore.record).on(userChanged, (_, u) => u);
pb.authStore.onChange(() => userChanged(pb.authStore.record));

export const oauthFx = createEffect((provider: string) =>
  pb.collection('users').authWithOAuth2({ provider }));
export const loginFx = createEffect(({ email, password }: { email: string; password: string }) =>
  pb.collection('users').authWithPassword(email, password));
export const registerFx = createEffect(
  async ({ email, password, name }: { email: string; password: string; name?: string }) => {
    await pb.collection('users').create({
      email, password, passwordConfirm: password, name: name || email.split('@')[0],
    });
    return pb.collection('users').authWithPassword(email, password);
  });

export const logout = createEvent();
logout.watch(() => pb.authStore.clear());
