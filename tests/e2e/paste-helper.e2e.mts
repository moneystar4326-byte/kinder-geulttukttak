// 붙여넣기 도우미 시험 (태권 글뚝딱 2.8.0에서 옮김): 단계 순서대로 클립보드에 글 · 그림 · 유치원 이름이 담기는지
// 가짜 글 · 가짜 1px 카드 · 바깥 접속 없음 (이용권 서버 주소도 이 PC 안의 닫힌 주소로 돌림). 네이버 글쓰기 열기 버튼은 누르지 않음
// 실행: node scripts/build.mjs && npx tsx tests/e2e/paste-helper.e2e.mts [결과 폴더]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright-core';
import { openDb } from '../../src/main/db';
import { DEMO_PROFILE } from '../../src/main/services/openai/demo';

const outDir = process.argv[2] ?? fs.mkdtempSync(path.join(os.tmpdir(), 'gtd-paste-out-'));
fs.mkdirSync(outDir, { recursive: true });
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtd-paste-e2e-'));
const card = path.join(dataDir, 'card-1.png');
fs.writeFileSync(card, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
const seed = openDb(path.join(dataDir, 'app.db'));
seed.setSetting('app', { setupDone: true });
seed.saveProfile({ ...DEMO_PROFILE, id: 'default', name: '햇살유치원', mapName: '', address: '시험시 시험로 1', blogUrl: 'https://blog.naver.com/testblog', greeting: '', closing: '' } as any);
const title = '[시험] 붙여넣기 도우미';
const art = seed.createArticle('default', { kind: '수업 후기', audience: '유아 (만 3~5세)', region: '', topic: '시험', facts: {}, mainKeyword: '', subKeywords: [], tone: '따뜻한 설명형', ending: '', includeProfile: { philosophy: false, classFeatures: false, credentials: false, contact: false, address: false }, withCards: true, greetings: false } as any, [], false);
seed.addVersion({ articleId: art.id, title, doc: { titleCandidates: [title], sections: [{ id: 's1', paragraphs: ['도입 문단이에요.'] }, { id: 's2', heading: '🌱 놀이 이야기', paragraphs: ['놀이 문단이에요.', '햇님반 담임 선생님 드림'] }], tags: ['시험태그'], photoSuggestions: [], reviewFlags: [] } as any, counts: { withSpaces: 20, withoutSpaces: 16 }, note: '시험' });
const cs = seed.createCardSet(seed.getArticle(art.id)!.currentVersionId!, { style: '깔끔한 정보형', size: '1080x1350', mode: 'ai' } as any, [{ title: '카드 하나', sub: '시험 카드', scene: '시험 장면', afterSectionId: 's1', index: 0 }]);
seed.updateCard(cs.cards[0].id, { status: 'done', outputPath: card });
seed.close();

const { ELECTRON_RUN_AS_NODE: _a, GTD_DATA_DIR: _b, ...env } = process.env;
const app = await electron.launch({ args: ['.'], env: { ...env, GTD_DATA_DIR: dataDir, GTD_SERVER: 'http://127.0.0.1:9' } as any });
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e.stack).slice(0, 600)));
  await page.waitForSelector('.side');
  await page.click('button.nav:has-text("작성 이력")');
  await page.locator('.list-row', { hasText: title }).locator('button:has-text("열기")').click();
  const box = page.locator('[data-testid="paste-helper"]');
  await box.waitFor().catch(async (e) => { await page.screenshot({ path: path.join(outDir, 'fail.png'), fullPage: true }); console.log('화면 오류', errors); throw e; });
  await box.scrollIntoViewIfNeeded();
  // 유치원판에는 영상 고르기가 없음
  assert.equal(await box.locator('[data-testid="paste-video"]').count(), 0);
  await box.locator('button:has-text("도우미 시작")').click();
  await page.waitForSelector('[data-testid="paste-step-0"]');
  const labels = await box.locator('li > .row > b').allInnerTexts();
  console.log(labels.join(' | '));
  assert.deepEqual(labels.map((l) => l.replace(/^\d+\. /, '').split(' · ')[0]), ['제목', '본문 서식 정하기', '글', '그림', '글', '유치원 지도']);
  assert.ok(await box.locator('text=나눔스퀘어 → 16 → 가운데 정렬 → 180%').isVisible());
  assert.ok(!/도장|관장|태권/.test(await box.innerText()), '유치원 말만');
  await box.screenshot({ path: path.join(outDir, 'paste-start.png') });

  // 자동 입력(예전 방식)은 동의 전이라 칸이 없음
  assert.equal(await page.locator('[data-testid="naver-auto-panel"]').count(), 0);
  // 같이 넣을 것: 도우미 안에서 지도를 끄면 단계가 다시 만들어짐
  const mapBox = box.locator('[data-testid="paste-extras"] label:has-text("유치원 지도 넣기") input');
  await mapBox.uncheck();
  await box.locator('li > .row > b', { hasText: '유치원 지도' }).waitFor({ state: 'detached' });
  await mapBox.check();
  await box.locator('li > .row > b', { hasText: '유치원 지도' }).waitFor();

  const next = box.locator('[data-testid="paste-next"]');
  const text = () => app.evaluate(({ clipboard }) => clipboard.readText());
  const html = () => app.evaluate(async ({ clipboard }) => { for (const it of await (clipboard as any).read()) if (it.types.includes('text/html')) return await (await it.getType('text/html')).text(); return ''; });
  await app.evaluate(({ clipboard }) => clipboard.clear());
  await next.click(); await page.waitForTimeout(300);
  assert.equal(await text(), title);
  await next.click(); await page.waitForTimeout(300); // 서식 안내: 복사 없이 넘어감
  assert.equal(await text(), title);
  await box.locator('text=서식을 골랐으면').waitFor();
  await next.click(); await page.waitForTimeout(300);
  assert.ok((await text()).includes('도입 문단이에요.'));
  await next.click(); await page.waitForTimeout(300);
  // Electron 44: readImage 없음 → 비동기 read 로 그림 형식이 있는지 확인
  const img = await app.evaluate(async ({ clipboard }) => { const items = await (clipboard as any).read(); const out: { types: string[]; size: number }[] = []; for (const it of items) { const b = it.types.includes('image/png') ? await it.getType('image/png') : null; out.push({ types: [...it.types], size: b ? b.size : 0 }); } return out; });
  assert.ok(img.some((i) => i.types.includes('image/png') && i.size > 0), JSON.stringify(img));
  await next.click(); await page.waitForTimeout(300);
  const body = await text();
  // 소제목 꾸며서 복사 (기본 켬): 네이버가 쓰는 HTML 도 함께, 소제목 줄만 굵게 · 24
  const bodyHtml = await html();
  assert.ok(bodyHtml.includes('<b><span style="font-size:24px">🌱 놀이 이야기</span></b>'), bodyHtml);
  assert.ok(bodyHtml.includes('놀이 문단이에요.') && !bodyHtml.includes('<b><span style="font-size:24px">놀이 문단'), bodyHtml);
  assert.ok(body.startsWith('🌱 놀이 이야기') && body.includes('놀이 문단이에요.') && body.includes('햇님반 담임 선생님 드림') && body.includes('#시험태그'), body);
  await next.click(); await page.waitForTimeout(300);
  assert.equal(await text(), '햇살유치원');
  await box.locator('text=다 복사했어요').waitFor();
  assert.equal(await next.count(), 0);

  // 끝 점검표: 다 체크하면 발행 안내
  const chk = box.locator('[data-testid="paste-check"]');
  await chk.waitFor();
  assert.ok(await chk.locator('text=소제목 1개').isVisible());
  assert.ok(await chk.locator('text=그림 1장').isVisible());
  const boxes = chk.locator('input[type=checkbox]');
  const nChk = await boxes.count();
  assert.equal(nChk, 5, '제목 · 글 · 소제목 · 그림 · 지도');
  for (let i = 0; i < nChk; i++) await boxes.nth(i).check();
  await chk.locator('text=다 확인했어요').waitFor();
  await box.screenshot({ path: path.join(outDir, 'paste-done.png') });

  // 소제목 꾸미기를 끄고 지난 단계를 다시 복사: 글자만 담기고(HTML 없음) 진행 위치는 끝 그대로 (뒤쪽이 두 번 들어가지 않게)
  await box.locator('[data-testid="paste-rich"] input').uncheck();
  await box.locator('[data-testid="paste-step-4"] button:has-text("복사")').click(); await page.waitForTimeout(300);
  assert.ok((await text()).startsWith('🌱 놀이 이야기'));
  assert.equal(await html(), '', '글자만 복사');
  assert.equal(await next.count(), 0, '끝난 상태 그대로');
  assert.ok(await chk.isVisible());
  await box.locator('[data-testid="paste-rich"] input').check();

  // 처음부터 → 이어 하기 위치가 0으로
  await box.locator('button:has-text("처음부터")').click();
  assert.ok((await next.innerText()).includes('1/6'));

  // 빠르게 두 번 눌러도 한 단계만 넘어감
  await next.dblclick(); await page.waitForTimeout(600);
  assert.ok((await next.innerText()).includes('2/6'), await next.innerText());
  assert.equal(await text(), title);

  // 준비한 뒤 글이 바뀌면: 복사하지 않고 단계를 다시 만들어 알려 줌 → 다시 누르면 새 글이 복사됨
  await next.click(); await page.waitForTimeout(300); // 서식 단계 (서버 호출 없음)
  const changed = await page.evaluate(async (id) => {
    const g = (window as any).gtd;
    const b = (await g.call('article:get', id)).data;
    const v = b.version;
    const doc = { ...v.doc, sections: v.doc.sections.map((s: any, i: number) => (i === 0 ? { ...s, paragraphs: ['고친 도입 문단이에요.'] } : s)) };
    return (await g.call('article:saveEdit', { id, title: v.title, doc })).ok;
  }, art.id);
  assert.ok(changed);
  await app.evaluate(({ clipboard }) => clipboard.writeText('그대로'));
  await next.click();
  await box.locator('text=단계가 달라졌어요').waitFor();
  assert.equal(await text(), '그대로', '바뀐 뒤 옛 단계로 복사하면 안 됨');
  assert.ok((await next.innerText()).includes('3/6'), `하던 단계에 머묾: ${await next.innerText()}`);
  assert.ok(await box.locator('li > .row > b', { hasText: '고친 도입 문단이에요.' }).isVisible());
  await next.click(); await page.waitForTimeout(300);
  assert.ok((await text()).includes('고친 도입 문단이에요.'));
  assert.ok((await next.innerText()).includes('4/6'));

  // 다른 화면에 다녀와서 [도우미 시작]을 눌러도 하던 단계(4번 그림)에서 이어 감
  await page.click('button.nav:has-text("작성 이력")');
  await page.locator('.list-row', { hasText: title }).locator('button:has-text("열기")').click();
  const box2 = page.locator('[data-testid="paste-helper"]');
  await box2.waitFor();
  await box2.locator('button:has-text("도우미 시작")').click();
  await box2.locator('[data-testid="paste-next"]').waitFor();
  assert.ok((await box2.locator('[data-testid="paste-next"]').innerText()).includes('4/6'), await box2.locator('[data-testid="paste-next"]').innerText());
  assert.deepEqual(errors, []);
  console.log('통과', outDir);
} finally { await app.close(); }
