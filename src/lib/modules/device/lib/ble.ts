/// <reference types="web-bluetooth" />
// Web Bluetooth session for the CMF Watch Pro 2: connect, pair/authenticate, read device info,
// upload watchfaces. The wire format it speaks lives in ble-protocol.ts.
// Chromium only (no Web Bluetooth in Firefox/Safari); requires a user gesture and
// localhost or HTTPS.
import {
  cat,
  CMD,
  cmdName,
  Codec,
  dbg,
  dialId,
  eqBytes,
  fromHex,
  isKnownCmd,
  MARKER,
  SERVICES,
  sha256,
  toHex,
  utf8,
  UUID,
  verbose,
} from "./ble-protocol";

export interface WatchInfo {
  battery: number | null;
  firmware: string | null;
  serial: string | null;
}
// ponytail: flat list of installed dial ids — this firmware reports everything before the
// §9.5g gallery sentinel, so the builtin/downloaded split always left one side empty.
// Split it again if a firmware shows up that actually populates both.
export type WatchDials = number[];

// there's no room for another watchface, so the caller has to name an installed dial to
// overwrite instead. Own class so the model can tell it from a real failure.
export class NoFreeSlotError extends Error {}

// How many watchfaces the watch holds — nothing in the protocol reports it. ponytail: taken on
// report from a CMF Watch Pro 2 (fw 1.0.0.73), NOT measured here. The `finish: 0a` rejections
// that looked like a full watch turned out to be the signed new_wf_id bug (see below), so the
// count itself is the only evidence left. If an append ever succeeds with 6 installed, this
// number is wrong — raise it or drop the gate.
export const WF_CAPACITY = 6;

const KEY_STORE = "fmc_authkey";
const loadKey = (): Uint8Array | null => {
  const h = localStorage.getItem(KEY_STORE);

  return h && h.length === 32 ? fromHex(h) : null;
};
const saveKey = (k: Uint8Array) => localStorage.setItem(KEY_STORE, toHex(k));

// dev hygiene: resets Chrome's device permissions and the local auth key.
// ponytail: doesn't fix the lock on the watch side (the bond is held by the firmware, not the browser) —
// it only clears our state so the next connect() starts fresh.
export async function forgetKnownDevices(): Promise<number> {
  localStorage.removeItem(KEY_STORE);
  if (!navigator.bluetooth?.getDevices) return 0;
  const devices = await navigator.bluetooth.getDevices();

  await Promise.all(devices.map((d) => d.forget()));
  return devices.length;
}

export class Watch {
  onStatus: (s: string) => void;
  onDials: ((d: WatchDials) => void) | null = null;
  codec = new Codec();
  chars: Record<string, BluetoothRemoteGATTCharacteristic> = {};
  waiters = new Map<number, (p: Uint8Array) => void>(); // cmd key -> one-shot resolver
  // cmd key -> persistent handler (upload chunk loop); awaited, so it holds the rx chain
  handlers = new Map<number, (p: Uint8Array) => void | Promise<void>>();
  rx: Promise<void> = Promise.resolve(); // serializes inbound notifications, see subscribe()
  shellWaiter: ((s: string) => void) | null = null;
  battery: number | null = null;
  firmware: string | null = null;
  serial: string | null = null;
  installedWf: number[] = []; // installed dial ids from cmdWfInstalled (§9.5g)

  constructor(onStatus: (s: string) => void = () => {}) {
    this.onStatus = onStatus;
  }
  status(s: string) {
    dbg("status:", s);
    this.onStatus(s);
  }

