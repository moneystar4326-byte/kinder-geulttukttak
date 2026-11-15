// 일반 글(한 줄 쓰기) 실제 AI 백테스트 (배포 전 확인용, npm test 에 넣지 않음). 실제 OpenAI 를 부르므로 비용이 듦
//   npx tsx tests/e2e/gen-real.bt.mts <메모> <답1|답2|…(없으면 '')> <키 파일 폴더> <결과 json> [평소 글]
// 키는 secrets.bin · Local State 를 임시 자료 폴더에 복사해서 씀 (값을 읽거나 출력하지 않음). 끝나면 앱을 닫고 임시 폴더 지움
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../../src/main/db';
import { NAVER_AUTO_TERMS_VERSION } from '../../src/shared/naverAuto';

const [memo, answers, keyDir, outFile, voice] = process.argv.slice(2);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtd-gen-real-'));
for (const f of ['secrets.bin', 'Local State']) fs.copyFileSync(path.join(keyDir, f), path.join(dataDir, f));
const seed = openDb(path.join(dataDir, 'app.db'));
seed.setSetting('app', { naverAuto: { version: NAVER_AUTO_TERMS_VERSION, at: '2026-11-10T00:00:00Z', appVersion: 'test' }, setupDone: true });
seed.saveProfile({ id: 'default', name: '요요유치원', region: '서울 동작구 신대방동', audiences: [], philosophy: '놀이 중심', classFeatures: '', brand: { main: '#3E8E6E', accent: '#F2A541' }, tone: '따뜻한 설명형', avoidWords: '', voiceSamples: voice ?? '' } as any);
seed.close();
const { ELECTRON_RUN_AS_NODE: _a, GTD_DATA_DIR: _b, OPENAI_BASE_URL: _c, ...env } = process.env;
const app = await electron.launch({ args: ['.'], env: { ...env, GTD_DATA_DIR: dataDir, GTD_LICENSE_OFF: '1', GTD_SERVER: 'http://127.0.0.1:9' } as any });
const result: any = { memo, asks: [], blocked: null, error: null };
const page = await app.firstWindow();
try {
  const call = <T,>(ch: string, arg?: unknown) => page.evaluate(async ([c, a]) => { const r = await (window as any).gtd.call(c, a); if (!r.ok) throw new Error(r.error); return r.data; }, [ch, arg] as const) as Promise<T>;
  await page.waitForSelector('.side');
  await page.click('button.nav:has-text("새 글 작성")');
  await page.waitForTimeout(1500);
  await page.locator('textarea:visible').first().fill(memo);
  await page.getByRole('button', { name: '바로 글 만들기' }).click({ timeout: 15000 });
  const asked = await page.getByRole('button', { name: '이대로 글 만들기' }).waitFor({ timeout: 90000 }).then(() => true, () => false);
  if (asked) {
    result.asks = (await page.locator('.note.info .field').allInnerTexts()).map((x) => x.trim().split('\n')[0]);
    const ans = (answers ?? '').split('|').filter(Boolean);
    const inputs = page.locator('.note.info input');
    for (let i = 0; i < Math.min(ans.length, await inputs.count()); i++) await inputs.nth(i).fill(ans[i]);
    await page.waitForTimeout(300);
    const btn = page.getByRole('button', { name: '이대로 글 만들기' });
    if (await btn.isDisabled()) result.blocked = (await page.locator('.note.info').innerText()).replace(/\s+/g, ' ').slice(-160);
    else await btn.click();
  }
  if (!result.blocked) {
    let v: any;
    for (const t0 = Date.now(); ; ) {
      const list = await call<any[]>('article:list').catch(() => []);
      if (list[0]) { v = await call<any>('article:get', list[0].id); if (v.version && !['generating', 'validating'].includes(v.article.status)) break; }
      if (Date.now() - t0 > 600000) throw new Error('글 만들기 시간 초과');
      await page.waitForTimeout(2000);
    }
    result.title = v.version.title; result.sections = v.version.doc.sections; result.flags = v.version.doc.reviewFlags; result.main = v.article.input.mainKeyword;
  }
} catch (e: any) {
  result.error = String(e?.message ?? e).slice(0, 300);
  result.screen = (await page.locator('body').innerText().catch(() => '')).slice(-800);
} finally {
  await app.close().catch(() => {});
  fs.writeFileSync(outFile, JSON.stringify(result, null, 1));
  try { fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }); } catch { console.log('임시 폴더 지우기 실패', dataDir); }
  console.log('임시 폴더 지움:', !fs.existsSync(dataDir), result.error ?? '', result.blocked ? '막힘' : '');
}
