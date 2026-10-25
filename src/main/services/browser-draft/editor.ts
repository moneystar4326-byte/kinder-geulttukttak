// 네이버 스마트에디터 조작 (선택자는 여기에만 모음 — 네이버 화면이 바뀌면 여기부터 확인)
// 1버전(태권 글뚝딱 naver.ts, 2026-09~10 실사용)에서 확인한 선택자. 2버전에서 실계정 재확인 전까지는 "미검증"으로 기록 (README)
// 자동으로 하지 않는 것: 발행 버튼 · 예약 · 저장 버튼 클릭, 로그인 · 추가 인증 입력, 캡차
import type { Frame, Page } from 'playwright-core';

export const SEL = {
  title: '.se-documentTitle .se-text-paragraph',
  bodyParagraph: '.se-component.se-text p.se-text-paragraph',
  firstBody: '.se-component.se-text .se-text-paragraph',
  imageComponent: '.se-component.se-image',
  imageButton: 'button.se-image-toolbar-button',
  boldButton: '.se-bold-toolbar-button',
  continuePopup: '.se-popup-alert-confirm, .se-popup-alert', // "작성 중인 글이 있습니다" 창
  popupCancel: '.se-popup-button-cancel',
  helpClose: '.se-help-panel-close-button',
};

// 붙여넣을 본문: 소제목 · 문단 사이 빈 줄, 카드 자리는 [카드 n · 제목] 줄
export interface DraftBlock { kind: 'heading' | 'paragraph' | 'card'; text: string; cardIndex?: number }
export const cardMark = (i: number, title: string) => `[카드 ${i + 1} · ${title.replace(/[\[\]]/g, '')}]`;
export const isCardMark = (t: string, i: number) => new RegExp(`^\\[카드\\s*${i + 1}\\s*·`).test(t.replace(/[​﻿]/g, '').trim());

export function blocksToText(blocks: DraftBlock[]) {
  return blocks.map((b) => b.text).join('\n\n');
}

export type Paste = (page: Page, frame: Frame, text: string) => Promise<void>;

export async function findEditor(page: Page, waitMs: number): Promise<Frame | null> {
  const until = Date.now() + waitMs;
  while (Date.now() < until) {
    if (page.isClosed()) return null;
    for (const f of page.frames()) if (await f.$(SEL.title).catch(() => null)) return f;
    await page.waitForTimeout(500);
  }
  return null;
}

// 편집기에 이미 내용이 있는지 (덮어쓰기 방지)
// 빈 편집기의 회색 안내 글자("제목", "글감과 함께 나의 일상을 기록해보세요!")는 글자로 보이지만 내용이 아님 →
// 네이버가 빈 칸에 붙이는 se-is-empty 표시로 판단 (2026-10-18 실계정 확인). 표시가 없는 화면이면 글자로 판단
// 브라우저 안에서 도는 코드는 문자열로 (빌드 도구가 함수 이름 도우미를 끼워 넣어 깨지는 것 방지)
const HAS_CONTENT_JS = `(() => {
  const strip = (t) => t.replace(/[\u200b\ufeff\s]/g, '');
  const filled = (root) => {
    if (!root) return false;
    const mods = root.querySelectorAll('.se-module-text');
    if (mods.length) return Array.from(mods).some((m) => !m.classList.contains('se-is-empty') && strip(m.innerText) !== '');
    return strip(root.innerText) !== '';
  };
  const title = filled(document.querySelector('.se-documentTitle'));
  const body = Array.from(document.querySelectorAll('.se-component.se-text')).some((c) => filled(c));
  const others = document.querySelectorAll('.se-component:not(.se-documentTitle):not(.se-text)').length;
  return title || body || others > 0;
})()`;
export async function editorHasContent(f: Frame): Promise<boolean> {
  return f.evaluate(HAS_CONTENT_JS);
}

// "작성 중인 글이 있어요" 창이 떴는지
export async function hasContinuePopup(f: Frame) {
  return (await f.locator(SEL.popupCancel).filter({ visible: true }).count().catch(() => 0)) > 0;
}

export async function dismissHelp(f: Frame) {
  await f.click(SEL.helpClose, { timeout: 1500 }).catch(() => {});
}

export async function typeTitle(page: Page, f: Frame, title: string) {
  await f.click(SEL.title);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(title);
}

// 촬영용 타이핑 입력: 완성형 글자를 정해진 속도로 하나씩 (무작위 오타 · 사람 흉내 없음, 속도 일정)
// 문단 사이는 Enter 두 번 = 붙여넣기와 같은 빈 줄. 멈추기를 누르면 그 자리에서 멈춤
export async function typeText(page: Page, text: string, cps: number, signal?: AbortSignal) {
  const delay = Math.round(1000 / Math.max(5, Math.min(80, cps)));
  const seg = new Intl.Segmenter('ko', { granularity: 'grapheme' });
  for (const { segment } of seg.segment(text)) {
    if (signal?.aborted) throw Object.assign(new Error('멈췄어요'), { name: 'AbortError' });
    if (segment === String.fromCharCode(10)) await page.keyboard.press('Enter');
    else await page.keyboard.insertText(segment);
    await page.waitForTimeout(delay);
  }
}

