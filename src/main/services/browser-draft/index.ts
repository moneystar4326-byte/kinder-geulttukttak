// 네이버 전용 브라우저 창 + 블로그 초안 입력 (기획서 9장)
// - 전용 프로필 폴더(browser-profile)만 씀. 평소 크롬 프로필 · 쿠키를 복사하지 않고, 비밀번호를 받지 않음
// - 로그인 · 추가 인증은 사용자가 그 창에서 직접. 자동화 차단 · 캡차를 우회하지 않음
// - 발행 · 저장 버튼은 누르지 않음. 끝나면 편집 화면을 그대로 남김
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { findBrowser, NO_BROWSER } from './browser';
import * as E from './editor';
import { shortLines, tagLine } from '../../../shared/format';
import { APP } from '../../../shared/daycare';

export type DraftStep = 'open' | 'login' | 'editor' | 'title' | 'body' | 'headings' | 'cards' | 'map' | 'verify' | 'done';
export const STEP_LABEL: Record<DraftStep, string> = {
  open: '브라우저 여는 중', login: '네이버 로그인 기다리는 중', editor: '글쓰기 화면 여는 중', title: '제목 입력 중', body: '본문 입력 중',
  headings: '소제목 굵게', cards: '카드 올리는 중', map: `${APP.place} 지도 넣는 중`, verify: '입력 결과 확인 중', done: '입력 끝 (발행 전)',
};

export interface DraftRequest {
  blogUrl: string;
  title: string;
  blocks: E.DraftBlock[];
  headings: string[];
  cardFiles: { index: number; file: string }[]; // 카드 원래 번호(0..2)와 파일
  onExisting: 'stop' | 'new'; // 네이버 "작성 중인 글" 창: 멈추고 묻기 / 새 글로 시작 (쓰던 글은 임시저장에 남음)
  typing?: number; // 있으면 촬영용 타이핑 입력 (초당 글자 수), 없으면 붙여넣기
  place?: string; // 있으면 글 끝에 이 이름으로 네이버 지도 카드
}

export type DraftResult =
  | { state: 'need-login' }
  | { state: 'existing-draft' }
  | { state: 'not-owner'; blogId: string }
  | { state: 'filled'; check: Awaited<ReturnType<typeof E.verify>>; placed: boolean[]; bolded: number; steps: DraftStep[]; map: boolean | null };

export function blogIdOf(url: string) {
  return url.match(/blog\.naver\.com\/([A-Za-z0-9_-]+)/)?.[1] ?? null;
}

