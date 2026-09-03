// The publish dialog's form lives in the market model. A first publish must name the watch; editing
// an already-published face must not, or most of the marketplace (which predates the field) could
// never have a typo fixed. Both start from the record so a re-publish wipes nothing.
import { test, expect } from "vitest";
import type { RecordModel } from "pocketbase";
import { allSettled, fork } from "effector";
import { authModel } from "$lib/modules/auth/model";
import { marketModel } from "$lib/modules/market/model";

const user = { id: "u1" } as unknown as RecordModel;

test("a first publish waits for a device", async () => {
  const scope = fork({ values: [[authModel.$user, user]] });

  await allSettled(marketModel.publishDialogOpened, { scope });
  expect(scope.getState(marketModel.$publishReady)).toBe(false);

  await allSettled(marketModel.publishFormPatched, { scope, params: { device: "watch_pro_2" } });
  expect(scope.getState(marketModel.$publishReady)).toBe(true);
});

test("editing an own published face starts from the record and doesn't insist on a device", async () => {
  const wf = { id: "wf1", owner: "u1", published: true, name: "Old", description: "Desc" };
  const scope = fork({
    values: [
      [authModel.$user, user],
      [marketModel.$openedWf, wf as unknown as RecordModel],
    ],
  });

  await allSettled(marketModel.publishDialogOpened, { scope });
  expect(scope.getState(marketModel.$publishForm)).toEqual({
    name: "Old",
    description: "Desc",
    device: "",
  });
  expect(scope.getState(marketModel.$publishEditing)).toBe(true);
  expect(scope.getState(marketModel.$publishReady)).toBe(true);
});
