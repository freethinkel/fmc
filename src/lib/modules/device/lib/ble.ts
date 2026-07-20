/// <reference types="web-bluetooth" />
// Web Bluetooth transport + protocol codec + pairing/auth for CMF Watch Pro 2.
// Port of ble.go / protocol.go / session.go (see docs/cmf-protocol.md §1-9).
// Chromium only (no Web Bluetooth in Firefox/Safari); requires a user gesture and
// localhost or HTTPS. This milestone: connect, pair/authenticate, read device info.

// debug: всё пишется в консоль с префиксом [ble]; window.fmcBleVerbose = true включает лог кадров
const dbg = (...a: unknown[]) => console.log('[ble]', new Date().toISOString().slice(11, 23), ...a);
const verbose = () => (window as { fmcBleVerbose?: boolean } & Window).fmcBleVerbose;
const cmdName = (key: number) => Object.entries(CMD).find(([, v]) => v === key)?.[0] || `0x${key.toString(16)}`;

export interface WatchInfo { battery: number | null; firmware: string | null; serial: string | null }
export interface WatchDials { builtin: number[]; gallery: number[] }

const UUID = {
  cmdRead:   '0000fff1-0000-1000-8000-00805f9b34fb',
  cmdWrite:  '0000fff2-0000-1000-8000-00805f9b34fb',
  dataRead:  '02f00000-0000-0000-0000-00000000ffe2',
  dataWrite: '02f00000-0000-0000-0000-00000000ffe1',
  shellRead:  '77d4ff02-2fe2-2334-0d35-9ccd078f529c',
  shellWrite: '77d4ff01-2fe2-2334-0d35-9ccd078f529c',
  battery:   '00002a19-0000-1000-8000-00805f9b34fb',
};
const SERVICES: (number | string)[] = [
  0xefe7, 0xfff0, 0x180f, 0x180a, 0xffd0,
  '02f00000-0000-0000-0000-00000000ffe0',
  '02f00000-0000-0000-0000-00000000fe00',
  '77d4ff00-2fe2-2334-0d35-9ccd078f529c', // docs' assumed shell service UUID — kept as a hedge
  // Web Bluetooth only ever discovers services listed here, even with a full unfiltered
  // getPrimaryServices() call — chrome://bluetooth-internals (Chrome's own C++ layer, no
  // optionalServices scoping) showed 10 real services on the watch where JS only saw 3; adding
  // the rest here is what unlocked real in-browser pairing (see pair()). 77d4e67c specifically
  // is the shell/pairing service's *live* UUID on this watch — not fixed at 77d4ff00 as the
  // reference docs assumed. Unverified whether it's the same on other physical units.
  '77d4e67c-2fe2-2334-0d35-9ccd078f529c',
  'e49a3001-f69a-11e8-8eb2-f2801f1b9fd1',
  'f48a23c0-f69a-11e8-8eb2-f2801f1b9fd1',
];

// commands used here (cmd1<<16 | cmd2); see protocol.go
const C = (c1: number, c2: number) => (c1 << 16) | c2;
const CMD = {
  authPairReq: C(0xffff, 0x8047), authPairRep: C(0xffff, 0x0048), // plaintext
  authName: C(0xffff, 0x8049), authMac: C(0xffff, 0x0049),
  authNonceReq: C(0xffff, 0x804b), authNonceRep: C(0xffff, 0x004c),
  authConfirmReq: C(0xffff, 0x804d), authConfirmRep: C(0xffff, 0x0004),
  authFailed: C(0xffff, 0xa061),
  time: C(0xffff, 0x8004), fwGet: C(0xffff, 0x8006), fwRet: C(0xffff, 0x0006),
  serialGet: C(0x00de, 0x0002), serialRet: C(0x00de, 0x0001),
  battery: C(0x005c, 0x0001),
  // watchface upload over the data channel (upload.go, §9.5)
  wfInit1Req: C(0xffff, 0x8052), wfInit1Rep: C(0xffff, 0x0052),
  wfInit2Req: C(0xffff, 0x9075), wfInit2Rep: C(0xffff, 0xa075),
  wfChunkReq: C(0xffff, 0xa064), wfChunkWrite: C(0xffff, 0x9064), // plaintext
  wfFinishAck1: C(0xffff, 0xa065), wfFinishAck2: C(0xffff, 0x9065),
  wfInstalled: C(0xffff, 0xa055),
};
// authFailed часы шлют открытым текстом (6 байт — не кратно блоку AES): ключ им не расшифровать
const PLAINTEXT = new Set([CMD.authPairReq, CMD.authPairRep, CMD.wfChunkWrite, CMD.authFailed]);
const MARKER = 0xa5;

