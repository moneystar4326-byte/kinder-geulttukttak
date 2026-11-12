// 모의 편집기(tests/fixtures/mock-editor.html)로 초안 입력 순서 · 중복 방지 · 덮어쓰기 방지 확인
// 실제 네이버 편집기 동작을 증명하지 않음 (README: 실계정 미검증)
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright-core';
import { findBrowser } from '../../src/main/services/browser-draft/browser';
import * as E from '../../src/main/services/browser-draft/editor';
import { buildBlocks } from '../../src/main/services/browser-draft';
import { GifWriter } from '../../src/shared/gif';

const MOCK = pathToFileURL(path.resolve('tests/fixtures/mock-editor.html')).href;
const exe = findBrowser();
let browser: Browser;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const files = [1, 2, 3].map((i) => { const f = path.join(os.tmpdir(), `gtd-card-${i}.png`); fs.writeFileSync(f, PNG); return { index: i - 1, file: f }; });
const paste: E.Paste = async (page) => { void page; };

before(async () => { if (exe) browser = await chromium.launch({ executablePath: exe.path, headless: true }); });
after(async () => { await browser?.close(); });

async function open(query = ''): Promise<{ page: Page }> {
  const page = await browser.newPage();
  await page.goto(MOCK + query);
  return { page };
}

const sections = [
  { id: 's1', paragraphs: ['도입 문단'] },
  { id: 's2', heading: '실제 수업', paragraphs: ['수업 문단 하나', '수업 문단 둘'] },
  { id: 's3', heading: '교육 메시지', paragraphs: ['메시지 문단'] },
  { id: 's4', heading: '마무리', paragraphs: ['마무리 문단'] },
];
const cards = [{ title: '카드 하나', afterSectionId: 's1' }, { title: '카드 둘', afterSectionId: 's2' }, { title: '카드 셋', afterSectionId: 's3' }];

test('제목 · 본문 · 카드 3장이 권장 순서대로 들어감', { skip: !exe && '크롬 · 엣지 없음' }, async () => {
  const { page } = await open();
  const f = (await E.findEditor(page, 5000))!;
  assert.ok(f);
  assert.equal(await E.editorHasContent(f), false);
  await E.typeTitle(page, f, '시험 제목');
  const blocks = buildBlocks(sections, cards);
  await E.pasteBody(page, f, E.blocksToText(blocks), async (p, _f, text) => { await p.evaluate((t) => (window as any).__paste(t), text); });
  const bolded = await E.boldHeadings(page, f, sections.map((s) => s.heading).filter(Boolean) as string[]);
  assert.equal(bolded, 3);
  const placed = await E.insertCardsAtMarks(page, f, files);
  assert.deepEqual(placed, [true, true, true]);
  const check = await E.verify(f, '시험 제목', [0, 1, 2]);
  assert.equal(check.titleOk, true);
  assert.equal(check.images, 3);
  assert.deepEqual(check.leftMarks, []);
  // DOM 순서: 도입 → 카드1 → 실제 수업 → … → 카드2 → 교육 메시지 → … → 카드3 → 마무리
  const order = await page.$$eval('#body p, #body .se-image', (els) => els.map((e) => e.classList.contains('se-image') ? `IMG:${(e as HTMLElement).dataset.name}` : e.textContent!.trim()).filter(Boolean));
  assert.deepEqual(order, ['도입 문단', 'IMG:gtd-card-1.png', '실제 수업', '수업 문단 하나', '수업 문단 둘', 'IMG:gtd-card-2.png', '교육 메시지', '메시지 문단', 'IMG:gtd-card-3.png', '마무리', '마무리 문단']);
  // 같은 입력을 다시 해도 이미 올린 자리는 없으므로 중복 업로드 없음
  const again = await E.insertCardsAtMarks(page, f, files);
  assert.deepEqual(again, [false, false, false]);
  assert.equal((await E.verify(f, '시험 제목', [0, 1, 2])).images, 3);
  void paste;
});

test('쓰던 글이 있으면 내용 있음으로 판단 (덮어쓰기 방지)', { skip: !exe && '크롬 · 엣지 없음' }, async () => {
  const { page } = await open('?existing=1');
  const f = (await E.findEditor(page, 5000))!;
  assert.equal(await E.editorHasContent(f), true);
});

