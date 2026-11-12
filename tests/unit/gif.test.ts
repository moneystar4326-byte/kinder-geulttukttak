// GIF 만들기 (태권 글뚝딱 2.7.0에서 옮김): 표준 읽기 순서로 다시 풀어 픽셀이 맞는지 · 글에서 자리 · 고르기
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gifSize, GifWriter, isGif, pickFrames } from '../../src/shared/gif';
import { buildBlocks } from '../../src/main/services/browser-draft';
import { cardMark, GIF_CARD, isCardMark } from '../../src/main/services/browser-draft/editor';

// 시험용 GIF 해독: 프레임마다 지연 · 색판 · 색 번호
function decode(b: Uint8Array) {
  let p = 6;
  const u16 = () => { const n = b[p] | (b[p + 1] << 8); p += 2; return n; };
  const W = u16(), H = u16();
  const flags = b[p]; p += 3;
  assert.equal(flags & 0x80, 0, '전체 색판 없음');
  const frames: { delay: number; pixels: number[][] }[] = [];
  let delay = 0, loop = false;
  while (b[p] !== 0x3b) {
    assert.ok(p < b.length, '끝 표시까지 읽음');
    if (b[p] === 0x21) {
      const label = b[p + 1]; p += 2;
      if (label === 0xf9) delay = b[p + 2] | (b[p + 3] << 8);
      if (label === 0xff && String.fromCharCode(...b.subarray(p + 1, p + 12)) === 'NETSCAPE2.0') loop = true;
      while (b[p]) p += b[p] + 1;
      p++;
    } else {
      assert.equal(b[p], 0x2c); p += 5;
      const w = u16(), h = u16();
      assert.deepEqual([w, h], [W, H]);
      const size = 2 << (b[p++] & 7);
      const pal = b.subarray(p, p + size * 3); p += size * 3;
      const min = b[p++];
      const data: number[] = [];
      while (b[p]) { for (let i = 1; i <= b[p]; i++) data.push(b[p + i]); p += b[p] + 1; }
      p++;
      const idx = lzwDecode(data, min);
      assert.equal(idx.length, w * h, '픽셀 수');
      frames.push({ delay, pixels: idx.map((i) => [pal[i * 3], pal[i * 3 + 1], pal[i * 3 + 2]]) });
    }
  }
  return { W, H, frames, loop };
}
function lzwDecode(data: number[], min: number) {
  const CLEAR = 1 << min, END = CLEAR + 1;
  let size = min + 1, acc = 0, bits = 0, table: number[][] = [], prev: number[] | null = null;
  const reset = () => { table = Array.from({ length: END + 1 }, (_, i) => (i < CLEAR ? [i] : [])); size = min + 1; prev = null; };
  reset();
  const out: number[] = [];
  for (const byte of data) {
    acc |= byte << bits; bits += 8;
    while (bits >= size) {
      const code = acc & ((1 << size) - 1); acc >>>= size; bits -= size;
      if (code === CLEAR) { reset(); continue; }
      if (code === END) return out;
      const entry: number[] = code < table.length ? table[code] : [...prev!, prev![0]];
      out.push(...entry);
      if (prev && table.length < 4096) table.push([...prev, entry[0]]);
      prev = entry;
      if (table.length === 1 << size && size < 12) size++;
    }
  }
  return out;
}

const fill = (w: number, h: number, at: (x: number, y: number) => number[]) => {
  const a = new Uint8Array(w * h * 4);
  for (let y = 0, p = 0; y < h; y++) for (let x = 0; x < w; x++, p += 4) { const [r, g, b] = at(x, y); a[p] = r; a[p + 1] = g; a[p + 2] = b; a[p + 3] = 255; }
  return a;
};
const near = (a: number[], b: number[], tol: number) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

test('GIF: 프레임 · 지연 · 반복 · 색이 맞게 풀림', () => {
  const g = new GifWriter(16, 8, 100);
  g.addFrame(fill(16, 8, (x) => (x < 8 ? [255, 0, 0] : [0, 0, 255])));
  g.addFrame(fill(16, 8, (_, y) => (y < 4 ? [0, 255, 0] : [250, 250, 250])));
  const out = g.finish();
  assert.equal(isGif(out), true);
  const d = decode(out);
  assert.deepEqual([d.W, d.H, d.frames.length, d.loop], [16, 8, 2, true]);
  assert.equal(d.frames[0].delay, 100);
  assert.ok(near(d.frames[0].pixels[0], [255, 0, 0], 8) && near(d.frames[0].pixels[15], [0, 0, 255], 8));
  assert.ok(near(d.frames[1].pixels[0], [0, 255, 0], 8) && near(d.frames[1].pixels[16 * 7], [250, 250, 250], 8));
});

test('GIF: 색이 많은 큰 그림 (코드표가 차서 다시 시작해도 픽셀이 맞음)', () => {
  const w = 400, h = 300;
  const rnd = (x: number, y: number) => ((x * 7919 + y * 104729) ^ (x * y * 31)) & 255;
  const g = new GifWriter(w, h, 60);
  g.addFrame(fill(w, h, (x, y) => [rnd(x, y), (x * 255) / w, (y * 255) / h]));
  const d = decode(g.finish());
  assert.equal(d.frames[0].pixels.length, w * h);
  // 색이 256개로 줄어도 초록 · 파랑 흐름은 살아 있음
  const err = d.frames[0].pixels.reduce((s, p, i) => s + Math.abs(p[2] - (Math.floor(i / w) * 255) / h), 0) / (w * h);
  assert.ok(err < 50, `파랑 오차 ${err}`);
});

test('GIF: 한 가지 색 · 1픽셀', () => {
  const g = new GifWriter(1, 1, 60);
  g.addFrame(fill(1, 1, () => [10, 20, 30]));
  assert.equal(decode(g.finish()).frames[0].pixels.length, 1);
});

test('사진 고르기 · 크기', () => {
  const ten = pickFrames(Array.from({ length: 30 }, (_, i) => i));
  assert.equal(ten.length, 10);
  assert.deepEqual([ten[0], ten[9]], [0, 29]);
  assert.equal(new Set(ten).size, 10);
  assert.deepEqual(pickFrames([1, 2, 3]), [1, 2, 3]);
  assert.deepEqual(gifSize([{ w: 4, h: 3 }, { w: 4, h: 3 }, { w: 3, h: 4 }], 800), { w: 800, h: 600 });
  assert.deepEqual(gifSize([{ w: 3, h: 4 }, { w: 3, h: 4 }, { w: 4, h: 3 }], 800), { w: 600, h: 800 });
});

test('글 자리: 끝이면 마무리 글(글쓴이 줄) 뒤 · 태그 앞, 위면 첫 문단 앞', () => {
  const secs = [{ id: 's1', paragraphs: ['도입'] }, { id: 's2', paragraphs: ['마무리', '햇살반 담임 선생님 드림'] }];
  const text = (b: { text: string }[]) => b.map((x) => x.text);
  const bottom = text(buildBlocks(secs, [], ['태그'], undefined, 'bottom'));
  const mark = cardMark(GIF_CARD, '움직이는 사진');
  assert.ok(isCardMark(mark, GIF_CARD));
  assert.ok(bottom.indexOf(mark) > bottom.indexOf('햇살반 담임 선생님 드림'));
  assert.ok(bottom.indexOf(mark) < bottom.findIndex((t) => t.startsWith('#')));
  const top = text(buildBlocks(secs, [], [], undefined, 'top'));
  assert.equal(top[0], mark);
  assert.equal(text(buildBlocks(secs, [], [])).includes(mark), false);
});