const AES_IV = new Uint8Array([0x50, 0x51, 0x52, 0x53, 0x54, 0x55, 0x56, 0x57, 0x60, 0x61, 0x62, 0x63, 0x64, 0x65, 0x66, 0x5a]);

// ---- crypto / checksum helpers ----
const CRC_T = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  CRC_T[i] = c >>> 0;
}
// standard IEEE CRC32 (init/xor 0xFFFFFFFF) — matches Go's crc32.ChecksumIEEE
function crc32(d: Uint8Array): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < d.length; i++) c = CRC_T[(c ^ d[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
const crcLE = (d: Uint8Array) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, crc32(d), true); return b; };
const cat = (...arrs: Uint8Array[]) => { const n = arrs.reduce((s, a) => s + a.length, 0); const o = new Uint8Array(n); let p = 0; for (const a of arrs) { o.set(a, p); p += a.length; } return o; };
const utf8 = (s: string) => new TextEncoder().encode(s);
const eqBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);
const toHex = (d: Uint8Array) => [...d].map(b => b.toString(16).padStart(2, '0')).join('');
const fromHex = (s: string) => new Uint8Array((s.match(/../g) || []).map(b => parseInt(b, 16)));
async function sha256(d: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', d as BufferSource));
}

// ---- frame codec (protocol.go) ----
class Codec {
  mtu = 180;
  rawKey: Uint8Array | null = null;
  cryptoKey: CryptoKey | null = null;
  bufs = new Map<number, { expected: number; data: Uint8Array }>();

  async setKey(raw: Uint8Array | null) {
    this.rawKey = raw;
    this.cryptoKey = raw
      ? await crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-CBC' }, false, ['encrypt', 'decrypt'])
      : null;
    this.bufs = new Map();
  }
  async encrypt(plain: Uint8Array): Promise<Uint8Array> { // WebCrypto AES-CBC applies PKCS7 exactly like protocol.go's pkcs7Pad
    return new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv: AES_IV as BufferSource }, this.cryptoKey!, plain as BufferSource));
  }
  async decrypt(data: Uint8Array): Promise<Uint8Array> {
    try {
      return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv: AES_IV as BufferSource }, this.cryptoKey!, data as BufferSource));
    } catch {
      // WebCrypto кидает OperationError с пустым message при неверном ключе (битый PKCS7)
      throw new Error('decrypt failed — wrong session key');
    }
  }
  async encode(key: number, payload: Uint8Array): Promise<Uint8Array[]> {
    let chunks: Uint8Array[] = [];
    if (PLAINTEXT.has(key)) {
      const size = this.mtu - 20;
      for (let i = 0; i < payload.length; i += size) { const ch = payload.slice(i, i + size); chunks.push(cat(ch, crcLE(ch))); }
    } else if (payload.length === 0) {
      chunks = [new Uint8Array(0)];
    } else {
      const maxEnc = Math.floor((this.mtu - 11) / 16) * 16, maxPay = maxEnc - 5;
      for (let i = 0; i < payload.length; i += maxPay) { const ch = payload.slice(i, i + maxPay); chunks.push(await this.encrypt(cat(ch, crcLE(ch)))); }
    }
    const c1 = (key >>> 16) & 0xffff, c2 = key & 0xffff;
    return chunks.map((ch, i) => {
      const f = new Uint8Array(11 + ch.length), dv = new DataView(f.buffer);
      f[0] = 0xf5;
      dv.setUint16(1, ch.length); dv.setUint16(3, c1); dv.setUint16(5, chunks.length); dv.setUint16(7, i + 1); dv.setUint16(9, c2);
      f.set(ch, 11);
      return f;
    });
  }
  async decode(frame: Uint8Array): Promise<{ key: number; payload: Uint8Array } | null> { // full command assembled, else null
    if (frame.length < 11 || frame[0] !== 0xf5) throw new Error('bad frame header');
    const dv = new DataView(frame.buffer, frame.byteOffset);
    const plen = dv.getUint16(1), key = C(dv.getUint16(3), dv.getUint16(9));
    const count = dv.getUint16(5), index = dv.getUint16(7);
    let payload = new Uint8Array(0);
    if (plen > 0) {
      if (PLAINTEXT.has(key)) {
        payload = frame.slice(11);
      } else {
        // заголовок не шифруется — при провале расшифровки видно, какая команда пришла
        const dec = await this.decrypt(frame.slice(11, 11 + plen)).catch(e => {
          throw new Error(`${cmdName(key)} (${plen}B): ${(e as Error).message}`);
        });
        if (dec.length < 4) throw new Error('payload too short for crc');
        payload = dec.slice(0, -4);
        if (crc32(payload) !== new DataView(dec.buffer).getUint32(dec.length - 4, true))
          throw new Error(`crc mismatch (decrypted ${toHex(dec)})`);
      }
    }
    if (count <= 1) return { key, payload };
    let b = this.bufs.get(key);
    if (!b) { b = { expected: 1, data: new Uint8Array(0) }; this.bufs.set(key, b); }
    if (index !== b.expected) { if (index !== 1) return null; b.data = new Uint8Array(0); }
    b.data = cat(b.data, payload); b.expected = index + 1;
    if (index !== count) return null;
    this.bufs.delete(key);
    return { key, payload: b.data };
  }
}

