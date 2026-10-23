// The "Edit profile" panel on the user's own /user/[id] page: the form, the avatar preview and the
// save. The panel is a view over these stores.
import { attach, combine, createEffect, createEvent, createStore, sample } from "effector";
import { reset } from "patronum";
import { fileUrl } from "$lib/shared/api";
import * as authApi from "./auth.api";
import { $user } from "./auth.model";

export const BIO_MAX = 300; // duplicated in the PB schema (fmc_pocketbase users.bio)

/** `avatar`: undefined keeps the current one, null removes it, a File replaces it. */
export type ProfileForm = { name: string; bio: string; avatar?: File | null };

// ---- stores ----
export const $profileEditOpen = createStore(false);
export const $profileForm = createStore<ProfileForm>({ name: "", bio: "" });
/** object URL of the picked file, so the panel can show it before it is uploaded */
const $avatarPreview = createStore<string | null>(null);
export const $profileErr = createStore("");
export const $profileSaving = authApi.updateProfileFx.pending;
export const $profileReady = combine(
  $profileForm,
  (f) => f.name.trim().length > 0 && f.bio.length <= BIO_MAX,
);
/** what the panel's avatar shows: the pick, nothing after a removal, else the saved one */
export const $avatarSrc = combine($user, $profileForm, $avatarPreview, (user, form, preview) => {
  if (form.avatar === null) return null;
  if (form.avatar) return preview;
  return user?.avatar ? fileUrl(user, "avatar") : null;
});

// ---- events ----
export const profileEditOpened = createEvent();
export const profileEditClosed = createEvent();
export const profileFormPatched = createEvent<Partial<ProfileForm>>();
export const profileSaveRequested = createEvent();
/** the saved users record — market.model folds it into the profile on screen */
export const profileSaved = authApi.updateProfileFx.doneData;

// ---- effects ----
// swaps the preview URL, revoking the one it replaces so a run of picks doesn't leak blobs
const previewFx = attach({
  source: $avatarPreview,
  effect: createEffect(({ prev, file }: { prev: string | null; file?: File | null }) => {
    if (prev) URL.revokeObjectURL(prev);
    return file ? URL.createObjectURL(file) : null;
  }),
  mapParams: (file: File | null | undefined, prev) => ({ prev, file }),
});

// ---- business logic ----
sample({
  clock: profileEditOpened,
  fn: () => true,
  target: $profileEditOpen,
});
sample({
  clock: [profileEditClosed, authApi.updateProfileFx.done],
  fn: () => false,
  target: $profileEditOpen,
});
// every open starts from the saved record, so whatever a closed panel held is gone
sample({
  clock: profileEditOpened,
  source: $user,
  fn: (user): ProfileForm => ({ name: user?.name ?? "", bio: user?.bio ?? "" }),
  target: $profileForm,
});
sample({
  clock: profileFormPatched,
  source: $profileForm,
  fn: (form, patch) => ({ ...form, ...patch }),
  target: $profileForm,
});
sample({
  // null, not undefined: a store skips an undefined update, and the old preview would stay
  clock: $profileForm.map((f) => f.avatar ?? null),
  target: previewFx,
});
sample({
  clock: previewFx.doneData,
  target: $avatarPreview,
});

sample({
  clock: profileSaveRequested,
  source: { user: $user, form: $profileForm, ready: $profileReady },
  filter: ({ user, ready }) => Boolean(user) && ready,
  fn: ({ user, form }) => ({ id: user!.id, ...form, name: form.name.trim() }),
  target: authApi.updateProfileFx,
});
sample({
  clock: authApi.updateProfileFx.failData,
  fn: (e: any) =>
    e.data?.data?.avatar?.message ||
    e.data?.data?.name?.message ||
    e.data?.data?.bio?.message ||
    e.message,
  target: $profileErr,
});
reset({ clock: [profileEditOpened, profileSaveRequested], target: $profileErr });