export async function typeBody(page: Page, f: Frame, text: string, cps: number, signal?: AbortSignal) {
  await f.click(SEL.firstBody);
  await typeText(page, text, cps, signal);
}

export async function pasteBody(page: Page, f: Frame, text: string, paste: Paste) {
  await f.click(SEL.firstBody);
  await paste(page, f, text);
  // 붙인 글이 다 그려질 때까지 (문단 수가 더 늘지 않을 때까지)
  const paras = f.locator(SEL.bodyParagraph);
  let last = -1;
  for (let i = 0; i < 25; i++) {
    const c = await paras.count();
    if (c > 1 && c === last) break;
    last = c;
    await page.waitForTimeout(300);
  }
}

// 본문 서식을 먼저 정하고 넣으면 넣은 글 전체가 그 서식을 따름 (1버전: 관장님 결정 2026-09-29 나눔스퀘어 · 16 · 가운데 · 줄간격 180%)
// 버튼 하나를 못 찾아도 입력 전체가 멈추지 않게 건너뜀
export const BODY_STYLE: [string, string][] = [
  ['.se-font-family-toolbar-button', '나눔스퀘어'],
  ['.se-font-size-code-toolbar-button', '16'],
  ['.se-property-toolbar-drop-down-button:has-text("정렬")', '가운데 정렬'],
  ['.se-property-toolbar-drop-down-button:has-text("줄간격")', '180%'],
];
async function pick(page: Page, f: Frame, open: string, option: string) {
  if (!(await f.click(open, { timeout: 3000 }).then(() => true, () => false))) return false;
  const ok = await f.locator('button', { hasText: option }).filter({ visible: true }).last().click({ timeout: 3000 }).then(() => true, () => false);
  if (!ok) await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(200);
  return ok;
}
export async function applyBodyStyle(page: Page, f: Frame) {
  await f.click(SEL.firstBody).catch(() => {});
  let n = 0;
  for (const [open, option] of BODY_STYLE) if (await pick(page, f, open, option)) n++;
  return n;
}

// 소제목 줄: 굵게 + 글씨 크게 (2026-10-18 사용자: 소제목 글씨 키우기)
export const HEADING_SIZE = '24';
export async function styleHeadings(page: Page, f: Frame, headings: string[]) {
  const want = new Set(headings.map((h) => h.replace(/[​﻿\s]/g, '')));
  const paras = f.locator(SEL.bodyParagraph);
  const texts = await paras.allInnerTexts();
  const idx = texts.map((t, i) => (want.has(t.replace(/[​﻿\s]/g, '')) ? i : -1)).filter((i) => i >= 0);
  // 두 번에 나눠서: 먼저 모두 크기 24, 그다음 모두 굵게 (한 줄씩 번갈아 하면 둘째 줄부터 크기나 굵게가 풀림 — 2026-10-18 실계정 확인)
  // 줄을 고른 뒤 · 버튼을 누른 뒤 편집기가 따라올 시간을 줌 (안 기다리면 둘째 줄부터 적용이 안 됨)
  for (const i of idx) {
    await paras.nth(i).click({ clickCount: 3 });
    await page.waitForTimeout(250);
    await pick(page, f, '.se-font-size-code-toolbar-button', HEADING_SIZE);
  }
  for (const i of idx) {
    await paras.nth(i).click({ clickCount: 3 });
    await page.waitForTimeout(250);
    await f.click(SEL.boldButton, { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
  const n = idx.length;
  await page.keyboard.press('End').catch(() => {});
  return n;
}

// 소제목 줄을 굵게 (줄 전체 선택 → 툴바 [굵게]. Ctrl+B 는 편집기가 무시함 — 1버전 확인)
export async function boldHeadings(page: Page, f: Frame, headings: string[]) {
  const want = new Set(headings.map((h) => h.replace(/\s/g, '')));
  const paras = f.locator(SEL.bodyParagraph);
  const texts = await paras.allInnerTexts();
  let n = 0;
  for (let i = 0; i < texts.length; i++) {
    if (!want.has(texts[i].replace(/[​﻿\s]/g, ''))) continue;
    await paras.nth(i).click({ clickCount: 3 });
    await f.click(SEL.boldButton, { timeout: 3000 }).then(() => n++, () => {});
  }
  return n;
}

// [카드 n · …] 줄 맨 앞에 이미지를 올리고 그 줄 글자를 지움. 업로드 완료를 보고 다음으로.
// 한 장이 60초 안에 안 올라오면 멈춤 (늦게 올라온 사진이 다른 자리에 들어가 순서가 섞이는 것 방지 — 1버전 2026-10-04 점검)
// 2026-10-23: 사진이 가끔 빠지는 문제 → 파일 창이 안 열리면(팝업 · 도움말이 툴바를 가림) 닫고 한 번 더, 늦게 올라온 사진도 인정, 실패 이유를 기록
export type CardFail = 'mark-missing' | 'no-file-window' | 'upload-timeout';
export async function insertCardsAtMarks(page: Page, f: Frame, cards: { index: number; file: string }[], onEach?: (i: number, ok: boolean, why?: CardFail) => void) {
  const paras = f.locator(SEL.bodyParagraph);
  const images = () => f.locator(SEL.imageComponent).count();
  const find = async (i: number) => (await paras.allInnerTexts()).findIndex((t) => isCardMark(t, i));
  const placed: boolean[] = [];
  for (const { index: i, file } of cards) {
    let ok = false;
    let why: CardFail | undefined;
    const before = await images().catch(() => 0);
    for (let attempt = 0; attempt < 2 && !ok; attempt++) {
      try {
        if (attempt) { await page.keyboard.press('Escape').catch(() => {}); await dismissHelp(f); await page.waitForTimeout(1500); }
        if ((await images()) > before) { ok = true; break; } // 앞 시도의 사진이 늦게 올라옴
        const at = await find(i);
        if (at < 0) { why = 'mark-missing'; break; }
        await paras.nth(at).scrollIntoViewIfNeeded().catch(() => {});
        await paras.nth(at).click();
        await page.keyboard.press('Home');
        // 클릭도 파일 창 기다림과 같은 8초만 (늦은 클릭으로 Windows 파일 창이 혼자 열려 남는 것 방지)
        const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 8000 }), f.click(SEL.imageButton, { timeout: 8000 })]).catch(() => { why = 'no-file-window'; return [null]; });
        if (!chooser) continue;
        await chooser.setFiles(file);
        for (let k = 0; k < 120 && !ok; k++) { ok = (await images()) > before; if (!ok) await page.waitForTimeout(500); }
        if (!ok) { why = 'upload-timeout'; break; } // 이미 보낸 사진이 나중에 올라올 수 있어 다시 보내지 않음 (같은 사진 두 장 방지)
      } catch { why ??= 'no-file-window'; }
    }
    if (ok) {
      const at = await find(i);
      if (at >= 0) { await paras.nth(at).click({ clickCount: 3 }); await page.keyboard.press('Backspace'); }
    }
    placed.push(ok);
    onEach?.(i, ok, ok ? undefined : why);
    if (!ok && why !== 'mark-missing') break; // 순서가 섞이지 않게 여기서 멈춤 (남은 자리는 글자가 남아 직접 넣을 수 있음)
  }
  return placed;
}