// ---- watch session (ble.go + session.go) ----
const KEY_STORE = 'fmc_authkey';
const loadKey = (): Uint8Array | null => { const h = localStorage.getItem(KEY_STORE); return h && h.length === 32 ? fromHex(h) : null; };
const saveKey = (k: Uint8Array) => localStorage.setItem(KEY_STORE, toHex(k));

// dev-гигиена: сбрасывает Chrome-разрешения на устройство и локальный auth-ключ.
// ponytail: не чинит блокировку на стороне часов (bond держит firmware, не браузер) —
// только чистит наше состояние, чтобы следующий connect() стартовал с нуля.
export async function forgetKnownDevices(): Promise<number> {
  localStorage.removeItem(KEY_STORE);
  if (!navigator.bluetooth?.getDevices) return 0;
  const devices = await navigator.bluetooth.getDevices();
  await Promise.all(devices.map(d => d.forget()));
  return devices.length;
}

export class Watch {
  onStatus: (s: string) => void;
  onDials: ((d: WatchDials) => void) | null = null;
  codec = new Codec();
  chars: Record<string, BluetoothRemoteGATTCharacteristic> = {};
  waiters = new Map<number, (p: Uint8Array) => void>(); // cmd key -> one-shot resolver
  handlers = new Map<number, (p: Uint8Array) => void>(); // cmd key -> persistent handler (upload chunk loop)
  shellWaiter: ((s: string) => void) | null = null;
  battery: number | null = null;
  firmware: string | null = null;
  serial: string | null = null;
  builtinWf: number[] = [];
  galleryWf: number[] = []; // downloaded gallery dial ids from cmdWfInstalled (§9.5g)

  constructor(onStatus: (s: string) => void = () => {}) {
    this.onStatus = onStatus;
  }
  status(s: string) { dbg('status:', s); this.onStatus(s); }

