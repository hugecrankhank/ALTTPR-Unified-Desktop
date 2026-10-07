// Link sprite support (.zspr and legacy .spr), ported from the alttpr.com
// frontend (resources/js/rom.js in alttp_vt_randomizer, MIT).

const AUTHOR_CHARS = {
  ' ': [0x9F, 0x9F], "'": [0xD9, 0xEC], '.': [0xDC, 0xEF], '/': [0xDB, 0xEE], ':': [0xDD, 0xF0], _: [0xDE, 0xF1],
};
'0123456789'.split('').forEach((c, i) => { AUTHOR_CHARS[c] = [0x53 + i, 0x79 + i]; });
'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach((c, i) => { AUTHOR_CHARS[c] = [0x5D + i, 0x83 + i]; });

function readUtf16z(b, i, end) {
  let s = '';
  while (i + 1 < end) {
    const c = b[i] | (b[i + 1] << 8);
    i += 2;
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return [s, i];
}

const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

/** Check a sprite file and return its details, or throw with a readable reason. */
export function parseSprite(bytes) {
  bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const zspr = String.fromCharCode(...bytes.subarray(0, 4)) === 'ZSPR';
  if (!zspr) {
    if (bytes.length < 0x7078) throw new Error('That isn\'t a Link sprite (.zspr or .spr).');
    return { kind: 'spr', name: '', author: '', authorShort: '', bytes };
  }
  const gfx = u32(bytes, 9);
  const pal = u32(bytes, 15);
  const type = bytes[21] | (bytes[22] << 8);
  if (type !== 1) throw new Error('That .zspr isn\'t a Link sprite.');
  if ((gfx !== 0xFFFFFFFF && gfx + 0x7000 > bytes.length) || pal + 124 > bytes.length) {
    throw new Error('That .zspr file looks damaged or incomplete.');
  }
  const end = gfx === 0xFFFFFFFF ? pal : gfx;
  let i = 0x1D, name, author;
  [name, i] = readUtf16z(bytes, i, end);
  [author, i] = readUtf16z(bytes, i, end);
  let authorShort = '';
  while (i < end && bytes[i] !== 0) authorShort += String.fromCharCode(bytes[i++]);
  return { kind: 'zspr', name, author, authorShort, bytes };
}

/** Write a parsed sprite into a 2 MB randomizer ROM (before the checksum). */
export function applySprite(rom, sprite) {
  const b = sprite.bytes;
  if (sprite.kind === 'spr') {
    rom.set(b.subarray(0, 0x7000), 0x80000);
    rom.set(b.subarray(0x7000, 0x7000 + 120), 0xDD308);
    rom[0xDEDF5] = b[0x7036]; rom[0xDEDF6] = b[0x7037];
    rom[0xDEDF7] = b[0x7054]; rom[0xDEDF8] = b[0x7055];
    return;
  }
  const gfx = u32(b, 9), pal = u32(b, 15);

  // credits line "sprite by ...", only when the ROM has the slot for it
  if (rom[0x118000] === 0x02 && rom[0x118001] === 0x37 && rom[0x11801E] === 0x02 && rom[0x11801F] === 0x37) {
    const s = sprite.authorShort.slice(0, 28).toUpperCase();
    const left = Math.floor((28 - s.length) / 2);
    const text = ' '.repeat(left) + s + ' '.repeat(28 - s.length - left);
    for (let i = 0; i < 28; i++) {
      const [top, bottom] = AUTHOR_CHARS[text[i]] || [0x9F, 0x9F];
      rom[0x118002 + i] = top;
      rom[0x118020 + i] = bottom;
    }
  }
  if (gfx !== 0xFFFFFFFF) rom.set(b.subarray(gfx, gfx + 0x7000), 0x80000);
  rom.set(b.subarray(pal, pal + 120), 0xDD308);
  rom.set(b.subarray(pal + 120, pal + 124), 0xDEDF5);
}
