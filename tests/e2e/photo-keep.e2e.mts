// 사진으로 글쓰기: 고른 사진 · 순서가 다른 메뉴에 다녀와도 유지되는지 (태권 글뚝딱 2.7.10에서 옮김). 합성 그림 폴더만 씀 · 바깥 접속 없음
// 실행: python tests/e2e/make-test-photos.py <사진 폴더> && node scripts/build.mjs && npx tsx tests/e2e/photo-keep.e2e.mts <사진 폴더>
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright-core';
import { openDb } from '../../src/main/db';

const photoDir = process.argv[2];
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtd-keep-e2e-'));
const seed = openDb(path.join(dataDir, 'app.db'));
seed.setSetting('app', { setupDone: true });
seed.setSetting('photoFolder', photoDir);
seed.close();

const { ELECTRON_RUN_AS_NODE: _a, GTD_DATA_DIR: _b, ...env } = process.env;
const app = await electron.launch({ args: ['.'], env: { ...env, GTD_DATA_DIR: dataDir, GTD_LICENSE_OFF: '1', GTD_SERVER: 'http://127.0.0.1:9' } as any });
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForSelector('.side');
  const boxes = page.locator('input[type=checkbox][aria-label$="고르기"]');
  const open = async () => { await page.click('button.nav:has-text("사진으로 글쓰기")'); await boxes.first().waitFor(); await page.waitForTimeout(800); };
  const order = () => boxes.evaluateAll((els) => (els as HTMLInputElement[]).filter((e) => e.checked).map((e) => e.getAttribute('aria-label')!));
  const unchecked = () => boxes.evaluateAll((els) => (els as HTMLInputElement[]).filter((e) => !e.checked).map((e) => e.getAttribute('aria-label')!));

  await open();
  const first = await order();
  assert.equal(first.length, 4, '처음에는 안 쓴 사진 모두 선택');
  await page.locator(`input[aria-label="${first[0]}"]`).uncheck();
  await page.waitForTimeout(300);
  await page.locator('button[aria-label="아래로"]').first().click();
  await page.waitForTimeout(300);
  const want = await order();
  assert.equal(want.length, 3);
  assert.deepEqual(want, [first[2], first[1], first[3]], '해제 · 순서 바꿈 적용');

  await page.click('button.nav:has-text("작성 이력")');
  await page.waitForTimeout(800);
  await open();
  assert.deepEqual(await order(), want, '다른 메뉴에 다녀와도 고른 사진 · 순서 유지');
  assert.deepEqual(await unchecked(), [first[0]], '해제한 사진이 다시 선택되지 않음');

  await page.reload();
  await page.waitForSelector('.side');
  await open();
  assert.deepEqual(await order(), want, '앱 화면을 다시 불러와도 유지');
  assert.deepEqual(errors, []);
  console.log('통과');
} finally {
  await app.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