  async connect(): Promise<WatchInfo> {
    if (!navigator.bluetooth) throw new Error('Web Bluetooth unavailable — use Chrome or Edge');
    this.status('requesting device…');
    // как в fmc CLI: advertisement не всегда несёт сервис, матчим и по имени, и по manufacturer id
    const pick = async () => {
      const d = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [0xefe7] },
          { namePrefix: 'CMF Watch' },
          { manufacturerData: [{ companyIdentifier: 0x0ccb }] },
        ],
        optionalServices: SERVICES,
      });
      dbg('device chosen:', d.name, d.id);
      d.addEventListener('gattserverdisconnected', () => { dbg('gattserverdisconnected'); this.status('disconnected'); });
      return d;
    };
    let device = await pick();
    (window as unknown as { __wf?: BluetoothDevice }).__wf = device; // ponytail: dev console hook, remove after debugging
    this.status('connecting…');
    // gatt.connect() висит вечно, если часы уже держат соединение с кем-то ещё
    const timeout = (ms: number, what: string) => new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error(`${what} timed out — the watch is probably connected to another app or browser tab; close it (phone app, fmc CLI, old editor tab) and retry`)), ms));
    const discover = async () => {
      this.chars = {};
      dbg('gatt.connect()…');
      const server = await device.gatt!.connect();
      dbg('gatt connected, discovering services…');
      // полный (ненаправленный) discovery: CoreBluetooth иногда не находит сервис через
      // адресный getPrimaryService(uuid) сразу после коннекта, хотя он есть — сравнение с
      // fmc CLI (ble.go), которая всегда делает DiscoverServices(nil) и видит shell-сервис
      // надёжно. Внешний Promise.race(…, timeout(15000)) в connectOrRepick подстраховывает
      // от того самого зависания, из-за которого раньше выбрали адресный вариант.
      const svcs = await server.getPrimaryServices();
      for (const svc of svcs) {
        try {
          const cc = await svc.getCharacteristics();
          dbg('service', svc.uuid, '→', cc.map(c => c.uuid));
          for (const ch of cc) this.chars[ch.uuid] = ch;
        } catch (e) {
          dbg('service', svc.uuid, 'characteristics failed:', (e as Error).message);
        }
      }
      dbg('required chars:', Object.fromEntries(
        (['cmdRead', 'cmdWrite', 'dataRead', 'dataWrite', 'shellRead', 'shellWrite'] as const).map(k => [k, !!this.chars[UUID[k]]])));
    };
    // Safari-полифилл разрешает connect только сразу после выбора в picker'е —
    // после disconnect'а бросает "not offered to this origin"; тогда показываем picker снова
    const connectOrRepick = async (what: string) => {
      try {
        await Promise.race([discover(), timeout(15000, what)]);
      } catch (e) {
        if (!/not offered to this origin/i.test((e as Error).message)) throw e;
        this.status('re-picking device…');
        device = await pick();
        await Promise.race([discover(), timeout(15000, what)]);
      }
    };
    try {
      await connectOrRepick('connection');
      // the shell (pairing) service sometimes shows up only on a fresh connection
      // пауза 3 с как в fmc CLI: реконнекты без паузы вешают прошивку часов
      if (!this.chars[UUID.shellWrite] && !loadKey()) {
        this.status('pairing service hidden — reconnecting…');
        device.gatt!.disconnect();
        await new Promise(r => setTimeout(r, 3000));
        await connectOrRepick('reconnection');
      }
    } catch (e) {
      try { device.gatt!.disconnect(); } catch { /* already gone */ }
      throw e;
    }
    const subscribe = async () => {
      for (const key of ['cmdRead', 'dataRead', 'shellRead'] as const) {
        const ch = this.chars[UUID[key]];
        // shell service is only needed for first-time pairing; some firmwares hide it
        if (!ch) { if (key === 'shellRead') continue; throw new Error(`characteristic ${key} not found`); }
        dbg('startNotifications', key);
        await ch.startNotifications();
        ch.addEventListener('characteristicvaluechanged', e => {
          const value = (e.target as BluetoothRemoteGATTCharacteristic).value!;
          this.onNotify(ch.uuid, new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
        });
      }
    };
    try {
      await subscribe();
      dbg('subscriptions done, key saved:', !!loadKey());
      const k = loadKey();
      if (k) {
        try {
          await this.authenticate(k);
        } catch (e) {
          // протухший ключ (часы перепарили/сбросили) — это authFailed или молчание на первый
          // шифрованный обмен (authMac = 0x49); остальные ошибки не трогают сохранённый ключ
          if (!/rejected the auth key|timeout waiting for 0x49/.test((e as Error).message)) throw e;
          dbg('stored key stale, clearing:', (e as Error).message);
          localStorage.removeItem(KEY_STORE);
          // pairing нужен shell-сервис — если его не видно на текущем соединении, реконнектимся,
          // как и при первом парении (§233), и переподписываемся на уведомления заново
          if (!this.chars[UUID.shellWrite]) {
            this.status('pairing service hidden — reconnecting…');
            device.gatt!.disconnect();
            await new Promise(r => setTimeout(r, 3000));
            await connectOrRepick('reconnection');
            await subscribe();
          }
          await this.pair();
        }
      } else await this.pair();
      await this.fetchInfo();
    } catch (e) {
      // без этого неудачный pair()/authenticate() оставляет физическую GATT-связь висеть:
      // часы думают, что заняты нами, и следующий Connect снова не увидит shell-сервис
      try { device.gatt!.disconnect(); } catch { /* already gone */ }
      throw e;
    }
    this.status('connected');
    return { battery: this.battery, firmware: this.firmware, serial: this.serial };
  }

  async onNotify(uuid: string, bytes: Uint8Array) {
    if (uuid === UUID.shellRead) { const s = new TextDecoder().decode(bytes); dbg('shell:', s.trim()); if (this.shellWaiter && s.includes('GETSECRET:')) { this.shellWaiter(s); this.shellWaiter = null; } return; }
    if (uuid !== UUID.cmdRead && uuid !== UUID.dataRead) return;
    let res;
    try { res = await this.codec.decode(bytes); } catch (e) { this.status(`decode: ${(e as Error).message}`); return; }
    if (!res) return;
    if (res.key !== CMD.wfChunkReq || verbose()) dbg('recv', cmdName(res.key), 'len', res.payload.length);
    if (res.key === CMD.battery && res.payload.length) this.battery = res.payload[0];
    if (res.key === CMD.wfInstalled) { // built-ins ‖ 0xFFFFFFFF ‖ gallery ids (§9.5g)
      const p = res.payload; this.galleryWf = []; this.builtinWf = [];
      let sentinel = false;
      for (let off = 4; off + 4 <= p.length; off += 4) {
        const id = new DataView(p.buffer, p.byteOffset + off).getUint32(0, true);
        if (id === 0xFFFFFFFF) sentinel = true;
        else (sentinel ? this.galleryWf : this.builtinWf).push(id);
      }
      dbg('installed dials:', { builtin: this.builtinWf, gallery: this.galleryWf });
      this.onDials?.({ builtin: [...this.builtinWf], gallery: [...this.galleryWf] });
    }
    const w = this.waiters.get(res.key);
    if (w) { this.waiters.delete(res.key); w(res.payload); }
    const h = this.handlers.get(res.key);
    if (h) h(res.payload);
  }

  waitFor(cmdKey: number, ms = 8000): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.waiters.delete(cmdKey); reject(new Error(`timeout waiting for 0x${(cmdKey & 0xffff).toString(16)}`)); }, ms);
      this.waiters.set(cmdKey, p => { clearTimeout(t); resolve(p); });
    });
  }
  async send(cmdKey: number, payload?: Uint8Array) {
    if (cmdKey !== CMD.wfChunkWrite || verbose()) dbg('send', cmdName(cmdKey), 'len', payload?.length ?? 0);
    const ch = this.chars[UUID.cmdWrite];
    for (const f of await this.codec.encode(cmdKey, payload || new Uint8Array(0))) await ch.writeValueWithoutResponse(f as BufferSource);
  }
  async sendData(cmdKey: number, payload?: Uint8Array) { // upload traffic goes over the data channel
    if (cmdKey !== CMD.wfChunkWrite || verbose()) dbg('sendData', cmdName(cmdKey), 'len', payload?.length ?? 0);
    const ch = this.chars[UUID.dataWrite];
    for (const f of await this.codec.encode(cmdKey, payload || new Uint8Array(0))) await ch.writeValueWithoutResponse(f as BufferSource);
  }

  // Watchface upload — port of upload.go (§9.5). data: Uint8Array of a valid .bin.
  async uploadWatchface(data: Uint8Array, onProgress: (pct: number) => void = () => {}) {
    if (data.length > 32 << 20) throw new Error('file larger than 32 MB');
    const magicOk = data.length >= 36 && data[4] === 1 && data[5] === 0 && data[6] === 0 && (data[7] === 0 || data[7] === 2);
    if (!magicOk) throw new Error('not a watchface: no 01 00 00 0x magic at offset 4');
    const nul = (off: number) => { const e = data.indexOf(0, off); return e < 0 ? null : new TextDecoder().decode(data.slice(off, e)); };
    const name = nul(8), trailer = nul(data.length - 28);
    if (!name || name !== trailer) throw new Error('trailer name mismatch — corrupted file?');

    const id = crypto.getRandomValues(new Uint32Array(1))[0];
    // §9.5g: old_wf_id must name the installed custom dial; 0 (append) needs a free slot and
    // works only once. This firmware's wfInstalled/gallery report does NOT reliably reflect
    // side-loaded dials (confirmed empirically: stays [] right after a successful side-load) —
    // so our own last-successful-upload id is the trustworthy source, the watch's live gallery
    // is the fallback for a browser that never uploaded here before.
    let oldId = Number(localStorage.getItem('fmc_last_wfid') || 0);
    if (!oldId && this.galleryWf.length) oldId = this.galleryWf[this.galleryWf.length - 1];
    dbg('upload ids:', { newId: id, oldId, gallery: this.galleryWf });

    this.status(`uploading “${name}”…`);
    await this.sendData(CMD.wfInit1Req, new Uint8Array([MARKER]));
    const r1 = await this.waitFor(CMD.wfInit1Rep);
    if (!r1.length || r1[0] !== 1) throw new Error(`watch rejected the upload (init1: ${toHex(r1)})`);

    // §9.5e: 13 bytes, little-endian, no marker: ctr_type(3) ‖ old_wf_id ‖ new_wf_id ‖ size
    const init2 = new Uint8Array(13), dv2 = new DataView(init2.buffer);
    init2[0] = 3;
    dv2.setUint32(1, oldId, true); dv2.setUint32(5, id, true); dv2.setUint32(9, data.length, true);
    await this.sendData(CMD.wfInit2Req, init2);
    const r2 = await this.waitFor(CMD.wfInit2Rep);
    if (!r2.length || r2[0] !== 1) throw new Error(`watch rejected the upload (init2: ${toHex(r2)})`);

    try {
      await new Promise<void>((resolve, reject) => {
        let watchdog: ReturnType<typeof setTimeout>;
        const cleanup = () => { clearTimeout(watchdog); this.handlers.delete(CMD.wfChunkReq); this.handlers.delete(CMD.wfFinishAck1); };
        const fail = (e: Error) => { cleanup(); reject(e); };
        const kick = () => { clearTimeout(watchdog); watchdog = setTimeout(() => fail(new Error('upload stalled')), 30000); };
        kick();
        this.handlers.set(CMD.wfChunkReq, async p => {
          if (p.length < 9) return fail(new Error(`short chunk request: ${toHex(p)}`));
          kick();
          const dv = new DataView(p.buffer, p.byteOffset);
          const off = dv.getUint32(0), len = dv.getUint32(4);
          if (off + len > data.length) return fail(new Error(`chunk request out of bounds: ${off}+${len}`));
          onProgress(p[8]);
          this.status(`uploading “${name}”… ${p[8]}%`);
          try { await this.sendData(CMD.wfChunkWrite, data.slice(off, off + len)); } catch (e) { fail(e as Error); }
        });
        this.handlers.set(CMD.wfFinishAck1, async p => {
          cleanup();
          try { await this.sendData(CMD.wfFinishAck2, new Uint8Array([MARKER])); } catch { /* ack is best-effort */ }
          if (p.length && p[0] === 1) {
            // §9.5g: только один слот под сторонний циферблат — после успешной загрузки он
            // занят этим id, а часы это в wfInstalled в течение той же сессии не подтверждают;
            // следующий аплоад в этой сессии должен знать, что теперь заменять именно его,
            // а не снова пытаться "добавить в пустой слот" (oldId=0) и получить тихий отказ 0x0a
            this.galleryWf = [id];
            resolve();
          } else reject(new Error(`watch did not accept the file (finish: ${toHex(p)})`));
        });
      });
    } finally {
      this.handlers.delete(CMD.wfChunkReq);
      this.handlers.delete(CMD.wfFinishAck1);
    }
    localStorage.setItem('fmc_last_wfid', String(id));
    onProgress(100);
    this.status('connected');
  }

  async pair() {
    if (!this.chars[UUID.shellWrite]) {
      // the shell service's own UUID isn't fixed (seen as 77d4e67c, docs assumed 77d4ff00) —
      // Web Bluetooth only exposes services listed in optionalServices at requestDevice() time,
      // so if it ever rotates to something not in SERVICES, add the new UUID there
      throw new Error('pairing service not found — reconnect and try again; if this keeps happening the watch may be using a new service UUID (see SERVICES in ble.ts)');
    }
    this.status('pairing — confirm on the watch');
    await this.codec.setKey(null);
    const gotSecret = new Promise<string>(res => (this.shellWaiter = res));
    await this.chars[UUID.shellWrite].writeValue(utf8('AT GETSECRET') as BufferSource);
    const str = (await gotSecret).trim();
    if (!str.endsWith(',OK') || str.length < 42) throw new Error(`pairing rejected: ${str}`);
    const secret = fromHex(str.slice(10, 42));
    const random1 = crypto.getRandomValues(new Uint8Array(16));
    const sig = await sha256(cat(random1, secret));
    await this.send(CMD.authPairReq, cat(random1, sig));
    const rep = await this.waitFor(CMD.authPairRep);
    const random2 = rep.slice(0, 16), sig2 = rep.slice(16, 48);
    if (!eqBytes(sig2, await sha256(cat(random2, secret)))) throw new Error('watch signature mismatch');
    const k1 = (await sha256(cat(random1, random2, secret))).slice(0, 16);
    saveKey(k1);
    await this.authenticate(k1);
  }

  async authenticate(k1: Uint8Array) {
    this.status('authenticating…');
    await this.codec.setKey(k1);
    // часы шлют authFailed, если ключ им не расшифровать — реагируем сразу, не ждём таймаута
    const failed = new Promise<never>((_, rej) =>
      this.waiters.set(CMD.authFailed, () => rej(new Error('watch rejected the auth key'))));
    failed.catch(() => {}); // race может не успеть подписаться — глушим unhandled rejection
    const wait = (key: number) => Promise.race([this.waitFor(key), failed]);
    try {
      await this.send(CMD.authName, cat(new Uint8Array([MARKER]), utf8('fmc')));
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
    const now = Math.floor(Date.now() / 1000), tz = -new Date().getTimezoneOffset() * 60;
    const t = new Uint8Array(8), dv = new DataView(t.buffer);
    dv.setUint32(0, now); dv.setUint32(4, (tz * 1000) >>> 0);
    await this.send(CMD.time, t);
    await this.send(CMD.fwGet, new Uint8Array(0));
    try { this.firmware = [...await this.waitFor(CMD.fwRet, 4000)].join('.'); } catch { /* optional */ }
    await this.send(CMD.serialGet, new Uint8Array(0));
    try { const p = await this.waitFor(CMD.serialRet, 4000); if (p.length > 1 && p[0] <= p.length - 1) this.serial = new TextDecoder().decode(p.slice(1, 1 + p[0])); } catch { /* optional */ }
    try { if (this.chars[UUID.battery]) this.battery = (await this.chars[UUID.battery].readValue()).getUint8(0); } catch { /* optional */ }
  }
}

