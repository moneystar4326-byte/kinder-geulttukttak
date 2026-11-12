// 카드 사진 자동 맞춤: 칸을 채우되 얼굴이 잘리지 않게, 안 되면 사진 전체를 보여 줌
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitPhoto } from '../../src/shared/cardPhotoFit';
import { cardHtml } from '../../src/main/services/card-renderer/template';

const SLOT = [1080, 810] as const; // 세로형 카드 그림 칸 (4:3)
const face = (x: number, y: number, h = 0.1, score = 0.9) => ({ x, y, w: h, h, score });
const fit = (w: number, h: number, faces: any[] = []) => fitPhoto({ w, h, faces }, SLOT[0], SLOT[1], 40);

// 칸에 보이는 구간 안에 얼굴이 다 들어가는지
function shown(r: any, w: number, h: number, f: { y: number; h: number }) {
  const visible = (w / h) / (SLOT[0] / SLOT[1]);
  const start = (r.y / 100) * (1 - visible);
  return f.y >= start - 1e-6 && f.y + f.h <= start + visible + 1e-6;
}

test('칸과 비율이 같으면 그대로 채움', () => {
  assert.deepEqual(fit(1600, 1200), { whole: false, x: 50, y: 40 });
});

test('얼굴이 없고 조금만 잘리면 채움, 많이 잘리면 전체를 보여 줌', () => {
  assert.equal(fit(3000, 2000).whole, false);
  assert.equal(fit(2000, 3000).whole, true);
});

test('세로 사진의 맨 위 · 맨 아래 얼굴도 칸 안에 들어옴', () => {
  for (const f of [face(0.4, 0.02), face(0.4, 0.85), face(0.4, 0.45)]) {
    const r = fit(2000, 3000, [f]);
    assert.equal(r.whole, false);
    assert.ok(shown(r, 2000, 3000, f), JSON.stringify([f, r]));
  }
});

test('얼굴이 위아래로 멀어 한 칸에 안 들어오면 전체를 보여 줌', () => {
  assert.equal(fit(2000, 3000, [face(0.2, 0.05), face(0.6, 0.85)]).whole, true);
});

test('넓은 사진은 좌우를 얼굴 쪽으로 맞춤', () => {
  const left = fit(3200, 1200, [face(0.05, 0.4)]) as any;
  const right = fit(3200, 1200, [face(0.85, 0.4)]) as any;
  assert.ok(left.x < 10 && right.x > 90, JSON.stringify([left, right]));
  assert.equal(left.y, 50);
});

test('확실하지 않은 얼굴 · 뒤쪽 작은 얼굴은 기준에서 뺌', () => {
  assert.equal(fit(2000, 3000, [face(0.4, 0.05), face(0.5, 0.9, 0.1, 0.35)]).whole, false);
  assert.equal(fit(2000, 3000, [face(0.4, 0.05, 0.2), face(0.5, 0.9, 0.03)]).whole, false);
});

test('이상한 크기 값에도 멈추지 않음', () => {
  assert.equal(fit(0, 0).whole, false);
  assert.equal(fit(1, 1).whole, false);
});

const html = (photoFit?: any) => cardHtml({ copy: { title: 't', sub: 's', scene: '' }, index: 0, style: '따뜻한 일러스트', size: '1080x1350', brand: { main: '#111111', accent: '#222222' }, dojoName: 'd', backgroundFile: 'C:/x/photo.jpg', fontDir: 'C:/f' } as any);
const htmlFit = (photoFit: any) => cardHtml({ copy: { title: 't', sub: 's', scene: '' }, index: 0, style: '따뜻한 일러스트', size: '1080x1350', brand: { main: '#111111', accent: '#222222' }, dojoName: 'd', backgroundFile: 'C:/x/photo.jpg', fontDir: 'C:/f', photoFit } as any);

test('카드 HTML: 맞춤 정보가 없으면 지금 모양 그대로, 전체 보기면 흐린 배경을 깖', () => {
  assert.match(html(), /object-fit:cover;object-position:center 40%/);
  assert.doesNotMatch(html(), /id="imgbg"/);
  const whole = htmlFit({ w: 2000, h: 3000, faces: [] });
  assert.match(whole, /object-fit:contain/);
  assert.match(whole, /id="imgbg"/);
  assert.match(htmlFit({ w: 2000, h: 3000, faces: [face(0.4, 0.02)] }), /object-position:50% \d/);
});
