// The login and signup forms live in the auth model: a mismatched confirmation never reaches
// PocketBase, and a rejected field comes back as its own message.
import { test, expect } from "vitest";
import { allSettled, fork } from "effector";
import { ClientResponseError } from "pocketbase";
import { authModel } from "$lib/modules/auth/model";
import { loginFx, registerFx } from "$lib/modules/auth/model/auth.api";

const form = { name: "Ann", email: "a@b.c", password: "12345678", confirm: "12345679" };

test("signup checks the confirmation before sending, then sends the form", async () => {
  const sent: unknown[] = [];
  const scope = fork({ handlers: [[registerFx, (p: unknown) => (sent.push(p), null)]] });

  await allSettled(authModel.signupFormPatched, { scope, params: form });
  await allSettled(authModel.registerRequested, { scope });
  expect(sent).toEqual([]);
  expect(scope.getState(authModel.$registerErr)).toBe("Passwords do not match.");

  await allSettled(authModel.signupFormPatched, { scope, params: { confirm: form.password } });
  await allSettled(authModel.registerRequested, { scope });
  expect(sent).toEqual([{ name: "Ann", email: "a@b.c", password: "12345678" }]);
  expect(scope.getState(authModel.$registerErr)).toBe("");
});

test("a rejected login shows the field's message, else the error's own", async () => {
  let err: Error = new ClientResponseError({
    response: { message: "Failed to authenticate.", data: { email: { message: "Bad email." } } },
  });
  const scope = fork({
    handlers: [
      [
        loginFx,
        () => {
          throw err;
        },
      ],
    ],
  });

  await allSettled(authModel.loginFormPatched, { scope, params: { email: "x" } });
  await allSettled(authModel.loginRequested, { scope });
  expect(scope.getState(authModel.$loginErr)).toBe("Bad email.");

  err = new TypeError("Failed to fetch");
  await allSettled(authModel.loginRequested, { scope });
  expect(scope.getState(authModel.$loginErr)).toBe("Failed to fetch");
});