export function createBrowserDraft(opts: { profileDir: string; browserPath?: () => string | undefined; paste: E.Paste; log?: (code: string, d?: string) => void }) {
  let ctx: BrowserContext | null = null;
  let launching: Promise<BrowserContext> | null = null;

  async function context() {
    if (ctx) return ctx;
    if (launching) return launching; // 거의 동시에 두 번 불려도 크롬은 한 번만 (2026-10-18 버그 점검)
    launching = launch().finally(() => { launching = null; });
    return launching;
  }
  async function launch() {
    const b = findBrowser(opts.browserPath?.());
    if (!b) throw new Error(NO_BROWSER);
    fs.mkdirSync(opts.profileDir, { recursive: true });
    ctx = await chromium.launchPersistentContext(opts.profileDir, { executablePath: b.path, headless: false, chromiumSandbox: true, viewport: null, args: ['--start-maximized'] });
    ctx.on('close', () => { ctx = null; });
    return ctx;
  }
  async function page(): Promise<Page> {
    const c = await context();
    const p = c.pages()[0] ?? await c.newPage();
    await p.bringToFront().catch(() => {});
    return p;
  }

  // 로그인 여부: 네이버 로그인 쿠키가 "있는지"만 봄 (값은 읽지 않음)
  async function loggedIn() {
    if (!ctx) return null;
    const names = (await ctx.cookies('https://www.naver.com')).map((c) => c.name);
    return names.includes('NID_AUT') && names.includes('NID_SES');
  }

  return {
    isOpen: () => !!ctx,
    loggedIn,
    async openLogin() {
      const p = await page();
      await p.goto('https://nid.naver.com/nidlogin.login?url=https%3A%2F%2Fblog.naver.com', { waitUntil: 'domcontentloaded' });
    },
    async close() { await ctx?.close().catch(() => {}); ctx = null; },
    // 로그아웃 · 전용 세션 삭제: 창을 닫고 전용 프로필 폴더를 지움
    async clearSession() {
      await ctx?.close().catch(() => {});
      ctx = null;
      fs.rmSync(opts.profileDir, { recursive: true, force: true });
    },

    async fill(req: DraftRequest, onStep: (s: DraftStep) => void, signal?: AbortSignal): Promise<DraftResult> {
      const steps: DraftStep[] = [];
      const step = (s: DraftStep) => { steps.push(s); onStep(s); if (signal?.aborted) throw Object.assign(new Error('멈췄어요'), { name: 'AbortError' }); };
      const id = blogIdOf(req.blogUrl);
      if (!id) throw new Error(`${APP.place} 정보에 네이버 블로그 주소가 없어요 (예: https://blog.naver.com/아이디)`);
      for (const c of req.cardFiles) if (!fs.existsSync(c.file)) throw new Error(`카드 ${c.index + 1}번 파일이 없어요. 카드를 다시 만들어 주세요.`);

      step('open');
      const p = await page();
      await p.goto(`https://blog.naver.com/${id}?Redirect=Write&`, { waitUntil: 'domcontentloaded' });
      if (p.url().includes('nid.naver.com')) {
        step('login');
        // 사용자가 그 창에서 직접 로그인할 때까지 최대 5분
        const until = Date.now() + 300_000;
        while (Date.now() < until && !p.isClosed() && p.url().includes('nid.naver.com')) { if (signal?.aborted) break; await p.waitForTimeout(1000).catch(() => {}); }
        if (p.isClosed() || p.url().includes('nid.naver.com')) return { state: 'need-login' };
        if (!/Redirect=Write|postwrite/i.test(p.url())) await p.goto(`https://blog.naver.com/${id}?Redirect=Write&`, { waitUntil: 'domcontentloaded' });
      }

      step('editor');
      const f = await E.findEditor(p, 40_000);
      if (!f) {
        await p.screenshot({ path: path.join(opts.profileDir, '..', 'logs', 'naver_editor_missing.png') }).catch(() => {});
        opts.log?.('naver-editor-missing', p.url().replace(/\?.*$/, ''));
        // 가장 흔한 원인: 로그인한 아이디가 그 블로그 주인이 아님 (1버전 2026-09-30 배포 시험)
        return { state: 'not-owner', blogId: id };
      }
      await f.locator(E.SEL.popupCancel).first().waitFor({ state: 'visible', timeout: 2000 }).catch(() => {}); // 창이 조금 늦게 뜨는 경우
      if (await E.hasContinuePopup(f)) {
        if (req.onExisting === 'stop') return { state: 'existing-draft' };
        await f.click(E.SEL.popupCancel).catch(() => {}); // 이어 쓰지 않고 새 글로 (임시저장 글은 네이버에 남아 있음)
        await p.waitForTimeout(800);
      }
      await E.dismissHelp(f);
      if (await E.editorHasContent(f)) return { state: 'existing-draft' }; // 어떤 경우든 내용이 있는 편집기는 덮어쓰지 않음

      step('title');
      if (req.typing) { await f.click(E.SEL.title); await E.typeText(p, req.title, req.typing, signal); } else await E.typeTitle(p, f, req.title);
      step('body');
      await E.applyBodyStyle(p, f); // 1버전 서식: 나눔스퀘어 · 16 · 가운데 · 줄간격 180%
      if (req.typing) await E.typeBody(p, f, E.blocksToText(req.blocks), req.typing, signal);
      else await E.pasteBody(p, f, E.blocksToText(req.blocks), opts.paste);
      step('headings');
      const bolded = await E.styleHeadings(p, f, req.headings).catch(() => 0); // 굵게 + 크게
      step('cards');
      const placed = req.cardFiles.length ? await E.insertCardsAtMarks(p, f, req.cardFiles, (i, ok, why) => { if (!ok) opts.log?.('naver-card-failed', `카드 ${i + 1}: ${why}`); }) : [];
      let map: boolean | null = null;
      if (req.place) { step('map'); map = await E.addPlaceAtEnd(p, f, req.place); }
      step('verify');
      const check = await E.verify(f, req.title, req.cardFiles.map((c) => c.index));
      await f.click(E.SEL.title).catch(() => {}); // 맨 위로
      step('done');
      return { state: 'filled', check, placed, bolded, steps, map };
    },
  };
}
export type BrowserDraft = ReturnType<typeof createBrowserDraft>;

// 초안 블록 만들기: 권장 배치 = 도입 → 카드1 → … (카드의 afterSectionId 기준, 없으면 도입 뒤 · 가운데 · 마무리 앞)
// 문단은 휴대폰에서 읽기 좋게 짧은 줄로 끊고, 맨 끝에 #태그 한 줄 (그 뒤에 지도)
export function buildBlocks(sections: { id: string; heading?: string; paragraphs: string[] }[], cards: { title: string; afterSectionId?: string; index?: number }[], tags: string[] = []): E.DraftBlock[] {
  const ids = sections.map((s) => s.id);
  const n = ids.length;
  const fallback = [0, Math.floor((n - 1) / 2), Math.max(n - 2, 0)]; // 도입 뒤 · 가운데 · 마무리 앞
  const after = new Map<string, number[]>();
  cards.forEach((c, i) => {
    const n = c.index ?? i; // 카드 원래 번호 (2번이 실패해도 3번은 3번 자리)
    const at = c.afterSectionId && ids.includes(c.afterSectionId) ? c.afterSectionId : ids[fallback[n] ?? ids.length - 1];
    after.set(at, [...(after.get(at) ?? []), i]);
  });
  const out: E.DraftBlock[] = [];
  for (const s of sections) {
    if (s.heading) out.push({ kind: 'heading', text: s.heading });
    for (const para of s.paragraphs) out.push({ kind: 'paragraph', text: shortLines(para) });
    for (const i of after.get(s.id) ?? []) { const n = cards[i].index ?? i; out.push({ kind: 'card', text: E.cardMark(n, cards[i].title), cardIndex: n }); }
  }
  if (tags.length) out.push({ kind: 'paragraph', text: tagLine(tags) });
  return out;
}
