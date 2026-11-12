// 카드에 넣은 사진의 얼굴 가림 확인 시험 (유치원판, 태권 글뚝딱 2.6.x 카드 사진을 옮기며 더함)
// 확인 전에는 붙여넣기 도우미 · 네이버 입력이 막히고, [얼굴 가리기] 창에서 확인하면 풀리는지. 도형 합성 그림만 씀 · 바깥 접속 없음
//   python tests/e2e/make-test-photos.py <사진 폴더>
//   node scripts/build.mjs && npx tsx tests/e2e/card-photo-mask.e2e.mts <사진 폴더> [결과 폴더]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright-core';
import { openDb } from '../../src/main/db';
import { DEMO_PROFILE } from '../../src/main/services/openai/demo';

const photoDir = process.argv[2];
const outDir = process.argv[3] ?? fs.mkdtempSync(path.join(os.tmpdir(), 'gtd-cardmask-out-'));
fs.mkdirSync(outDir, { recursive: true });
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtd-cardmask-e2e-'));
const cardsDir = path.join(dataDir, 'assets', 'cards', 'seed');
fs.mkdirSync(cardsDir, { recursive: true });
const photo = path.join(cardsDir, 'photo-1.jpg');
fs.copyFileSync(path.join(photoDir, '01_낙엽으로 왕관 만들기.jpg'), photo);
const card = path.join(cardsDir, 'card-1.png');
fs.writeFileSync(card, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
const seed = openDb(path.join(dataDir, 'app.db'));
seed.setSetting('app', { setupDone: true });
seed.saveProfile({ ...DEMO_PROFILE, id: 'default', name: '햇살유치원', blogUrl: 'https://blog.naver.com/testblog', greeting: '', closing: '' } as any);
const title = '[시험] 카드 사진 얼굴 가림';
const art = seed.createArticle('default', { kind: '수업 후기', audience: '유아 (만 3~5세)', region: '', topic: '시험', facts: {}, mainKeyword: '', subKeywords: [], tone: '따뜻한 설명형', ending: '', includeProfile: { philosophy: false, classFeatures: false, credentials: false, contact: false, address: false }, withCards: true, greetings: false } as any, [], false);
seed.addVersion({ articleId: art.id, title, doc: { titleCandidates: [title], sections: [{ id: 's1', paragraphs: ['도입 문단이에요.'] }, { id: 's2', heading: '놀이 이야기', paragraphs: ['놀이 문단이에요.'] }], tags: [], photoSuggestions: [], reviewFlags: [] } as any, counts: { withSpaces: 20, withoutSpaces: 16 }, note: '시험' });
const cs = seed.createCardSet(seed.getArticle(art.id)!.currentVersionId!, { style: '깔끔한 정보형', size: '1080x1350', mode: 'template' } as any, [{ title: '카드 하나', sub: '시험 카드예요. 사진을 넣었어요.', scene: '', afterSectionId: 's1', index: 0 }]);
seed.updateCard(cs.cards[0].id, { status: 'done', outputPath: card, photoPath: photo });
seed.close();

const { ELECTRON_RUN_AS_NODE: _a, GTD_DATA_DIR: _b, ...env } = process.env;
const app = await electron.launch({ args: ['.'], env: { ...env, GTD_DATA_DIR: dataDir, GTD_LICENSE_OFF: '1', GTD_SERVER: 'http://127.0.0.1:9' } as any });
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const call = (ch: string, arg?: unknown) => page.evaluate(([c, a]) => (window as any).gtd.call(c, a), [ch, arg] as const) as Promise<{ ok: boolean; data?: any; error?: string }>;
  await page.waitForSelector('.side');
  // 확인 전: 붙여넣기 도우미 준비가 막힘
  const before = await call('paste:plan', { articleId: art.id, map: false });
  assert.equal(before.ok, false);
  assert.match(before.error ?? '', /얼굴 가림/);
  await page.click('button.nav:has-text("작성 이력")');
  await page.locator('.list-row', { hasText: title }).locator('button:has-text("열기")').click();
  await page.waitForSelector('text=아직 얼굴 가림을 확인하지 않았어요');
  await page.click('button:has-text("얼굴 가리기")');
  const dialog = page.locator('[role="dialog"][aria-label="사진 얼굴 가리기"]');
  await dialog.waitFor();
  const ok = dialog.locator('button:has-text("얼굴 없는 사진이 맞아요"), button:has-text("가리고 확인")');
  await page.waitForFunction(() => { const b = [...document.querySelectorAll('[role=dialog] button')].find((x) => /얼굴 없는 사진이 맞아요|가리고 확인/.test(x.textContent ?? '')) as HTMLButtonElement | undefined; return !!b && !b.disabled; }, undefined, { timeout: 120000 });
  await page.screenshot({ path: path.join(outDir, 'mask-dialog.png') });
  await ok.first().click();
  await dialog.waitFor({ state: 'detached' });
  await page.waitForSelector('text=아직 얼굴 가림을 확인하지 않았어요', { state: 'detached' });
  const after = await call('paste:plan', { articleId: art.id, map: false });
  assert.equal(after.ok, true, after.error ?? "");
  const c = (await call('article:get', art.id)).data.cardSet.cards[0];
  assert.equal(c.photoFit?.masked, true);
  assert.notEqual(c.photoPath, photo, '가린 사진으로 바뀜');
  assert.equal(fs.existsSync(photo), false, '가리기 전 복사본은 지움');
  await page.screenshot({ path: path.join(outDir, 'mask-done.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('통과', outDir);
} finally {
  await app.close().catch(() => {});
  fs.rmSync(dataDir, { recursive: true, force: true });
}