// 글 맨 끝에 도장 지도 (편집기 [장소] → 네이버 지도 카드). 1버전 naver.ts 에서 옮김 (2026-09~10 실사용)
// 검색 결과가 없거나 실패하면 창을 닫고 false (글 입력 전체는 멈추지 않음)
export async function addPlaceAtEnd(page: Page, f: Frame, name: string) {
  const close = () => f.locator('.se-popup-close-button').filter({ visible: true }).first().click({ timeout: 2000 }).catch(() => page.keyboard.press('Escape'));
  try {
    const last = f.locator(SEL.bodyParagraph).last();
    await last.click();
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    await f.click('button.se-map-toolbar-button', { timeout: 5000 });
    const input = f.locator('input.react-autosuggest__input');
    await input.waitFor({ timeout: 5000 });
    const items = f.locator('li.se-place-map-search-result-item');
    let found = false;
    for (let i = 0; i < 3 && !found; i++) { // 검색 결과가 가끔 안 뜸 → 최대 3번. Enter 는 한글 끝 글자를 바꿔서 버튼으로
      await input.fill('');
      await input.fill(name);
      await page.waitForTimeout(500);
      await f.click('button.se-place-search-button');
      found = await items.first().waitFor({ timeout: 5000 }).then(() => true, () => false);
    }
    if (!found) { await close(); return false; }
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const exact = items.filter({ has: f.locator('.se-place-map-search-result-title', { hasText: new RegExp(`^${esc}$`) }) });
    const item = (await exact.count()) ? exact.first() : items.first();
    await item.hover();
    await item.locator('button.se-place-add-button').click();
    await f.getByRole('button', { name: '확인' }).filter({ visible: true }).last().click({ timeout: 5000 });
    await f.locator('.se-component.se-placesMap, .se-component[class*="place"]').last().waitFor({ timeout: 5000 });
    return true;
  } catch { await close(); return false; }
}

// 입력 결과 확인 (가능한 범위)
export async function verify(f: Frame, title: string, cardIndexes: number[]) {
  const t = (await f.locator(SEL.title).first().innerText().catch(() => '')).replace(/[​﻿]/g, '').trim();
  const images = await f.locator(SEL.imageComponent).count().catch(() => 0);
  const texts = await f.locator(SEL.bodyParagraph).allInnerTexts().catch(() => [] as string[]);
  const leftMarks = cardIndexes.filter((i) => texts.some((x) => isCardMark(x, i))).map((i) => i + 1);
  return { titleOk: t === title.trim(), images, leftMarks, paragraphs: texts.filter((x) => x.trim()).length };
}