test('"작성 중인 글" 창 감지', { skip: !exe && '크롬 · 엣지 없음' }, async () => {
  const { page } = await open('?popup=1');
  const f = (await E.findEditor(page, 5000))!;
  assert.equal(await E.hasContinuePopup(f), true);
  await f.click(E.SEL.popupCancel);
  assert.equal(await E.hasContinuePopup(f), false);
});

test('카드 자리가 없으면 그 장은 건너뛰고 표시', { skip: !exe && '크롬 · 엣지 없음' }, async () => {
  const { page } = await open();
  const f = (await E.findEditor(page, 5000))!;
  const blocks = buildBlocks(sections, cards).filter((b) => b.cardIndex !== 1);
  await page.evaluate((t) => (window as any).__paste(t), E.blocksToText(blocks));
  const placed = await E.insertCardsAtMarks(page, f, files);
  assert.deepEqual(placed, [true, false, true]);
});

test('2번 카드가 실패해도 3번 카드는 3번 자리에 (번호가 밀리지 않음)', { skip: !exe && '크롬 · 엣지 없음' }, async () => {
  const { page } = await open();
  const f = (await E.findEditor(page, 5000))!;
  const ok = [cards[0], cards[2]].map((c, k) => ({ ...c, index: k === 0 ? 0 : 2 }));
  const blocks = buildBlocks(sections, ok);
  assert.ok(blocks.some((b) => b.text.startsWith('[카드 3 ·')) && !blocks.some((b) => b.text.startsWith('[카드 2 ·')));
  await page.evaluate((t) => (window as any).__paste(t), E.blocksToText(blocks));
  const placed = await E.insertCardsAtMarks(page, f, [files[0], files[2]]);
  assert.deepEqual(placed, [true, true]);
  const order = await page.$$eval('#body p, #body .se-image', (els) => els.map((e) => e.classList.contains('se-image') ? `IMG:${(e as HTMLElement).dataset.name}` : e.textContent!.trim()).filter(Boolean));
  assert.ok(order.indexOf('IMG:gtd-card-3.png') > order.indexOf('메시지 문단'));
});

test('촬영용 타이핑 입력: 완성형 글자 · 줄바꿈 · 이모지 그대로', { skip: !exe && '크롬 · 엣지 없음' }, async () => {
  const page = await browser.newPage();
  await page.setContent('<textarea id="t"></textarea>');
  await page.click('#t');
  const t0 = Date.now();
  await E.typeText(page, '강하고 담대하라\n\n🥋품새', 40);
  assert.equal(await page.inputValue('#t'), '강하고 담대하라\n\n🥋품새');
  assert.ok(Date.now() - t0 >= 13 * 20, '속도에 맞춰 천천히'); // 13글자 × 25ms 근처
  const ac = new AbortController(); ac.abort();
  await assert.rejects(() => E.typeText(page, '멈춤', 40, ac.signal));
});

test('글 끝에 도장 지도 카드 넣기 · 못 찾으면 창 닫고 건너뜀', { skip: !exe && '크롬 · 엣지 없음' }, async () => {
  const here = { address: '경기 용인시 처인구 명지로 12 2층', region: '경기 용인시 처인구' };
  const { page } = await open();
  const f = (await E.findEditor(page, 5000))!;
  await page.evaluate((t) => (window as any).__paste(t), '본문 한 줄\n\n마지막 줄');
  assert.deepEqual(await E.addPlaceAtEnd(page, f, { name: '용인대석사강담태권도', ...here }), { ok: true, title: '용인대석사강담태권도' });
  assert.equal(await page.locator('.se-placesMap').getAttribute('data-place'), '용인대석사강담태권도|경기 용인시 처인구 명지로 12');
  const { page: p2 } = await open();
  const f2 = (await E.findEditor(p2, 5000))!;
  await p2.evaluate((t) => (window as any).__paste(t), '본문');
  assert.deepEqual(await E.addPlaceAtEnd(p2, f2, { name: '없는도장', ...here }), { ok: false, why: 'no-results' });
  assert.equal(await p2.locator('#mapPopup').isVisible(), false);
});

