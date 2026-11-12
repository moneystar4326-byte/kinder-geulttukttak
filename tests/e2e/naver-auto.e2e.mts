// 네이버 자동 입력(예전 방식) 켜기 동의 시험 (태권 글뚝딱 2.8.0에서 옮김): 기본 꺼짐 · 숨김 · 메인에서도 막음 · 3개 체크해야 켜짐 · 끄면 다시 숨김
// 가짜 글 · 바깥 접속 없음 (네이버 창을 열지 않음, 이용권 서버 주소도 이 PC 안의 닫힌 주소로 돌림)
// 실행: node scripts/build.mjs && npx tsx tests/e2e/naver-auto.e2e.mts [결과 폴더]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright-core';
import { openDb } from '../../src/main/db';
import { NAVER_AUTO_OFF_MSG, NAVER_AUTO_TERMS_VERSION } from '../../src/shared/naverAuto';

const outDir = process.argv[2] ?? fs.mkdtempSync(path.join(os.tmpdir(), 'gtd-auto-out-'));
fs.mkdirSync(outDir, { recursive: true });
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtd-auto-e2e-'));
const seed = openDb(path.join(dataDir, 'app.db'));
// 예전 버전 문구에 동의했던 기록: 문구가 바뀌었으니 꺼진 것으로 봐야 함
seed.setSetting('app', { setupDone: true, naverAuto: { version: '옛 문구', at: '2026-11-01T00:00:00Z', appVersion: '1.0.9' } });
const title = '[시험] 자동 입력 동의';
const art = seed.createArticle('default', { kind: '수업 후기', audience: '유아 (만 3~5세)', region: '', topic: '시험', facts: {}, mainKeyword: '', subKeywords: [], tone: '따뜻한 설명형', ending: '', includeProfile: { philosophy: false, classFeatures: false, credentials: false, contact: false, address: false }, withCards: false } as any, [], false);
seed.addVersion({ articleId: art.id, title, doc: { titleCandidates: [title], sections: [{ id: 's1', heading: '시험 글', paragraphs: ['시험 문단이에요.'] }], tags: [], photoSuggestions: [], reviewFlags: [] } as any, counts: { withSpaces: 10, withoutSpaces: 8 }, note: '시험' });
seed.close();

const { ELECTRON_RUN_AS_NODE: _a, GTD_DATA_DIR: _b, ...env } = process.env;
const app = await electron.launch({ args: ['.'], env: { ...env, GTD_DATA_DIR: dataDir, GTD_SERVER: 'http://127.0.0.1:9' } as any });
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForSelector('.side');
  const call = (ch: string, arg?: unknown) => page.evaluate(([c, a]) => (window as any).gtd.call(c, a), [ch, arg] as const);
  const openArticle = async () => {
    await page.click('button.nav:has-text("작성 이력")');
    await page.locator('.list-row', { hasText: title }).locator('button:has-text("열기")').click();
    await page.locator('[data-testid="paste-helper"]').waitFor();
    await page.waitForTimeout(500);
  };

  // ① 기본 꺼짐: 글 화면에 자동 입력 칸이 없고, 메인 통로도 막힘
  await openArticle();
  assert.equal(await page.locator('[data-testid="naver-auto-panel"]').count(), 0, '꺼져 있으면 칸이 없음');
  for (const [ch, arg] of [['naver:fill', { articleId: art.id, onExisting: 'new' }], ['naver:openLogin', undefined]] as const) {
    const r = await call(ch, arg);
    assert.equal(r.ok, false, `${ch} 는 막혀야 함`);
    assert.equal(r.error, NAVER_AUTO_OFF_MSG, `${ch}: ${r.error}`);
  }
  // 화면의 설정 저장으로는 켤 수 없음 (동의 기록은 메인만 씀)
  await call('settings:save', { naverAuto: { version: NAVER_AUTO_TERMS_VERSION, at: 'x', appVersion: 'x' } } as any);
  assert.equal((await call('naver:openLogin')).ok, false, 'settings:save 로 켜지면 안 됨');
  // 체크를 다 안 하면 메인이 거절
  assert.equal((await call('naverAuto:consent', { version: NAVER_AUTO_TERMS_VERSION, checks: [true, true, false] })).ok, false);
  assert.equal((await call('naverAuto:consent', { version: '옛 문구', checks: [true, true, true] })).ok, false);

  // ② 설정 → 고급: 안내를 열고 3개를 모두 체크해야 [동의하고 켜기]
  await page.click('button.nav:has-text("설정")');
  const box = page.locator('[data-testid="naver-auto"]');
  await box.locator('summary').click();
  assert.ok((await box.locator('summary').innerText()).includes('꺼짐'));
  assert.equal(await page.locator('button:has-text("브라우저 열기 · 로그인")').count(), 0, '꺼져 있으면 로그인 칸도 숨김');
  await box.locator('[data-testid="naver-auto-open"]').click();
  const agree = box.locator('[data-testid="naver-auto-agree"]');
  assert.ok(await agree.isDisabled());
  await box.locator('[data-testid="naver-auto-check-0"]').check();
  await box.locator('[data-testid="naver-auto-check-1"]').check();
  assert.ok(await agree.isDisabled(), '두 개만 체크하면 못 켬');
  await box.locator('[data-testid="naver-auto-check-2"]').check();
  await box.locator('[data-testid="naver-auto-terms"]').screenshot({ path: path.join(outDir, 'naver-auto-terms.png') });
  await agree.click();
  await box.locator('text=켜짐 · 계정 제한 위험 있음').waitFor();
  assert.ok((await box.innerText()).includes(`안내문 ${NAVER_AUTO_TERMS_VERSION}`));
  await page.locator('button:has-text("브라우저 열기 · 로그인")').waitFor();
  const info = await call('app:info');
  assert.equal(info.data.settings.naverAuto.version, NAVER_AUTO_TERMS_VERSION);
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(info.data.settings.naverAuto.at));

  // ③ 켜면 글 화면에 경고 표시와 함께 칸이 보임
  await openArticle();
  const panel = page.locator('[data-testid="naver-auto-panel"]');
  await panel.waitFor();
  assert.ok((await panel.locator('h2').innerText()).includes('계정 제한 위험 있음'));

  // ④ 끄면 다시 숨김 · 막힘
  page.once('dialog', (d) => d.accept());
  await page.click('button.nav:has-text("설정")');
  await page.locator('[data-testid="naver-auto-off"]').click();
  await page.locator('[data-testid="naver-auto"] summary:has-text("꺼짐")').waitFor();
  assert.equal((await call('naver:openLogin')).ok, false);
  await openArticle();
  assert.equal(await page.locator('[data-testid="naver-auto-panel"]').count(), 0);
  assert.deepEqual(errors, []);
  console.log('통과', outDir);
} finally { await app.close(); }