  async connect(): Promise<WatchInfo> {
    if (!navigator.bluetooth) throw new Error("Web Bluetooth unavailable — use Chrome or Edge");
    this.status("requesting device…");
    // like in fmc CLI: the advertisement doesn't always carry the service, so match by name and by manufacturer id too
    const pick = async () => {
      const d = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [0xefe7] },
          { namePrefix: "CMF Watch" },
          { manufacturerData: [{ companyIdentifier: 0x0ccb }] },
        ],
        optionalServices: SERVICES,
      });

      dbg("device chosen:", d.name, d.id);
      d.addEventListener("gattserverdisconnected", () => {
        dbg("gattserverdisconnected");
        this.status("disconnected");
      });
      return d;
    };
    let device = await pick();

    (window as unknown as { __wf?: BluetoothDevice }).__wf = device; // ponytail: dev console hook, remove after debugging
    this.status("connecting…");
    // gatt.connect() hangs forever if the watch is already holding a connection with someone else
    const timeout = (ms: number, what: string) =>
      new Promise<never>((_, rej) =>
        setTimeout(
          () =>
            rej(
              new Error(
                `${what} timed out — the watch is probably connected to another app or browser tab; close it (phone app, fmc CLI, old editor tab) and retry`,
              ),
            ),
          ms,
        ),
      );
    const discover = async () => {
      this.chars = {};
      dbg("gatt.connect()…");
      const server = await device.gatt!.connect();

      dbg("gatt connected, discovering services…");
      // full (undirected) discovery: CoreBluetooth sometimes fails to find a service via a
      // targeted getPrimaryService(uuid) right after connecting, even though it's there — compared to
      // fmc CLI (ble.go), which always does DiscoverServices(nil) and sees the shell service
      // reliably. The outer Promise.race(…, timeout(15000)) in connectOrRepick guards
      // against the very hang that previously led to picking the targeted variant.
      const svcs = await server.getPrimaryServices();

      for (const svc of svcs) {
        try {
          const cc = await svc.getCharacteristics();

          dbg(
            "service",
            svc.uuid,
            "→",
            cc.map((c) => c.uuid),
          );
          for (const ch of cc) this.chars[ch.uuid] = ch;
        } catch (e) {
          dbg("service", svc.uuid, "characteristics failed:", (e as Error).message);
        }
      }
      dbg(
        "required chars:",
        Object.fromEntries(
          (
            ["cmdRead", "cmdWrite", "dataRead", "dataWrite", "shellRead", "shellWrite"] as const
          ).map((k) => [k, Boolean(this.chars[UUID[k]])]),
        ),
      );
    };
    // the Safari polyfill only allows connect right after the picker selection —
    // after a disconnect it throws "not offered to this origin"; in that case we show the picker again
    const connectOrRepick = async (what: string) => {
      try {
        await Promise.race([discover(), timeout(15000, what)]);
      } catch (e) {
        if (!/not offered to this origin/i.test((e as Error).message)) throw e;
        this.status("re-picking device…");
        device = await pick();
        await Promise.race([discover(), timeout(15000, what)]);
      }
    };

    try {
      await connectOrRepick("connection");
      // the shell (pairing) service sometimes shows up only on a fresh connection
      // 3s pause like in fmc CLI: reconnecting without a pause hangs the watch's firmware
      if (!this.chars[UUID.shellWrite] && !loadKey()) {
        this.status("pairing service hidden — reconnecting…");
        device.gatt!.disconnect();
        await new Promise((r) => setTimeout(r, 3000));
        await connectOrRepick("reconnection");
      }
    } catch (e) {
      try {
        device.gatt!.disconnect();
      } catch {
        /* already gone */
      }
      throw e;
    }
    const subscribe = async () => {
      for (const key of ["cmdRead", "dataRead", "shellRead"] as const) {
        const ch = this.chars[UUID[key]];
        // shell service is only needed for first-time pairing; some firmwares hide it
        if (!ch) {
          if (key === "shellRead") continue;
          throw new Error(`characteristic ${key} not found`);
        }
        // write vs writeWithoutResponse decides whether upload frames are acknowledged —
        // see sendData
        dbg("startNotifications", key, {
          write: ch.properties.write,
          writeNoResp: ch.properties.writeWithoutResponse,
        });
        await ch.startNotifications();
        ch.addEventListener("characteristicvaluechanged", (e) => {
          const value = (e.target as BluetoothRemoteGATTCharacteristic).value!;
          const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);

          // Notifications must be handled one at a time, in arrival order. onNotify is async
          // (it awaits decode) and so is the upload's chunk handler (it awaits encode before
          // writing), so firing them off concurrently let two chunk responses interleave their
          // frames on the data channel and raced the codec's own reassembly buffer — the watch
          // then rejected the finished file at random. ponytail: one chain for both
          // characteristics; split per channel only if cmd traffic ever needs to overtake an
          // upload, which today it never does.
          this.rx = this.rx.then(() => this.onNotify(ch.uuid, bytes)).catch(() => {});
        });
      }
    };

    try {
      await subscribe();
      dbg("subscriptions done, key saved:", Boolean(loadKey()));
      const k = loadKey();

      if (k) {
        try {
          await this.authenticate(k);
        } catch (e) {
          // a stale key (the watch was re-paired/reset) shows up as authFailed or silence on the first
          // encrypted exchange (authMac = 0x49); other errors don't touch the saved key
          if (!/rejected the auth key|timeout waiting for 0x49/.test((e as Error).message)) throw e;
          dbg("stored key stale, clearing:", (e as Error).message);
          localStorage.removeItem(KEY_STORE);
          // pairing needs the shell service — if it's not visible on the current connection, reconnect,
          // same as on first pairing (§233), and re-subscribe to notifications
          if (!this.chars[UUID.shellWrite]) {
            this.status("pairing service hidden — reconnecting…");
            device.gatt!.disconnect();
            await new Promise((r) => setTimeout(r, 3000));
            await connectOrRepick("reconnection");
            await subscribe();
          }
          await this.pair();
        }
      } else await this.pair();
      await this.fetchInfo();
    } catch (e) {
      // without this a failed pair()/authenticate() leaves the physical GATT link hanging:
      // the watch thinks it's busy with us, and the next Connect won't see the shell service again
      try {
        device.gatt!.disconnect();
      } catch {
        /* already gone */
      }
      throw e;
    }
    this.status("connected");
    return { battery: this.battery, firmware: this.firmware, serial: this.serial };
  }

  async onNotify(uuid: string, bytes: Uint8Array) {
    if (uuid === UUID.shellRead) {
      const s = new TextDecoder().decode(bytes);

      dbg("shell:", s.trim());
      if (this.shellWaiter && s.includes("GETSECRET:")) {
        this.shellWaiter(s);
        this.shellWaiter = null;
      }
      return;
    }
    if (uuid !== UUID.cmdRead && uuid !== UUID.dataRead) return;
    let res;

    try {
      res = await this.codec.decode(bytes);
    } catch (e) {
      this.status(`decode: ${(e as Error).message}`);
      return;
    }
    if (!res) return;
    // an unrecognised key is the whole point of probe() — always dump its payload, that's the
    // only thing that tells you what the command means
    if (res.key !== CMD.wfChunkReq || verbose())
      dbg(
        "recv",
        cmdName(res.key),
        "len",
        res.payload.length,
        !isKnownCmd(res.key) || verbose() ? toHex(res.payload) : "",
      );
    if (res.key === CMD.battery && res.payload.length) this.battery = res.payload[0];
    if (res.key === CMD.wfInstalled) {
      // built-ins ‖ 0xFFFFFFFF ‖ gallery ids (§9.5g) — the sentinel just separates two groups
      // the UI doesn't distinguish, so flatten
      const p = res.payload;

      this.installedWf = [];
      for (let off = 4; off + 4 <= p.length; off += 4) {
        const id = new DataView(p.buffer, p.byteOffset + off).getUint32(0, true);

        if (id !== 0xffffffff) this.installedWf.push(id);
      }
      // Leading 4 bytes, still unparsed. One sample so far: header 01 05 06 07 on a payload of
      // 28 bytes = 4 + 6 ids, with 6 dials installed — so byte 2 looks like the count and byte 3
      // (07) is the best candidate for the capacity WF_CAPACITY currently hardcodes. Needs a
      // second sample at a different count to confirm; keep logging it.
      dbg("installed dials:", this.installedWf, "header:", toHex(p.slice(0, 4)));
      this.onDials?.([...this.installedWf]);
    }
    const w = this.waiters.get(res.key);

    if (w) {
      this.waiters.delete(res.key);
      w(res.payload);
    }
    const h = this.handlers.get(res.key);

    // awaited: the chunk handler's writes have to finish before the next notification is
    // decoded, or its frames interleave with the following chunk's
    if (h) await h(res.payload);
  }

  waitFor(cmdKey: number, ms = 8000): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.waiters.delete(cmdKey);
        reject(new Error(`timeout waiting for 0x${(cmdKey & 0xffff).toString(16)}`));
      }, ms);

      this.waiters.set(cmdKey, (p) => {
        clearTimeout(t);
        resolve(p);
      });
    });
  }
  async send(cmdKey: number, payload?: Uint8Array) {
    if (cmdKey !== CMD.wfChunkWrite || verbose())
      dbg("send", cmdName(cmdKey), "len", payload?.length ?? 0);
    const ch = this.chars[UUID.cmdWrite];

    for (const f of await this.codec.encode(cmdKey, payload || new Uint8Array(0)))
      await ch.writeValueWithoutResponse(f as BufferSource);
  }
  async sendData(cmdKey: number, payload?: Uint8Array) {
    // upload traffic goes over the data channel
    if (cmdKey !== CMD.wfChunkWrite || verbose())
      dbg("sendData", cmdName(cmdKey), "len", payload?.length ?? 0);
    const ch = this.chars[UUID.dataWrite];
    // Unacknowledged writes on purpose. Acknowledged ones (writeValueWithResponse, which this
    // characteristic does support) were tried against the random finish: 0a rejections and cost
    // 6 minutes per 800 KB face against 55 seconds here — a round trip per frame — while
    // failing just the same. The cause was new_wf_id, not lost frames; if silent drops ever do
    // turn up, this is the knob.
    for (const f of await this.codec.encode(cmdKey, payload || new Uint8Array(0)))
      await ch.writeValueWithoutResponse(f as BufferSource);
  }

  // Watchface upload — port of upload.go (§9.5). data: Uint8Array of a valid .bin.
  // seed: what identifies this face across flashes — a marketplace record id where there is
  // one, otherwise the name baked into the file. Same seed → same slot on every re-flash.
  async uploadWatchface(
    data: Uint8Array,
    slot?: number,
    seed?: string,
    onProgress: (pct: number) => void = () => {},
  ) {
    if (data.length > 32 << 20) throw new Error("file larger than 32 MB");
    const magicOk =
      data.length >= 36 &&
      data[4] === 1 &&
      data[5] === 0 &&
      data[6] === 0 &&
      (data[7] === 0 || data[7] === 2);

    if (!magicOk) throw new Error("not a watchface: no 01 00 00 0x magic at offset 4");
    const nul = (off: number) => {
      const e = data.indexOf(0, off);

      return e < 0 ? null : new TextDecoder().decode(data.slice(off, e));
    };
    const name = nul(8),
      trailer = nul(data.length - 28);

    if (!name || name !== trailer) throw new Error("trailer name mismatch — corrupted file?");

    const id = dialId(seed || name);
    // §9.5g: old_wf_id names the installed dial this upload overwrites — that's the "slot".
    // 0 means add a new one. Since the id is derived from the face, a face already on the watch
    // overwrites *itself*: re-flashing the one you're editing costs no slot and never has to ask
    // which dial to sacrifice, however many times you do it.
    const oldId = slot ?? (this.installedWf.includes(id) ? id : 0);

    // the watch only refuses an append at the very end of the upload, so check the count up
    // front rather than shipping the whole file over BLE to be told no
    if (!oldId && this.installedWf.length >= WF_CAPACITY)
      throw new NoFreeSlotError(`all ${WF_CAPACITY} slots taken`);

    const attempt = async (oldId: number) => {
      dbg("upload ids:", {
        newId: id,
        oldId,
        bytes: data.length,
        installed: this.installedWf,
      });
      this.status(`uploading “${name}”…`);
      await this.sendData(CMD.wfInit1Req, new Uint8Array([MARKER]));
      const r1 = await this.waitFor(CMD.wfInit1Rep);

      if (!r1.length || r1[0] !== 1)
        throw new Error(`watch rejected the upload (init1: ${toHex(r1)})`);

      // §9.5e: 13 bytes, little-endian, no marker: ctr_type(3) ‖ old_wf_id ‖ new_wf_id ‖ size
      const init2 = new Uint8Array(13),
        dv2 = new DataView(init2.buffer);

      init2[0] = 3;
      dv2.setUint32(1, oldId, true);
      dv2.setUint32(5, id, true);
      dv2.setUint32(9, data.length, true);
      await this.sendData(CMD.wfInit2Req, init2);
      const r2 = await this.waitFor(CMD.wfInit2Rep);

      if (!r2.length || r2[0] !== 1) {
        // re-running attempt() with a real id starts a fresh init1/init2 handshake, which is
        // why the sequence lives in a function
        if (!oldId) throw new NoFreeSlotError(`append refused (init2: ${toHex(r2)})`);
        throw new Error(`watch rejected the upload (init2: ${toHex(r2)})`);
      }

      try {
        await new Promise<void>((resolve, reject) => {
          let watchdog: ReturnType<typeof setTimeout>;
          const cleanup = () => {
            clearTimeout(watchdog);
            this.handlers.delete(CMD.wfChunkReq);
            this.handlers.delete(CMD.wfFinishAck1);
          };
          const fail = (e: Error) => {
            cleanup();
            reject(e);
          };
          const kick = () => {
            clearTimeout(watchdog);
            watchdog = setTimeout(() => fail(new Error("upload stalled")), 30000);
          };

          kick();
          this.handlers.set(CMD.wfChunkReq, async (p) => {
            if (p.length < 9) return fail(new Error(`short chunk request: ${toHex(p)}`));
            kick();
            const dv = new DataView(p.buffer, p.byteOffset);
            const off = dv.getUint32(0),
              len = dv.getUint32(4);

            if (off + len > data.length)
              return fail(new Error(`chunk request out of bounds: ${off}+${len}`));
            onProgress(p[8]);
            this.status(`uploading “${name}”… ${p[8]}%`);
            try {
              await this.sendData(CMD.wfChunkWrite, data.slice(off, off + len));
            } catch (e) {
              fail(e as Error);
            }
          });
          this.handlers.set(CMD.wfFinishAck1, async (p) => {
            cleanup();
            try {
              await this.sendData(CMD.wfFinishAck2, new Uint8Array([MARKER]));
            } catch {
              /* ack is best-effort */
            }
            if (p.length && p[0] === 1) {
              // the watch doesn't re-announce wfInstalled after an upload — patch the slot in
              // place so the list stays right and the next flash can target another slot
              const i = this.installedWf.indexOf(oldId);

              if (i < 0) this.installedWf.push(id);
              else this.installedWf[i] = id;
              this.onDials?.([...this.installedWf]);
              resolve();
            } else {
              // the watch vetting what it received, after a transfer that completed cleanly.
              // The known cause is a new_wf_id it won't take (see the 31-bit id above); size is
              // reported because it's the other property worth eyeballing if this comes back.
              // 0x0a is the documented "stored but not activated" code — the file landed intact
              // and the watch refused to switch to it (bad container, or an id it won't reuse).
              const kb = Math.round(data.length / 1024);
              const why = p[0] === 0x0a ? "stored but not activated" : `finish: ${toHex(p)}`;

              reject(new Error(`watch did not accept the file (${why}; ${kb} KB)`));
            }
          });
        });
      } finally {
        this.handlers.delete(CMD.wfChunkReq);
        this.handlers.delete(CMD.wfFinishAck1);
      }
    };

    await attempt(oldId);
    onProgress(100);
    this.status("connected");
    // the id is random and the name only exists inside the file — the caller needs both to
    // record what now sits in that slot (see catalog-names)
    return { id, name };
  }

  // There was a probe()/sweep() pair here for guessing at undocumented commands. Removed after
  // it earned its keep in reverse: 0x8050-0x8056 and 0x9054-0x9056 drew no reply at all (the
  // firmware simply ignores commands it doesn't know), while a *known* command sent with a
  // malformed payload — CMD.time with one byte instead of eight — answered 0xffffa082 5a and
  // then rebooted and factory-reset the watch. Guessing at this firmware costs more than it
  // returns; read what it volunteers instead (onNotify dumps the payload of unknown commands).

  async pair() {
    if (!this.chars[UUID.shellWrite]) {
      // the shell service's own UUID isn't fixed (seen as 77d4e67c, docs assumed 77d4ff00) —
      // Web Bluetooth only exposes services listed in optionalServices at requestDevice() time,
      // so if it ever rotates to something not in SERVICES, add the new UUID there
      throw new Error(
        "pairing service not found — reconnect and try again; if this keeps happening the watch may be using a new service UUID (see SERVICES in ble.ts)",
      );
    }
    this.status("pairing — confirm on the watch");
    await this.codec.setKey(null);
    const gotSecret = new Promise<string>((res) => (this.shellWaiter = res));

    await this.chars[UUID.shellWrite].writeValue(utf8("AT GETSECRET") as BufferSource);
    const str = (await gotSecret).trim();

    if (!str.endsWith(",OK") || str.length < 42) throw new Error(`pairing rejected: ${str}`);
    const secret = fromHex(str.slice(10, 42));
    const random1 = crypto.getRandomValues(new Uint8Array(16));
    const sig = await sha256(cat(random1, secret));

    await this.send(CMD.authPairReq, cat(random1, sig));
    const rep = await this.waitFor(CMD.authPairRep);
    const random2 = rep.slice(0, 16),
      sig2 = rep.slice(16, 48);

    if (!eqBytes(sig2, await sha256(cat(random2, secret))))
      throw new Error("watch signature mismatch");
    const k1 = (await sha256(cat(random1, random2, secret))).slice(0, 16);

    saveKey(k1);
    await this.authenticate(k1);
  }

  async authenticate(k1: Uint8Array) {
    this.status("authenticating…");
    await this.codec.setKey(k1);
    // the watch sends authFailed if it can't decrypt with the key — we react immediately instead of waiting for the timeout
    const failed = new Promise<never>((_, rej) =>
      this.waiters.set(CMD.authFailed, () => rej(new Error("watch rejected the auth key"))),
    );

    failed.catch(() => {}); // the race might not manage to subscribe in time — suppress the unhandled rejection
    const wait = (key: number) => Promise.race([this.waitFor(key), failed]);

    try {
      await this.send(CMD.authName, cat(new Uint8Array([MARKER]), utf8("fmc")));
      await wait(CMD.authMac);
      await this.send(CMD.authNonceReq, new Uint8Array([MARKER]));
      const nonce = await wait(CMD.authNonceRep);

      await this.codec.setKey((await sha256(cat(nonce, k1))).slice(0, 16));
      await this.send(CMD.authConfirmReq, new Uint8Array([MARKER]));
      await wait(CMD.authConfirmRep);
    } finally {
      this.waiters.delete(CMD.authFailed);
    }
  }

  async fetchInfo() {
    const now = Math.floor(Date.now() / 1000),
      tz = -new Date().getTimezoneOffset() * 60;
    const t = new Uint8Array(8),
      dv = new DataView(t.buffer);

    dv.setUint32(0, now);
    dv.setUint32(4, (tz * 1000) >>> 0);
    await this.send(CMD.time, t);
    await this.send(CMD.fwGet, new Uint8Array(0));
    try {
      this.firmware = [...(await this.waitFor(CMD.fwRet, 4000))].join(".");
    } catch {
      /* optional */
    }
    await this.send(CMD.serialGet, new Uint8Array(0));
    try {
      const p = await this.waitFor(CMD.serialRet, 4000);

      if (p.length > 1 && p[0] <= p.length - 1)
        this.serial = new TextDecoder().decode(p.slice(1, 1 + p[0]));
    } catch {
      /* optional */
    }
    try {
      if (this.chars[UUID.battery])
        this.battery = (await this.chars[UUID.battery].readValue()).getUint8(0);
    } catch {
      /* optional */
    }
  }
}
