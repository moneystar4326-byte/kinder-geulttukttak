// 움직이는 GIF 만들기 (사진 글 — 태권 글뚝딱 2.7.0에서 옮김). 화면 · 시험에서 함께 쓰려고 그림 도구 없이 픽셀만 다룸
// 프레임마다 색 256개를 골라 씀. 사진이 번져 용량이 늘지 않게 점 찍기(디더링)는 하지 않음
export const GIF_MAX_FRAMES = 10;
export const GIF_MAX_BYTES = 9 * 1024 * 1024; // 넘으면 크기를 줄여 다시 만듦
export const GIF_SIDES = [800, 640, 480]; // 긴 변
export const GIF_DELAYS = [{ label: '빠르게', cs: 60 }, { label: '보통', cs: 100 }, { label: '천천히', cs: 160 }];

export const isGif = (b: Uint8Array) => b.length > 20 && String.fromCharCode(...b.subarray(0, 6)) === 'GIF89a';

// 사진이 많으면 처음부터 끝까지 고르게
export function pickFrames<T>(items: T[], max = GIF_MAX_FRAMES): T[] {
  if (items.length <= max) return items;
  return Array.from({ length: max }, (_, i) => items[Math.round((i * (items.length - 1)) / (max - 1))]);
}

// 가로 사진이 많으면 4:3, 세로 사진이 많으면 3:4
export function gifSize(sizes: { w: number; h: number }[], side: number) {
  const tall = sizes.filter((s) => s.h > s.w).length;
  const short = Math.round((side * 3) / 4);
  return tall > sizes.length / 2 ? { w: short, h: side } : { w: side, h: short };
}

interface Box { colors: number[]; }
// 5비트 색 묶음으로 세어 중앙값으로 나눔 (rgba → 색판 · 묶음별 색 번호)
function quantize(rgba: Uint8ClampedArray | Uint8Array) {
  const counts = new Uint32Array(32768);
  for (let i = 0; i < rgba.length; i += 4) counts[((rgba[i] >> 3) << 10) | ((rgba[i + 1] >> 3) << 5) | (rgba[i + 2] >> 3)]++;
  const all: number[] = [];
  for (let c = 0; c < counts.length; c++) if (counts[c]) all.push(c);
  const channel = (c: number, k: number) => (c >> (10 - k * 5)) & 31;
  const boxes: Box[] = [{ colors: all }];
  while (boxes.length < 256) {
    // 픽셀이 가장 많은 상자(둘 이상의 색이 든)를 나눔
    let best = -1, most = 0;
    boxes.forEach((b, i) => {
      if (b.colors.length < 2) return;
      let n = 0;
      for (const c of b.colors) n += counts[c];
      if (n > most) { most = n; best = i; }
    });
    if (best < 0) break;
    const b = boxes[best];
    let axis = 0, widest = -1;
    for (let k = 0; k < 3; k++) {
      let lo = 31, hi = 0;
      for (const c of b.colors) { const v = channel(c, k); if (v < lo) lo = v; if (v > hi) hi = v; }
      if (hi - lo > widest) { widest = hi - lo; axis = k; }
    }
    b.colors.sort((x, y) => channel(x, axis) - channel(y, axis));
    let half = 0, seen = 0, cut = 1;
    for (const c of b.colors) half += counts[c];
    for (let i = 0; i < b.colors.length - 1; i++) { seen += counts[b.colors[i]]; cut = i + 1; if (seen * 2 >= half) break; }
    boxes.splice(best, 1, { colors: b.colors.slice(0, cut) }, { colors: b.colors.slice(cut) });
  }
  const palette = new Uint8Array(256 * 3);
  const lookup = new Uint8Array(32768);
  boxes.forEach((b, i) => {
    let n = 0, r = 0, g = 0, bl = 0;
    for (const c of b.colors) { const m = counts[c]; n += m; r += m * channel(c, 0); g += m * channel(c, 1); bl += m * channel(c, 2); lookup[c] = i; }
    const to8 = (v: number) => Math.min(255, Math.round((v / Math.max(1, n)) * 8 + 3.5));
    palette[i * 3] = to8(r); palette[i * 3 + 1] = to8(g); palette[i * 3 + 2] = to8(bl);
  });
  return { palette, lookup };
}

function lzw(indexes: Uint8Array) {
  const MIN = 8, CLEAR = 1 << MIN, END = CLEAR + 1;
  const out: number[] = [MIN];
  let block: number[] = [];
  let acc = 0, bits = 0, size = MIN + 1, next = END + 1;
  const table = new Map<number, number>();
  const put = (code: number) => {
    acc |= code << bits; bits += size;
    while (bits >= 8) {
      block.push(acc & 255); acc >>>= 8; bits -= 8;
      if (block.length === 255) { out.push(255, ...block); block = []; }
    }
  };
  put(CLEAR);
  let cur = indexes[0];
  for (let i = 1; i < indexes.length; i++) {
    const k = indexes[i], key = (cur << 8) | k, hit = table.get(key);
    if (hit !== undefined) { cur = hit; continue; }
    put(cur);
    if (next === 4096) { put(CLEAR); table.clear(); size = MIN + 1; next = END + 1; } else {
      if (next === 1 << size) size++;
      table.set(key, next++);
    }
    cur = k;
  }
  put(cur); put(END);
  if (bits > 0) block.push(acc & 255);
  if (block.length) out.push(block.length, ...block);
  out.push(0);
  return Uint8Array.from(out);
}

// 프레임을 하나씩 넣음 (화면이 멈춰 보이지 않게 사이에 쉴 수 있도록)
export class GifWriter {
  private parts: Uint8Array[] = [];
  bytes = 0;
  constructor(private w: number, private h: number, private delayCs: number) {
    const u16 = (n: number) => [n & 255, n >> 8];
    this.push(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, ...u16(w), ...u16(h), 0x70, 0, 0]));
    this.push(Uint8Array.from([0x21, 0xff, 11, ...[...'NETSCAPE2.0'].map((c) => c.charCodeAt(0)), 3, 1, 0, 0, 0])); // 계속 반복
  }
  private push(b: Uint8Array) { this.parts.push(b); this.bytes += b.length; }
  addFrame(rgba: Uint8ClampedArray | Uint8Array) {
    const { palette, lookup } = quantize(rgba);
    const indexes = new Uint8Array(this.w * this.h);
    for (let i = 0, p = 0; i < indexes.length; i++, p += 4) indexes[i] = lookup[((rgba[p] >> 3) << 10) | ((rgba[p + 1] >> 3) << 5) | (rgba[p + 2] >> 3)];
    const u16 = (n: number) => [n & 255, n >> 8];
    this.push(Uint8Array.from([0x21, 0xf9, 4, 0, ...u16(this.delayCs), 0, 0]));
    this.push(Uint8Array.from([0x2c, 0, 0, 0, 0, ...u16(this.w), ...u16(this.h), 0x87]));
    this.push(palette);
    this.push(lzw(indexes));
  }
  finish() {
    const all = new Uint8Array(this.bytes + 1);
    let at = 0;
    for (const p of this.parts) { all.set(p, at); at += p.length; }
    all[at] = 0x3b;
    return all;
  }
}
