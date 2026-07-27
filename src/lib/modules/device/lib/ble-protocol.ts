// Wire protocol of the CMF Watch Pro 2: GATT ids, the command table and the 0xF5 frame codec
// (chunking, AES-CBC, CRC32). Port of protocol.go, §1-9 of docs/cmf-protocol.md. No Web
// Bluetooth here — ble.ts owns the connection and drives this.

// debug: everything is logged to console with the [ble] prefix; window.fmcBleVerbose = true enables frame logging
export const dbg = (...a: unknown[]) =>
  console.log("[ble]", new Date().toISOString().slice(11, 23), ...a);
export const verbose = () => (window as { fmcBleVerbose?: boolean } & Window).fmcBleVerbose;
// keys are (c1 << 16) | c2 and c1 is 0xffff, so they come out negative — print them unsigned
export const cmdName = (key: number) =>
  Object.entries(CMD).find(([, v]) => v === key)?.[0] || `0x${(key >>> 0).toString(16)}`;
export const isKnownCmd = (key: number) => Object.values(CMD).includes(key);
export const UUID = {
  cmdRead: "0000fff1-0000-1000-8000-00805f9b34fb",
  cmdWrite: "0000fff2-0000-1000-8000-00805f9b34fb",
  dataRead: "02f00000-0000-0000-0000-00000000ffe2",
  dataWrite: "02f00000-0000-0000-0000-00000000ffe1",
  shellRead: "77d4ff02-2fe2-2334-0d35-9ccd078f529c",
  shellWrite: "77d4ff01-2fe2-2334-0d35-9ccd078f529c",
  battery: "00002a19-0000-1000-8000-00805f9b34fb",
};
export const SERVICES: (number | string)[] = [
  0xefe7,
  0xfff0,
  0x180f,
  0x180a,
  0xffd0,
  "02f00000-0000-0000-0000-00000000ffe0",
  "02f00000-0000-0000-0000-00000000fe00",
  "77d4ff00-2fe2-2334-0d35-9ccd078f529c", // docs' assumed shell service UUID — kept as a hedge
  // Web Bluetooth only ever discovers services listed here, even with a full unfiltered
  // getPrimaryServices() call — chrome://bluetooth-internals (Chrome's own C++ layer, no
  // optionalServices scoping) showed 10 real services on the watch where JS only saw 3; adding
  // the rest here is what unlocked real in-browser pairing (see pair()). 77d4e67c specifically
  // is the shell/pairing service's *live* UUID on this watch — not fixed at 77d4ff00 as the
  // reference docs assumed. Unverified whether it's the same on other physical units.
  "77d4e67c-2fe2-2334-0d35-9ccd078f529c",
  "e49a3001-f69a-11e8-8eb2-f2801f1b9fd1",
  "f48a23c0-f69a-11e8-8eb2-f2801f1b9fd1",
];

// commands used here (cmd1<<16 | cmd2); see protocol.go
const C = (c1: number, c2: number) => (c1 << 16) | c2;
export const CMD = {
  authPairReq: C(0xffff, 0x8047),
  authPairRep: C(0xffff, 0x0048), // plaintext
  authName: C(0xffff, 0x8049),
  authMac: C(0xffff, 0x0049),
  authNonceReq: C(0xffff, 0x804b),
  authNonceRep: C(0xffff, 0x004c),
  authConfirmReq: C(0xffff, 0x804d),
  authConfirmRep: C(0xffff, 0x0004),
  authFailed: C(0xffff, 0xa061),
  time: C(0xffff, 0x8004),
  fwGet: C(0xffff, 0x8006),
  fwRet: C(0xffff, 0x0006),
  serialGet: C(0x00de, 0x0002),
  serialRet: C(0x00de, 0x0001),
  battery: C(0x005c, 0x0001),
  // watchface upload over the data channel (upload.go, §9.5)
  wfInit1Req: C(0xffff, 0x8052),
  wfInit1Rep: C(0xffff, 0x0052),
  wfInit2Req: C(0xffff, 0x9075),
  wfInit2Rep: C(0xffff, 0xa075),
  wfChunkReq: C(0xffff, 0xa064),
  wfChunkWrite: C(0xffff, 0x9064), // plaintext
  wfFinishAck1: C(0xffff, 0xa065),
  wfFinishAck2: C(0xffff, 0x9065),
  wfInstalled: C(0xffff, 0xa055),
};
// the watch sends authFailed in plaintext (6 bytes — not a multiple of the AES block): it failed to decrypt with the key
const PLAINTEXT = new Set([CMD.authPairReq, CMD.authPairRep, CMD.wfChunkWrite, CMD.authFailed]);
export const MARKER = 0xa5;

const AES_IV = new Uint8Array([
  0x50, 0x51, 0x52, 0x53, 0x54, 0x55, 0x56, 0x57, 0x60, 0x61, 0x62, 0x63, 0x64, 0x65, 0x66, 0x5a,
]);

// ---- crypto / checksum helpers ----
const CRC_T = new Uint32Array(256);

