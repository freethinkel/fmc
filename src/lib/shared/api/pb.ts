import PocketBase, { type RecordModel } from "pocketbase";

// dev: point VITE_PB_URL at the PocketBase instance directly (no vite proxy involved).
// prod: no VITE_PB_URL — same origin, PB/Caddy serves the static files itself.
export const pb = new PocketBase(import.meta.env.VITE_PB_URL || location.origin);

(window as { fmcPb?: PocketBase } & Window).fmcPb = pb; // console access for debugging/automated runs

// localStorage on localhost is shared between projects — drop a foreign/stale token
if (pb.authStore.isValid)
  pb.collection("users")
    .authRefresh()
    .catch(() => pb.authStore.clear());
else pb.authStore.clear();

export const fileUrl = (rec: RecordModel, field: string) => pb.files.getURL(rec, rec[field]);
export const downloadUrl = (rec: RecordModel) => `${pb.baseURL}/api/wf/${rec.id}/download`;
