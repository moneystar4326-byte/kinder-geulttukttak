// 사진 글 실제 AI 백테스트 (배포 전 확인용, npm test 에 넣지 않음). 실제 OpenAI 를 부르므로 비용이 듦
//   npx tsx tests/e2e/photo-real.bt.mts <사진 폴더> <주제> <키 파일 폴더> <결과 json>
// 키는 태권 자료 폴더의 secrets.bin · Local State 를 임시 자료 폴더에 복사해서 씀 (값을 읽거나 출력하지 않음). 끝나면 임시 폴더 지움
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../../src/main/db';
import { NAVER_AUTO_TERMS_VERSION } from '../../src/shared/naverAuto';
import type { PhotoState } from '../../src/shared/types';

const [photoDir, topic, keyDir, outFile, extraArg, askArg] = process.argv.slice(2); // extraArg: 짧은 장면 물음에 적을 답, askArg: 글 전체 물음에 적을 답 (둘 다 | 로 나눔)
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtd-photo-real-'));
for (const f of ['secrets.bin', 'Local State']) fs.copyFileSync(path.join(keyDir, f), path.join(dataDir, f));
const seed = openDb(path.join(dataDir, 'app.db'));
seed.setSetting('app', { naverAuto: { version: NAVER_AUTO_TERMS_VERSION, at: '2026-11-10T00:00:00Z', appVersion: 'test' }, setupDone: true });
seed.setSetting('photoFolder', photoDir);
seed.saveProfile({ id: 'default', name: '요요유치원', region: '서울 동작구 신대방동', audiences: [], philosophy: '놀이 중심', classFeatures: '', brand: { main: '#3E8E6E', accent: '#F2A541' }, tone: '따뜻한 설명형', avoidWords: '' } as any);
seed.close();
const { ELECTRON_RUN_AS_NODE: _a, GTD_DATA_DIR: _b, OPENAI_BASE_URL: _c, ...env } = process.env;
const app = await electron.launch({ args: ['.'], env: { ...env, GTD_DATA_DIR: dataDir, GTD_LICENSE_OFF: '1', GTD_SERVER: 'http://127.0.0.1:9' } as any });
let result: any = { topic, error: null };
const page = await app.firstWindow();
try {
  const call = <T,>(ch: string, arg?: unknown) => page.evaluate(async ([c, a]) => { const r = await (window as any).gtd.call(c, a); if (!r.ok) throw new Error(r.error); return r.data; }, [ch, arg] as const) as Promise<T>;
  await page.waitForSelector('.side');
  await page.click('button.nav:has-text("사진으로 글쓰기")');
  await page.waitForSelector('text=이번 글에 넣을 사진');
  await page.waitForTimeout(2500);
  await page.fill('input[placeholder^="예: 7세반 친구들이"]', topic);
  while (await page.locator('button:has-text("이름 아님")').count()) await page.locator('button:has-text("이름 아님")').first().click();
  if (await page.locator('button:has-text("같이 쓰기")').count()) await page.click('button:has-text("같이 쓰기")');
  await page.locator('button:has-text("글 만들기")').click({ timeout: 15000 });
  // 물음을 받으려고 AI를 부르는 동안 기다림 → 물음 칸이 뜨거나 사진 확인 화면으로 넘어감
  // 물음을 받으려고 AI를 부르는 동안 기다림 → 물음 칸이 뜨거나 글이 만들어지기 시작함 ("사진 확인" 글자는 안내문에도 있어서 쓰지 않음)
  for (const t0 = Date.now(); ; ) {
    if (await page.locator('.ask-more, .ask-scenes').count()) break;
    if ((await call<any[]>('article:list').catch(() => [])).length) break;
    if (Date.now() - t0 > 180000) throw new Error('물음 칸이 뜨지 않음');
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(500);
  if (await page.locator('.ask-more').count()) {
    result.asks = (await page.locator('.ask-more .field').allInnerTexts()).map((x) => x.trim().split(/\r?\n/)[0]);
    const ans = (askArg ?? '').split('|');
    const inputs = page.locator('.ask-more input');
    for (let i = 0; i < await inputs.count(); i++) await inputs.nth(i).fill(ans[i] ?? '');
  }
  if (await page.locator('.ask-scenes').count()) {
    result.asked = (await page.locator('.ask-scenes .field').allInnerTexts()).map((x) => x.trim().split(/\r?\n/)[0]);
    const ans = (extraArg ?? '').split('|');
    const inputs = page.locator('.ask-scenes input');
    for (let i = 0; i < await inputs.count(); i++) await inputs.nth(i).fill(ans[i] ?? '');
    const go = page.locator('button:has-text("이대로 글 만들기")');
    if (await go.isDisabled()) throw new Error('짧은 장면 물음에 답이 모자라 만들 수 없음');
    await go.click();
    await page.waitForTimeout(3000);
  } else if (await page.locator('.ask-more').count()) {
    await page.locator('button:has-text("이대로 글 만들기")').click();
    await page.waitForTimeout(3000);
  }
  await page.waitForSelector('text=사진 확인', { timeout: 600000 });
  const id = (await call<any[]>('article:list'))[0].id as string;
  for (const t0 = Date.now(); ; ) {
    const st = await call<PhotoState>('photos:state', id);
    if (!st.items.some((x) => x.status === 'pending')) break;
    if (Date.now() - t0 > 300000) throw new Error('사진 처리 시간 초과');
    await page.waitForTimeout(1000);
  }
  let v: any;
  for (const t0 = Date.now(); ; ) {
    v = await call<any>('article:get', id);
    if (v.version && !['generating', 'validating'].includes(v.article.status)) break;
    if (Date.now() - t0 > 600000) throw new Error('글 만들기 시간 초과');
    await page.waitForTimeout(2000);
  }
  result = { ...result, topic, title: v.version.title, sections: v.version.doc.sections, flags: v.version.doc.reviewFlags, main: v.article.input.mainKeyword, subs: v.article.input.subKeywords };
} catch (e: any) {
  result.error = String(e?.message ?? e).slice(0, 400);
  result.screen = (await page.locator('main, .content, body').first().innerText().catch(() => '')).slice(-1500);
  await page.screenshot({ path: outFile.replace(/\.json$/, '.png'), fullPage: true }).catch(() => {});
} finally {
  await app.close();
  fs.writeFileSync(outFile, JSON.stringify(result, null, 1));
  try { fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }); } catch { console.log('임시 폴더 지우기 실패', dataDir); }
  console.log('임시 폴더 지움:', !fs.existsSync(dataDir), result.error ?? '');
}
