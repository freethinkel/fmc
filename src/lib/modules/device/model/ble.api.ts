// BLE: the one op with no model coupling (no live-connection state, no status stream) — see
// ponytail note in ble.model.ts for why connectFx/flashFx stay there instead of joining this file.
import { createEffect } from 'effector';
import { forgetKnownDevices } from '../lib/ble';

export const forgetFx = createEffect(forgetKnownDevices);
