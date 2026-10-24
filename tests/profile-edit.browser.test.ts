// The "Edit profile" panel's form lives in the profile model: it opens on the saved record, sends
// the name trimmed, closes on success, and on a failure stays open with the input intact.
import { test, expect } from "vitest";
import { ClientResponseError, type RecordModel } from "pocketbase";
import { allSettled, fork } from "effector";
import { authModel, profileModel } from "$lib/modules/auth/model";
import { updateProfileFx } from "$lib/modules/auth/model/auth.api";

const user = { id: "u1", name: "Old", bio: "", avatar: "" } as unknown as RecordModel;

test("opens on the saved record and saves a trimmed name", async () => {
  let sent: unknown;
  const scope = fork({
    values: [[authModel.$user, user]],
    handlers: [
      [updateProfileFx, (p: Parameters<typeof updateProfileFx>[0]) => ((sent = p), { ...user })],
    ],
  });

  await allSettled(profileModel.profileEditOpened, { scope });
  expect(scope.getState(profileModel.$profileForm)).toEqual({ name: "Old", bio: "" });

  await allSettled(profileModel.profileFormPatched, { scope, params: { name: "   " } });
  expect(scope.getState(profileModel.$profileReady)).toBe(false);

  await allSettled(profileModel.profileFormPatched, { scope, params: { name: "  New  " } });
  await allSettled(profileModel.profileSaveRequested, { scope });
  expect(sent).toEqual({ id: "u1", name: "New", bio: "" });
  expect(scope.getState(profileModel.$profileEditOpen)).toBe(false);
});

test("a failed save keeps the panel open with the input and shows the message", async () => {
  const scope = fork({
    values: [[authModel.$user, user]],
    handlers: [
      [
        updateProfileFx,
        () => {
          throw new ClientResponseError({
            response: { message: "bad", data: { avatar: { message: "File too large" } } },
          });
        },
      ],
    ],
  });

  await allSettled(profileModel.profileEditOpened, { scope });
  await allSettled(profileModel.profileFormPatched, { scope, params: { bio: "hi" } });
  await allSettled(profileModel.profileSaveRequested, { scope });
  expect(scope.getState(profileModel.$profileEditOpen)).toBe(true);
  expect(scope.getState(profileModel.$profileForm).bio).toBe("hi");
  expect(scope.getState(profileModel.$profileErr)).toBe("File too large");
});