test('도장 지도: 같은 이름이 여러 곳이면 주소가 맞는 곳을 넣고, 없으면 넣지 않음', { skip: !exe && '크롬 · 엣지 없음' }, async () => {
  const place = { name: '한국체대석사태권도장', address: '강원 춘천시 석사동 123-4', region: '강원 춘천시 석사동' };
  const start = async (rows: unknown) => {
    const { page } = await open();
    const f = (await E.findEditor(page, 5000))!;
    await page.evaluate((t) => (window as any).__paste(t), '본문');
    await page.evaluate((r) => { (window as any).__places = r; }, rows);
    return { page, f };
  };
  const other = { title: place.name, addr: '서울 송파구 잠실동 10-1' };
  const a = await start([other, { title: place.name, addr: '강원 춘천시 석사동 123-4' }]);
  assert.equal((await E.addPlaceAtEnd(a.page, a.f, place)).ok, true);
  assert.equal(await a.page.locator('.se-placesMap').getAttribute('data-place'), `${place.name}|강원 춘천시 석사동 123-4`); // 맨 위가 아니라 주소가 맞는 곳

  const b = await start([other]);
  const r = await E.addPlaceAtEnd(b.page, b.f, place);
  assert.equal(r.ok === false && r.why, 'no-match');
  assert.equal(await b.page.locator('.se-placesMap').count(), 0); // 다른 도장 지도가 들어가지 않음
  assert.equal(await b.page.locator('#mapPopup').isVisible(), false);
  assert.deepEqual(await b.page.evaluate(() => (window as any).__searches), [place.name, `${place.name} 석사동`]); // 동네를 붙여 한 번 더 찾음

  const c = await start([other]);
  assert.deepEqual(await E.addPlaceAtEnd(c.page, c.f, { name: place.name }), { ok: false, why: 'no-basis' }); // 주소 · 지역이 모두 없으면 아예 찾지 않음
  assert.equal(await c.page.locator('#mapPopup').isVisible(), false);
});

test('사진 버튼이 처음 한 번 안 먹어도(팝업이 가림) 다시 눌러 사진이 들어가고, 실패 이유를 알려 줌', { skip: !exe && '크롬 · 엣지 없음' }, async () => {
  const { page } = await open();
  const f = (await E.findEditor(page, 5000))!;
  // 2번 카드를 넣으려는 첫 클릭만 무시 (실제: 도움말 · 알림 창이 툴바를 가린 경우)
  await page.evaluate(() => {
    const b = document.querySelector('.se-image-toolbar-button') as HTMLButtonElement; const orig = b.onclick!; let n = 0;
    b.onclick = (e) => { n++; if (n === 2) return; orig.call(b, e); };
  });
  await page.evaluate((t) => (window as any).__paste(t), E.blocksToText(buildBlocks(sections, cards)));
  const why: string[] = [];
  const placed = await E.insertCardsAtMarks(page, f, files, (i, ok, w) => { if (!ok) why.push(`${i}:${w}`); });
  assert.deepEqual(placed, [true, true, true]);
  assert.equal(await page.locator('.se-component.se-image').count(), 3); // 같은 사진 두 장 없음
  assert.deepEqual(why, []);
  // 자리 글자가 없으면 이유가 mark-missing 으로 남음
  const p2 = (await open()).page; const f2 = (await E.findEditor(p2, 5000))!;
  await p2.evaluate((t) => (window as any).__paste(t), E.blocksToText(buildBlocks(sections, cards).filter((b) => b.cardIndex !== 1)));
  const why2: string[] = [];
  await E.insertCardsAtMarks(p2, f2, files, (i, ok, w) => { if (!ok) why2.push(`${i}:${w}`); });
  assert.deepEqual(why2, ['1:mark-missing']);
});

