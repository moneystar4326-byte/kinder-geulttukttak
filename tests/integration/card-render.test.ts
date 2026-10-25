// 카드 HTML을 실제 크로미움 엔진으로 그려 넘침 검사 · 폰트 로딩 · 크기 확인. 결과 PNG는 tests/output/ (눈으로 확인용)
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser } from 'playwright-core';
import { findBrowser } from '../../src/main/services/browser-draft/browser';
import { cardHtml, MEASURE_JS, sizeOf, type Measure } from '../../src/main/services/card-renderer/template';
import { CARD_STYLES, type CardCopy, type CardSize, type CardStyle } from '../../src/shared/types';

const exe = findBrowser();
let browser: Browser;
const OUT = path.resolve('tests/output');
const fontDir = path.resolve('resources/fonts');
before(async () => { if (exe) { browser = await chromium.launch({ executablePath: exe.path, headless: true }); fs.mkdirSync(OUT, { recursive: true }); } });
after(async () => { await browser?.close(); });

async function render(copy: CardCopy, style: CardStyle, size: CardSize, name: string, index = 0, backgroundFile?: string): Promise<Measure> {
  const { w, h } = sizeOf(size);
  const html = cardHtml({ copy, index, style, size, brand: { main: '#1F4E9A', accent: '#C8241C' }, dojoName: '강담태권도', fontDir, backgroundFile });
  const tmp = path.join(os.tmpdir(), `gtd-${name}.html`);
  fs.writeFileSync(tmp, html, 'utf-8');
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(tmp).href);
  const m = (await page.evaluate(MEASURE_JS)) as Measure;
  await page.screenshot({ path: path.join(OUT, `${name}.png`), clip: { x: 0, y: 0, width: w, height: h } });
  await page.close();
  return m;
}

const NORMAL: CardCopy[] = [
  { title: '친구들 앞에서 망설이는 우리 아이', sub: '여러 사람의 눈이 모이면 머뭇거리는 것은 자연스러운 일이에요. 그 순간을 함께 넘는 연습을 했어요.', scene: '' },
  { title: '품새 발표로 연습하는 작은 도전', sub: '태극 1장 · 2장을 복습하고, 움직이기 전에 방향을 먼저 보는 시선 처리를 연습했어요.', scene: '' },
  { title: '완벽한 한 번보다 다시 해보는 경험', sub: '망설인 뒤에 다시 앞에 선 마음, 그 작은 용기가 도전과 끈기를 키워요.', scene: '' },
];

test('세 가지 스타일 · 두 크기에서 권장 길이 문구는 넘치지 않음 + 폰트 로딩', { skip: !exe && '크롬 · 엣지 없음' }, async () => {
  for (const style of CARD_STYLES) for (const size of ['1080x1350', '1080x1080'] as CardSize[]) for (let i = 0; i < 3; i++) {
    const m = await render(NORMAL[i], style, size, `${style}_${size}_${i + 1}`, i);
    assert.equal(m.fontsOk, true, `${style} 폰트`);
    assert.equal(m.overflow, false, `${style} ${size} 카드${i + 1} 넘침 (제목 ${m.titleLines}줄, 보조 ${m.subLines}줄)`);
  }
});

test('너무 긴 문구는 넘침으로 판정 (자동 축소하지 않음)', { skip: !exe && '크롬 · 엣지 없음' }, async () => {
  const long = { title: '친구들 앞에서 망설이는 우리 아이를 위한 아주 긴 제목이 여기 계속 이어지고 또 이어집니다', sub: '보조 문구가 아주 길어지면 '.repeat(14), scene: '' };
  const m = await render(long, '따뜻한 일러스트', '1080x1080', 'overflow_check');
  assert.equal(m.overflow, true);
});

test('AI 배경 위 합성 (세로 그림을 4:5로 자름)', { skip: !exe && '크롬 · 엣지 없음' }, async () => {
  // 1024x1536 시험 배경 (단색 그라데이션 PNG 를 크로미움으로 만듦)
  const bg = path.join(OUT, 'test-bg.png');
  const p = await browser.newPage({ viewport: { width: 1024, height: 1536 } });
  await p.setContent('<body style="margin:0;width:1024px;height:1536px;background:linear-gradient(#cfe3ff,#f5e1c8)"></body>');
  await p.screenshot({ path: bg });
  await p.close();
  const m = await render(NORMAL[1], '교육 잡지형', '1080x1350', 'ai_bg_composite', 1, bg);
  assert.equal(m.broken.length, 0);
  assert.equal(m.overflow, false);
});
