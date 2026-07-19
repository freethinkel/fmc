import PocketBase, { type RecordModel } from 'pocketbase';

// ponytail: свой origin — в dev /api проксируется vite'ом на PB (см. vite.config), в проде статику отдаёт сам PB
export const pb = new PocketBase(import.meta.env.VITE_PB_URL || location.origin);

(window as { fcmPb?: PocketBase } & Window).fcmPb = pb; // console access for debugging/automated runs

// localStorage на localhost общий между проектами — чужой/протухший токен сбрасываем
if (pb.authStore.isValid) pb.collection('users').authRefresh().catch(() => pb.authStore.clear());
else pb.authStore.clear();

export const fileUrl = (rec: RecordModel, field: string) => pb.files.getURL(rec, rec[field]);
export const downloadUrl = (rec: RecordModel) => `${pb.baseURL}/api/wf/${rec.id}/download`;