test('사진 글: 장면 글 바로 아래 순서대로 들어가고, 끊겨도 남은 사진만 이어 넣음 (태권 글뚝딱 2.5.0에서 옮김)', { skip: !exe && '크롬 · 엣지 없음' }, async () => {
  const { page } = await open();
  const f = (await E.findEditor(page, 5000))!;
  const secs = [{ id: 's1', paragraphs: ['도입 문단'] }, { id: 's2', heading: '장면 하나', paragraphs: ['첫 장면 글'] }, { id: 's3', heading: '장면 둘', paragraphs: ['둘째 장면 글'] }, { id: 's4', heading: '장면 셋', paragraphs: ['셋째 장면 글'] }, { id: 's5', paragraphs: ['마무리 문단'] }];
  const photos = ['s2', 's3', 's4'].map((sectionId, i) => ({ sectionId, index: E.PHOTO_BASE + i, title: `장면 ${i + 1}` }));
  const shots = photos.map((p, i) => ({ index: p.index, file: files[i].file }));
  const anchors = [{ title: '장면 1', lastLine: '첫 장면 글' }, { title: '장면 2', lastLine: '둘째 장면 글' }, { title: '장면 3', lastLine: '셋째 장면 글' }];
  await E.pasteBody(page, f, E.blocksToText(buildBlocks(secs, [], [], photos)), async (p, _f, text) => { await p.evaluate((t) => (window as any).__paste(t), text); });
  // 1번 사진까지만 넣고 끊김
  assert.deepEqual(await E.insertCardsAtMarks(page, f, shots.slice(0, 1)), [true]);
  assert.deepEqual((await E.verify(f, '', shots.map((c) => c.index))).leftMarks, [E.PHOTO_BASE + 2, E.PHOTO_BASE + 3]);
  assert.ok((await E.photoOrderProblems(await E.readLayout(f), anchors)).length > 0, '다 안 들어가면 순서 대조 실패');
  const texts = () => f.locator(E.SEL.bodyParagraph).allInnerTexts();
  // 기록과 다르면 다시 넣지 않음
  assert.equal(E.resumePlan(await texts(), 0, shots).ok, false);
  assert.equal(E.resumePlan(await texts(), 3, shots).ok, false);
  // 늦게 올라온 사진: 그 자리 글자만 지우고 그다음부터
  const late = E.resumePlan(await texts(), 2, shots);
  assert.ok(late.ok && late.late?.index === E.PHOTO_BASE + 1 && late.left.length === 1);
  // 맞으면 남은 사진만
  const plan = E.resumePlan(await texts(), 1, shots);
  assert.ok(plan.ok && plan.late === null);
  if (plan.ok) assert.deepEqual(await E.insertCardsAtMarks(page, f, plan.left), [true, true]);
  const check = await E.verify(f, '', shots.map((c) => c.index));
  assert.equal(check.images, 3);
  assert.deepEqual(check.leftMarks, []);
  assert.deepEqual(E.photoOrderProblems(await E.readLayout(f), anchors), []);
  assert.deepEqual(await page.$$eval('#body .se-image', (els) => els.map((e) => (e as HTMLElement).dataset.name)), ['gtd-card-1.png', 'gtd-card-2.png', 'gtd-card-3.png']);
  // 다 들어간 뒤에는 이어 넣을 것이 없음
  assert.equal(E.resumePlan(await texts(), 3, shots).ok, false);
});

test('사진 글 GIF: 글 끝 자리에 올라가고 자리 글자가 지워짐 (태권 글뚝딱 2.7.0에서 옮김)', { skip: !exe && '크롬 · 엣지 없음' }, async () => {
  const { page } = await open();
  const f = (await E.findEditor(page, 5000))!;
  const gif = path.join(os.tmpdir(), `gtd-gif-${process.pid}.gif`);
  const w = new GifWriter(2, 2, 60); w.addFrame(new Uint8Array(16).fill(200)); fs.writeFileSync(gif, w.finish());
  await page.evaluate((t) => (window as any).__paste(t), E.blocksToText(buildBlocks([{ id: 's', paragraphs: ['본문'] }], [], [], undefined, 'bottom')));
  const before = await page.locator('.se-component.se-image').count();
  assert.deepEqual(await E.insertCardsAtMarks(page, f, [{ index: E.GIF_CARD, file: gif }]), [true]);
  assert.equal(await page.locator('.se-component.se-image').count(), before + 1);
  assert.deepEqual((await E.verify(f, '', [E.GIF_CARD])).leftMarks, []);
  fs.rmSync(gif, { force: true });
});
