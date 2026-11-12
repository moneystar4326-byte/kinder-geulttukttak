// 사진으로 글쓰기 전체 흐름 시험 (태권 글뚝딱 2.5.0 · 2.7.x에서 옮김). 앱을 실제로 띄움 · npm test 에는 넣지 않음
//   python tests/e2e/make-test-photos.py <사진 폴더>   (도형만 그린 합성 그림 — 진짜 아이 사진을 쓰지 않음)
//   node scripts/build.mjs && npx tsx tests/e2e/photo-flow.e2e.mts <사진 폴더> [결과 폴더]
// AI는 이 PC의 가짜 서버(OPENAI_BASE_URL)로 대신함 → 비용 없음 · 사진이 밖으로 나가지 않음. 이용권 서버도 닫힌 주소. 네이버 입력은 tests/integration 의 모의 편집기로 시험
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright-core';
import { openDb } from '../../src/main/db';
import { NAVER_AUTO_TERMS_VERSION } from '../../src/shared/naverAuto'; // 자동 입력 칸도 시험하므로 동의한 상태로
import { hashOf } from '../../src/main/services/photo-folder';
import { jpegHasMetadata } from '../../src/shared/photos';
import type { PhotoState } from '../../src/shared/types';

const photoDir = process.argv[2];
const outDir = process.argv[3] ?? fs.mkdtempSync(path.join(os.tmpdir(), 'gtd-photo-out-'));
fs.mkdirSync(outDir, { recursive: true });
const sent: string[] = [];
let lastDoc: any = null;
// 유치원판 글은 줄글로 받음 (text.format 없음). 장면 소제목 줄 앞에 [p01] 표시, 이름이 든 장면은 이름을 그대로 써서 코드가 가리는지 봄
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const q = JSON.parse(body);
    sent.push(body);
    const name = q.text?.format?.name;
    const input = String(q.input);
    let out: any = null;
    let text: string | null = null;
    if (!name && /^아래 \[글\]은/.test(input)) text = input.slice(input.lastIndexOf('[글]') + 4).trim(); // 호흡 다듬기: 그대로 돌려줌
    else if (!name) {
      const scenes = [...input.matchAll(/^- (p\d\d): (.+)$/gm)];
      text = ['오늘 바깥놀이 이야기를 전해 드려요. 아이들은 무엇을 했을까요?', ...scenes.map((m) => `## [${m[1]}] ${m[2].slice(0, 12)}\n${m[2]}. 아이들이 즐거워했어요.`), '## 마무리\n오늘도 함께해 주셔서 고마워요.'].join('\n\n');
    } else if (name === 'article_meta') out = { titleCandidates: ['시험 제목 하나', '시험 제목 둘', '시험 제목 셋'], tags: ['유치원'], photoSuggestions: [], reviewFlags: [] };
    else if (name === 'article' && /^전체를/.test(input) && lastDoc) out = lastDoc; // 더 따뜻하게: 사진 번호를 모르는 응답
    else if (name === 'review') out = { flags: [] };
    else if (name === 'verify') out = { issues: [] };
    if (!out && text == null) { res.writeHead(400, { 'content-type': 'application/json' }); res.end('{"error":{"message":"not in fake"}}'); return; }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: 'r', object: 'response', status: 'completed', usage: {}, output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: text ?? JSON.stringify(out) }] }] }));
  });
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const port = (server.address() as any).port;

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtd-photo-e2e-'));
const seed = openDb(path.join(dataDir, 'app.db'));
seed.setSetting('app', { naverAuto: { version: NAVER_AUTO_TERMS_VERSION, at: '2026-11-10T00:00:00Z', appVersion: 'test' }, setupDone: true });
seed.setSetting('photoFolder', photoDir);
seed.saveProfile({ id: 'default', name: '시험유치원', region: '서울 동작구 신대방동', audiences: [], philosophy: '', classFeatures: '', brand: { main: '#3E8E6E', accent: '#F2A541' }, tone: '따뜻한 설명형', avoidWords: '' } as any);
seed.close();
const before = Object.fromEntries(fs.readdirSync(photoDir).map((f) => [f, hashOf(fs.readFileSync(path.join(photoDir, f)))]));

