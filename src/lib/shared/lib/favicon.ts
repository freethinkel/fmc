// The tab icon is the app icon with the wall clock in it: the same dot grid as static/icon-*.png,
// and on every minute flip it cycles through junk digits before it settles.
// Hex colors live here on purpose: this draws an image asset, not a component.
const DIGITS: Record<string, string[]> = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
};

const COLS = 11; // two digits, one column of gap
const ROWS = 16; // two rows of seven, two rows of gap
const STEP = 512 / (ROWS + 4);
const R = STEP * 0.4;
const OX = 256 - (COLS * STEP) / 2 + STEP / 2;
const OY = 256 - (ROWS * STEP) / 2 + STEP / 2;

/** `tear` shifts one dot row sideways — the glitch frame. */
const frame = (hh: string, mm: string, tear?: number) => {
  let dots = "";

  for (const [row, pair] of [hh, mm].entries()) {
    for (const [col, ch] of [...pair].entries()) {
      const glyph = DIGITS[ch] ?? DIGITS["0"];

      glyph.forEach((bits, gy) =>
        [...bits].forEach((bit, gx) => {
          if (bit !== "1") return;
          const y = row * 9 + gy;
          const cx = OX + (col * 6 + gx) * STEP + (y === tear ? 16 : 0);

          dots += `<circle cx="${cx.toFixed(1)}" cy="${(OY + y * STEP).toFixed(1)}" r="${R.toFixed(1)}" fill="${row === 1 ? "#ffc700" : "#f2f2f2"}"/>`;
        }),
      );
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><pattern id="g" width="${STEP}" height="${STEP}" patternUnits="userSpaceOnUse" x="${OX - STEP / 2}" y="${OY - STEP / 2}"><circle cx="${STEP / 2}" cy="${STEP / 2}" r="${R.toFixed(1)}" fill="#262626"/></pattern></defs><rect width="512" height="512" rx="112" fill="#131313"/><rect x="${OX - STEP / 2}" y="${OY - STEP / 2}" width="${COLS * STEP}" height="${ROWS * STEP}" fill="url(#g)"/>${dots}</svg>`;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Points `link[rel=icon]` at a live CRT clock. Returns a stop fn. */
export const startFaviconClock = () => {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');

  if (!link) return () => {};

  const paint = (hh: string, mm: string, tear?: number) => {
    link.href = `data:image/svg+xml,${encodeURIComponent(frame(hh, mm, tear))}`;
  };

  let shown = "";
  let anim: ReturnType<typeof setInterval> | undefined;

  // the password-cracker cut: junk digits land one after another, then the real time
  const decode = (hh: string, mm: string) => {
    let left = 6;

    clearInterval(anim);
    anim = setInterval(() => {
      if (left-- > 0) {
        paint(pad(Math.floor(Math.random() * 100)), pad(Math.floor(Math.random() * 100)));
        return;
      }

      clearInterval(anim);
      anim = undefined;
      paint(hh, mm);
    }, 70);
  };

  const tick = () => {
    const d = new Date();
    const [hh, mm] = [pad(d.getHours()), pad(d.getMinutes())];

    if (hh + mm !== shown) {
      shown = hh + mm;
      decode(hh, mm);
      return;
    }

    // ponytail: a 1-in-20 roll per second instead of a schedule — the glitch should feel random
    if (!anim && Math.random() < 0.05) {
      paint(hh, mm, 3 + Math.floor(Math.random() * 10));
      setTimeout(() => paint(hh, mm), 120);
    }
  };

  tick();
  const id = setInterval(tick, 1000);

  return () => {
    clearInterval(id);
    clearInterval(anim);
  };
};
