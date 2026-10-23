// Auth: PocketBase API effects.
import { createEffect } from "effector";
import { pb } from "$lib/shared/api";

export const oauthFx = createEffect((provider: string) =>
  pb.collection("users").authWithOAuth2({ provider }),
);

export const loginFx = createEffect(({ email, password }: { email: string; password: string }) =>
  pb.collection("users").authWithPassword(email, password),
);

export const registerFx = createEffect(
  async ({ email, password, name }: { email: string; password: string; name?: string }) => {
    await pb.collection("users").create({
      email,
      password,
      passwordConfirm: password,
      name: name || email.split("@")[0],
    });
    return pb.collection("users").authWithPassword(email, password);
  },
);

export const logoutFx = createEffect(() => pb.authStore.clear());

// avatar: a File replaces it, null removes it, undefined leaves it alone. The SDK switches the
// request to multipart on its own when the body holds a File, and — since this is the auth
// record — saves the answer into pb.authStore, which is what refreshes $user.
export const updateProfileFx = createEffect(
  ({ id, ...body }: { id: string; name: string; bio: string; avatar?: File | null }) =>
    pb.collection("users").update(id, body),
);