const { ELECTRON_RUN_AS_NODE: _drop, GTD_DATA_DIR: _d, ...env } = process.env;
const app = await electron.launch({ args: ['.'], env: { ...env, GTD_DATA_DIR: dataDir, GTD_LICENSE_OFF: '1', GTD_SERVER: 'http://127.0.0.1:9', OPENAI_BASE_URL: `http://127.0.0.1:${port}/v1` } as any });
try {
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const call = <T,>(ch: string, arg?: unknown) => page.evaluate(async ([c, a]) => { const r = await (window as any).gtd.call(c, a); if (!r.ok) throw new Error(r.error); return r.data; }, [ch, arg] as const) as Promise<T>;
  await page.waitForSelector('.side');
  await call('secrets:set', { name: 'openai', value: `sk-test${'x'.repeat(40)}` });
  await page.reload();
  await page.click('button.nav:has-text("사진으로 글쓰기")');
  await page.waitForSelector('text=이번 글에 넣을 사진');
  await page.waitForTimeout(2500);
  assert.ok(await page.locator('text=사진은 보내지 않아요').count(), '사진을 보내지 않는다는 안내');
  await page.screenshot({ path: path.join(outDir, '1-select.png'), fullPage: true });
  const start = page.locator('button:has-text("글 만들기")');
  assert.equal(await start.isDisabled(), true, '주제 없으면 시작 불가');
  await page.fill('input[placeholder^="예: 7세반 친구들이"]', '7세반 친구들이 바깥놀이터에서 낙엽 놀이를 했어요');
  // 이름 경고 · 장면 없는 사진을 처리해야 켜짐
  assert.equal(await start.isDisabled(), true, '이름 경고가 남으면 시작 불가');
  assert.ok(await page.locator('button:has-text("\\"민준\\" 이름 아님")').count(), '장면의 "민준이가"를 이름으로 경고');
  while (await page.locator('button:has-text("이름 아님")').count()) await page.locator('button:has-text("이름 아님")').first().click();
  if (await page.locator('button:has-text("같이 쓰기")').count()) await page.click('button:has-text("같이 쓰기")');
  for (const r of await page.locator('.list-row', { hasText: 'IMG_' }).all()) await r.locator('input[type=checkbox]').uncheck();
  assert.equal(await start.isDisabled(), false, '경고를 처리하면 시작 가능');
  await page.screenshot({ path: path.join(outDir, '2-ready.png'), fullPage: true });
  await start.click();
  await page.waitForSelector('text=사진 확인', { timeout: 60000 });
  const id = (await call<any[]>('article:list'))[0].id as string;
  const t0 = Date.now();
  let st: PhotoState;
  for (;;) {
    st = await call<PhotoState>('photos:state', id);
    if (!st.items.some((x) => x.status === 'pending')) break;
    assert.ok(Date.now() - t0 < 300_000, '처리 시간 초과');
    await page.waitForTimeout(1000);
  }
  console.log(`처리 ${st.items.length}장 ${Math.round((Date.now() - t0) / 1000)}초`);
  for (const x of st.items) console.log(`  ${x.id} ${x.title} → 상태 ${x.status} · 얼굴 ${x.faces} · ${x.error ?? ''}`);
  assert.equal(st.items.length, 3);
  assert.ok(st.items.every((x) => x.status === 'ready'), '모든 사진 처리');
  for (const x of st.items) {
    const b = fs.readFileSync(x.processedFile!);
    assert.equal(jpegHasMetadata(b), false, '처리본에 촬영 정보 없음');
    assert.equal(hashOf(b), x.processedHash);
  }
  assert.deepEqual(Object.fromEntries(fs.readdirSync(photoDir).map((f) => [f, hashOf(fs.readFileSync(path.join(photoDir, f)))])), before, '사진 폴더 그대로');
  assert.ok(st.blockers.length > 0, '확인 전에는 막힘');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(outDir, '3-check.png'), fullPage: true });
  assert.equal(await page.locator('button:has-text("네이버에 초안 입력")').isDisabled(), true, '확인 전 자동 입력 막힘');
  assert.ok(await page.locator('[data-testid="paste-helper"]').locator('text=사진 얼굴 가림 확인이 끝나야').count(), '확인 전 붙여넣기 도우미 막힘');

  // AI에 사진 · 경로가 가지 않음 (장면 글자만)
  assert.ok(sent.length > 0);
  for (const b of sent) { assert.ok(!b.includes(photoDir.replaceAll('\\', '\\\\')), '경로 전송 안 함'); assert.ok(!/base64|data:image|input_image/.test(b), '사진 전송 안 함'); }

  // 글에 들어간 장면 칸 이름은 코드가 "한 친구"로 바꿈
  let bundle = await call<any>('article:get', id);
  const body = JSON.stringify(bundle.version.doc.sections);
  assert.ok(!body.includes('민준'), `이름이 글에 남지 않음: ${body.slice(0, 300)}`);
  assert.ok(!/\[p\d\d\]/.test(body), '사진 번호 표시가 글에 남지 않음');
  assert.equal(bundle.version.doc.sections.filter((s: any) => s.photoId).length, 3, '장면마다 사진 연결');

  // 수동 가림 추가: 드래그 → 영역 늘고 처리본이 바뀜
  const img = page.locator('img[data-bg]');
  await img.scrollIntoViewIfNeeded();
  const b2 = (await img.boundingBox())!;
  await page.mouse.move(b2.x + 10, b2.y + 10); await page.mouse.down(); await page.mouse.move(b2.x + 60, b2.y + 60, { steps: 4 }); await page.mouse.up();
  let firstShown: PhotoState['items'][number] | undefined;
  for (let i = 0; i < 50 && !firstShown; i++) { await page.waitForTimeout(300); firstShown = (await call<PhotoState>('photos:state', id)).items.find((x) => x.regions.some((r) => r.source === 'manual')); }
  assert.ok(firstShown, '드래그로 가림 추가');
  assert.notEqual(firstShown!.processedHash, st.items.find((x) => x.id === firstShown!.id)!.processedHash, '처리본이 바뀜');

  // 가림 모양 바꾸기: 처리본이 다시 그려지고, 다시 동물로
  const beforeCover = (await call<PhotoState>('photos:state', id)).items.map((x) => x.processedHash);
  await page.click('button:has-text("모자이크")');
  let afterCover = beforeCover;
  for (let i = 0; i < 50 && afterCover.some((h, j) => h === beforeCover[j]); i++) { await page.waitForTimeout(300); afterCover = (await call<PhotoState>('photos:state', id)).items.map((x) => x.processedHash); }
  await page.waitForFunction(() => !document.querySelector('.spinner'), undefined, { timeout: 30000 });
  await page.screenshot({ path: path.join(outDir, '3b-mosaic.png') });
  await page.click('button:has-text("귀여운 동물")');
  await page.waitForTimeout(500);
  await page.waitForFunction(() => !document.querySelector('.spinner'), undefined, { timeout: 30000 });
  st = await call<PhotoState>('photos:state', id);
  assert.ok(st.items.every((x) => !x.confirmed), '모양을 바꾸면 다시 확인');
  for (const x of st.items) fs.copyFileSync(x.processedFile!, path.join(outDir, `processed-${x.id}.jpg`));

  // 모두 확인 (얼굴이 없는 합성 그림은 "얼굴 없는 사진이 맞아요")
  for (let i = 0; i < st.items.length; i++) {
    const btn = page.locator('button:has-text("확인하고 다음"), button:has-text("얼굴 없는 사진이 맞아요")').first();
    await btn.waitFor({ timeout: 10000 });
    await btn.click();
    await page.waitForTimeout(500);
  }
  st = await call<PhotoState>('photos:state', id);
  assert.deepEqual(st.blockers, []);
  await page.waitForFunction(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent === '네이버에 초안 입력') as HTMLButtonElement; return b && !b.disabled; }, undefined, { timeout: 10000 });
  await page.screenshot({ path: path.join(outDir, '4-confirmed.png'), fullPage: true });

  // GIF (태권 글뚝딱 2.7.0에서 옮김): 만들기 → 프레임 수 확인 → 사진을 고치면 옛 GIF 지움 → 다시 확인하고 다시 만듦
  await page.click('button:has-text("GIF 만들기")');
  await page.waitForSelector('img[alt="움직이는 사진 미리보기"]', { timeout: 60000 });
  st = await call<PhotoState>('photos:state', id);
  assert.ok(st.gif, 'GIF 저장됨');
  const gifB64 = fs.readFileSync(st.gif!.file).toString('base64');
  const decoded = await page.evaluate(async (b64) => {
    const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const d = new (window as any).ImageDecoder({ data, type: 'image/gif' });
    await d.tracks.ready;
    const f = await d.decode({ frameIndex: 0 });
    const out = { frames: d.tracks.selectedTrack.frameCount, w: f.image.displayWidth, h: f.image.displayHeight };
    f.image.close();
    return out;
  }, gifB64);
  console.log('GIF', decoded, st.gif!.bytes);
  assert.equal(decoded.frames, st.items.length, '브라우저가 프레임을 모두 읽음');
  assert.equal(decoded.w, st.gif!.w);
  await page.screenshot({ path: path.join(outDir, '4b-gif.png'), fullPage: true });
  const gifPath = st.gif!.file;
  const edit = page.locator('img[data-bg]');
  await edit.scrollIntoViewIfNeeded();
  const eb = (await edit.boundingBox())!;
  await page.mouse.move(eb.x + 20, eb.y + 20); await page.mouse.down(); await page.mouse.move(eb.x + 50, eb.y + 50, { steps: 3 }); await page.mouse.up();
  for (let i = 0; i < 50; i++) { await page.waitForTimeout(300); st = await call<PhotoState>('photos:state', id); if (!st.gif) break; }
  assert.equal(st.gif, null, '사진을 고치면 GIF가 빠짐 (가리기 전 얼굴이 남지 않게)');
  assert.equal(st.gifGone, true);
  assert.equal(fs.existsSync(gifPath), false, '옛 GIF 파일이 지워짐');
  await page.waitForSelector('text=전에 만든 GIF를 지웠어요');
  for (let i = 0; i < st.items.length; i++) {
    const btn = page.locator('button:has-text("확인하고 다음"), button:has-text("얼굴 없는 사진이 맞아요")').first();
    if (!(await btn.count())) break;
    await btn.click(); await page.waitForTimeout(400);
  }
  await page.click('button:has-text("GIF 만들기")');
  await page.waitForSelector('img[alt="움직이는 사진 미리보기"]', { timeout: 60000 });
  await page.click('button:has-text("글 맨 위")');
  await page.waitForTimeout(300);
  st = await call<PhotoState>('photos:state', id);
  assert.equal(st.gif?.at, 'top', '넣을 자리 바꿈');
  assert.deepEqual(st.blockers, []);

  // 붙여넣기 도우미: 사진이 장면 글 사이 그림 단계로 들어가고, 끝까지 하면 '사용한 사진'으로 기록
  const plan = await call<any>('paste:plan', { articleId: id, map: false });
  const media = plan.steps.filter((s: any) => s.kind === 'media');
  const items = media.flatMap((s: any) => s.items);
  assert.equal(items.filter((it: any) => it.image).length, 3, '사진 3장이 그림 단계로 (그림으로 복사)');
  assert.deepEqual(items.filter((it: any) => !it.image).map((it: any) => it.label), ['움직이는 사진'], 'GIF는 파일로 올림');
  assert.equal(plan.steps.findIndex((s: any) => s.kind === 'media' && s.items.some((it: any) => !it.image)), 2, 'GIF는 글 맨 위 (제목 · 서식 다음)');
  assert.equal((await call<any[]>('photos:scan')).filter((p) => p.used).length, 0);
  await call('paste:finish', { articleId: id, map: false, stamp: plan.stamp });
  assert.equal((await call<any[]>('photos:scan')).filter((p) => p.used).length, 3, '끝까지 하면 사용한 사진으로 기록');

  // 더 따뜻하게(사진 번호 없는 응답) 뒤에도 연결 유지
  bundle = await call<any>('article:get', id);
  lastDoc = { ...bundle.version.doc, sections: bundle.version.doc.sections.map(({ photoId: _p, ...s }: any) => ({ ...s, heading: s.heading ?? '' })), reviewFlags: [] };
  const job = await call<any>('article:revise', { id, kind: 'warmer', baseVersionId: bundle.article.currentVersionId });
  for (let i = 0; i < 30 && (await call<any>('job:get', job.id)).state === 'running'; i++) await page.waitForTimeout(300);
  const after = await call<any>('article:get', id);
  assert.equal(after.version.doc.sections.filter((s: any) => s.photoId).length, st.items.length, '더 따뜻하게 뒤에도 연결 유지');

  // 확인 뒤 처리본 삭제 → 막힘 · 다시 처리하면 확인 해제
  fs.rmSync(st.items[0].processedFile!);
  st = await call<PhotoState>('photos:state', id);
  assert.ok(st.blockers.some((t) => t.includes('없어졌거나')), '처리본 없으면 막힘');
  await call('photos:verify', id);
  st = await call<PhotoState>('photos:state', id);
  assert.equal(st.items[0].status, 'pending');
  assert.equal(st.items[0].confirmed, false);

  // 백업에 처리본(아이 사진)이 들어가지 않음은 unit 시험 대신 여기서 폴더 이름만 확인
  assert.ok(fs.existsSync(path.join(dataDir, 'assets', 'photo-work', id)));
  console.log('화면 오류:', errors.length ? errors.slice(0, 5) : '없음');
  assert.deepEqual(errors.filter((e) => !/favicon/.test(e)), [], '화면 오류 없음');
  console.log('통과');
} finally {
  await app.close().catch(() => {});
  server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