for (let i = 0; i < 256; i++) {
  let c = i;

  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_T[i] = c >>> 0;
}
// standard IEEE CRC32 (init/xor 0xFFFFFFFF) — matches Go's crc32.ChecksumIEEE
function crc32(d: Uint8Array): number {
  let c = 0xffffffff;

  for (let i = 0; i < d.length; i++) c = CRC_T[(c ^ d[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const crcLE = (d: Uint8Array) => {
  const b = new Uint8Array(4);

  new DataView(b.buffer).setUint32(0, crc32(d), true);
  return b;
};
export const cat = (...arrs: Uint8Array[]) => {
  const n = arrs.reduce((s, a) => s + a.length, 0);
  const o = new Uint8Array(n);
  let p = 0;

  for (const a of arrs) {
    o.set(a, p);
    p += a.length;
  }
  return o;
};
export const utf8 = (s: string) => new TextEncoder().encode(s);
export const eqBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((x, i) => x === b[i]);
export const toHex = (d: Uint8Array) => [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
export const fromHex = (s: string) =>
  new Uint8Array((s.match(/../g) || []).map((b) => parseInt(b, 16)));

// Watchface id derived from the face itself, so re-flashing one lands on the id it already has
// and replaces itself instead of eating another slot. Range 10000 … 2^31-1: the top keeps it
// positive (the firmware reads new_wf_id signed and rejects negatives — that was the random
// finish: 0a), the bottom stays clear of the small ids the factory dials use (273…280 on a
// reset watch), which the firmware clearly has its own table for.
// ponytail: FNV-1a, non-cryptographic — two faces collide only if their seeds do, and the seed
// is a PocketBase record id where there is one.
const fnv1a = (s: string) => {
  let h = 0x811c9dc5;

  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};
export const dialId = (seed: string) => 10000 + (fnv1a(seed) % (0x7fffffff - 10000));

export async function sha256(d: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", d as BufferSource));
}

// ---- frame codec (protocol.go) ----
export class Codec {
  mtu = 180;
  rawKey: Uint8Array | null = null;
  cryptoKey: CryptoKey | null = null;
  bufs = new Map<number, { expected: number; data: Uint8Array }>();

  async setKey(raw: Uint8Array | null) {
    this.rawKey = raw;
    this.cryptoKey = raw
      ? await crypto.subtle.importKey("raw", raw as BufferSource, { name: "AES-CBC" }, false, [
          "encrypt",
          "decrypt",
        ])
      : null;
    this.bufs = new Map();
  }
  async encrypt(plain: Uint8Array): Promise<Uint8Array> {
    // WebCrypto AES-CBC applies PKCS7 exactly like protocol.go's pkcs7Pad
    return new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "AES-CBC", iv: AES_IV as BufferSource },
        this.cryptoKey!,
        plain as BufferSource,
      ),
    );
  }
  async decrypt(data: Uint8Array): Promise<Uint8Array> {
    try {
      return new Uint8Array(
        await crypto.subtle.decrypt(
          { name: "AES-CBC", iv: AES_IV as BufferSource },
          this.cryptoKey!,
          data as BufferSource,
        ),
      );
    } catch {
      // WebCrypto throws OperationError with an empty message on a wrong key (broken PKCS7)
      throw new Error("decrypt failed — wrong session key");
    }
  }
  async encode(key: number, payload: Uint8Array): Promise<Uint8Array[]> {
    let chunks: Uint8Array[] = [];

    if (PLAINTEXT.has(key)) {
      const size = this.mtu - 20;

      for (let i = 0; i < payload.length; i += size) {
        const ch = payload.slice(i, i + size);

        chunks.push(cat(ch, crcLE(ch)));
      }
    } else if (payload.length === 0) {
      chunks = [new Uint8Array(0)];
    } else {
      const maxEnc = Math.floor((this.mtu - 11) / 16) * 16,
        maxPay = maxEnc - 5;

      for (let i = 0; i < payload.length; i += maxPay) {
        const ch = payload.slice(i, i + maxPay);

        chunks.push(await this.encrypt(cat(ch, crcLE(ch))));
      }
    }
    const c1 = (key >>> 16) & 0xffff,
      c2 = key & 0xffff;

    return chunks.map((ch, i) => {
      const f = new Uint8Array(11 + ch.length),
        dv = new DataView(f.buffer);

      f[0] = 0xf5;
      dv.setUint16(1, ch.length);
      dv.setUint16(3, c1);
      dv.setUint16(5, chunks.length);
      dv.setUint16(7, i + 1);
      dv.setUint16(9, c2);
      f.set(ch, 11);
      return f;
    });
  }
  async decode(frame: Uint8Array): Promise<{ key: number; payload: Uint8Array } | null> {
    // full command assembled, else null
    if (frame.length < 11 || frame[0] !== 0xf5) throw new Error("bad frame header");
    const dv = new DataView(frame.buffer, frame.byteOffset);
    const plen = dv.getUint16(1),
      key = C(dv.getUint16(3), dv.getUint16(9));
    const count = dv.getUint16(5),
      index = dv.getUint16(7);
    let payload = new Uint8Array(0);

    if (plen > 0) {
      if (PLAINTEXT.has(key)) {
        payload = frame.slice(11);
      } else {
        // the header isn't encrypted — so if decryption fails you can still see which command arrived
        const dec = await this.decrypt(frame.slice(11, 11 + plen)).catch((e) => {
          throw new Error(`${cmdName(key)} (${plen}B): ${(e as Error).message}`);
        });

        if (dec.length < 4) throw new Error("payload too short for crc");
        payload = dec.slice(0, -4);
        if (crc32(payload) !== new DataView(dec.buffer).getUint32(dec.length - 4, true))
          throw new Error(`crc mismatch (decrypted ${toHex(dec)})`);
      }
    }
    if (count <= 1) return { key, payload };
    let b = this.bufs.get(key);

    if (!b) {
      b = { expected: 1, data: new Uint8Array(0) };
      this.bufs.set(key, b);
    }
    if (index !== b.expected) {
      if (index !== 1) return null;
      b.data = new Uint8Array(0);
    }
    b.data = cat(b.data, payload);
    b.expected = index + 1;
    if (index !== count) return null;
    this.bufs.delete(key);
    return { key, payload: b.data };
  }
}
