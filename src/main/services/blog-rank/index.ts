// 블로그 노출 순위 (태권 글뚝딱 2.8.0에서 옮김): 네이버 검색 화면을 앱 안의 숨긴 창으로 열어 읽기만 함
// - 로그인 없는 따로 된 임시 세션 (네이버 전용 브라우저 · 고객 계정과 섞지 않음, 앱을 끄면 쿠키도 사라짐)
// - 한 번에 하나씩, 검색 사이에 몇 초 쉼. 자동입력 방지 · 제한 화면이 나오면 우회하지 않고 멈춤
// - 블로그 탭은 data-url(결과 글마다 하나)로, 통합검색은 #main_pack 안 블로그 글 링크로 셈
import { BrowserWindow, session, type Session } from 'electron';
import { ApiError, toApiError } from '../errors';
import { APP } from '../../../shared/kinder';
import { BLOCKED_HINT, parseRss, postKeyOf, postUrlOf, rankOf, ranksOf, RANK_MAX, type PostKey, type RankHit, type RssPost } from '../../../shared/rank';

const PROVIDER = '네이버 검색';
const PARTITION = 'gtd-rank'; // 'persist:' 가 없으면 메모리에만 (앱을 끄면 사라짐)
const VIEW_PARTITION = 'gtd-rank-view'; // 사람이 보는 [검색 화면에서 보기] 창 (측정과 따로)
const IDLE_CLOSE_MS = 60_000;
const LOAD_MS = 20_000; // 화면 불러오기를 기다리는 최대 시간
const EXEC_MS = 10_000; // 화면 읽기를 기다리는 최대 시간
const TIMEOUT = Symbol('timeout');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pause = () => sleep(2500 + Math.floor(Math.random() * 2000)); // 검색 사이 2.5~4.5초

// 화면 안에서 실행 (문자열로 넘김). 페이지 코드와 섞이지 않게 함수 하나로
function readBlogTab() {
  const urls = Array.from(document.querySelectorAll('[data-url]')).map((e) => e.getAttribute('data-url') || '').filter((u) => /blog\.naver\.com\/[^/]+\/\d+/.test(u));
  return { urls, text: (document.body?.innerText || '').slice(0, 3000), empty: !!document.querySelector('.api_noresult_wrap, .not_found02') };
}
function readTotal() {
  const root = document.querySelector('#main_pack') || document.body;
  const links = Array.from(root.querySelectorAll('a[href]')).map((a) => (a as HTMLAnchorElement).href).filter((h) => /blog\.naver\.com\/[^/?#]+\/\d+/.test(h)).map((h) => (h.match(/blog\.naver\.com\/[^/?#]+\/\d+/) || [''])[0]);
  const urls: string[] = [];
  for (const u of links) if (!urls.includes(u)) urls.push(u); // 한 글의 썸네일 · 제목 링크가 여러 개 → 처음 나온 자리만
  return { urls: urls.map((u) => `https://${u}`), text: (document.body?.innerText || '').slice(0, 3000), main: !!document.querySelector('#main_pack') };
}

// 블로그 글 화면 (PostView): 스마트에디터 ONE(.se-main-container) · 예전 에디터(#postViewArea)
function readPost() {
  const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
  const main = q('.se-main-container') || q('#postViewArea');
  const og = (document.querySelector('meta[property="og:title"]') as HTMLMetaElement | null)?.content || '';
  return {
    found: !!main,
    title: ((q('.se-title-text') || q('.pcol1') || q('.htitle'))?.innerText || og).trim(),
    text: main ? main.innerText : '',
    images: main ? (main.querySelectorAll('.se-module-image').length || main.querySelectorAll('img').length) : 0,
    videos: main ? main.querySelectorAll('.se-component.se-video, .se-component.se-oembed').length : 0,
    date: ((q('.se_publishDate') || q('.date'))?.innerText || '').trim() || null,
  };
}
// 검색 화면에서 이 글 자리 표시 (화면 안에서 실행. 인자는 JSON 으로 넘김)
function markPost(a: { id: string; where: 'blog' | 'total'; note: string; app: string }) {
  const BAR = 'gtd-rank-bar';
  const bar = document.getElementById(BAR) || document.body.appendChild(Object.assign(document.createElement('div'), { id: BAR }));
  bar.setAttribute('style', 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#1f4e9a;color:#fff;font:600 15px/1.5 "Malgun Gothic",sans-serif;padding:10px 16px;box-shadow:0 2px 8px rgba(0,0,0,.25)');
  const hit = (u: string) => u.indexOf('blog.naver.com/' + a.id) >= 0;
  let el: Element | null = null;
  if (a.where === 'blog') el = Array.from(document.querySelectorAll('[data-url]')).find((e) => hit((e.getAttribute('data-url') || '').toLowerCase())) || null;
  if (!el) el = Array.from(document.querySelectorAll('#main_pack a[href], a[href]')).find((x) => hit(((x as HTMLAnchorElement).href || '').toLowerCase())) || null;
  if (!el) { bar.textContent = a.app + ' · ' + a.note + ' (이 화면에서 글을 찾지 못했어요. 아래로 내려 보세요)'; return false; }
  // 결과 한 칸: 이 글 주소만 담은 가장 큰 조상
  let box = el as HTMLElement;
  for (let p = box.parentElement; p && p !== document.body; p = p.parentElement) {
    const urls = new Set(Array.from(p.querySelectorAll('[data-url], a[href*="blog.naver.com/"]')).map((x) => ((x.getAttribute('data-url') || (x as HTMLAnchorElement).href || '').toLowerCase().match(/blog\.naver\.com\/[^/?#]+\/\d+/) || [''])[0]).filter(Boolean));
    if (urls.size > 1 || p.offsetHeight > 900) break;
    box = p;
  }
  box.style.outline = '4px solid #e8590c';
  box.style.outlineOffset = '4px';
  box.style.borderRadius = '8px';
  box.style.background = 'rgba(232,89,12,.06)';
  box.scrollIntoView({ block: 'center' });
  bar.textContent = a.app + ' · ' + a.note + ' — 주황색 테두리가 그 글이에요';
  return true;
}

export interface RawPost { url: string; title: string; text: string; images: number; videos: number; date: string | null }
export interface DiagnoseRaw { titleRank: number | null | undefined; top: RawPost[]; totalBlogs: number | null; ours: RawPost | null }


export function createRankChecker(opts: { log?: (code: string, d?: string) => void } = {}) {
  let win: BrowserWindow | null = null;
  let idle: NodeJS.Timeout | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  let last = 0;

  function ses(partition = PARTITION): Session {
    const s = session.fromPartition(partition);
    // 앱 이름 · Electron 표시를 뺀 보통 크롬 UA (숨기려는 게 아니라, 이 표시가 있으면 모바일 · 옛 화면이 나올 수 있어서)
    s.setUserAgent(s.getUserAgent().replace(/\s?(Electron|geulttukttak[^/\s]*|유치원 글뚝딱|kinder[^/\s]*)\/\S+/gi, ''), 'ko-KR,ko');
    return s;
  }
  function getWin() {
    if (idle) { clearTimeout(idle); idle = null; }
    if (win && !win.isDestroyed()) return win;
    win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { session: ses(), backgroundThrottling: false, sandbox: true, contextIsolation: true, nodeIntegration: false } });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.setAudioMuted(true);
    win.on('closed', () => { win = null; });
    return win;
  }
  function scheduleClose() {
    if (idle) clearTimeout(idle);
    idle = setTimeout(() => { win?.destroy(); win = null; }, IDLE_CLOSE_MS);
  }
  // 한 번에 하나씩 · 검색 사이 쉬기
  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = queue.then(async () => {
      if (last && Date.now() - last < 2500) await pause();
      try { return await fn(); } finally { last = Date.now(); scheduleClose(); }
    });
    queue = run.catch(() => {});
    return run;
  }

  // 화면 불러오기: 끝나지 않는 화면(광고 · 늦게 오는 묶음)에 붙잡히지 않게 LOAD_MS 뒤엔 멈추고 그때까지 그려진 것을 읽음 (2026-11-11 시험에서 무한 대기)
  async function open(url: string) {
    const w = getWin();
    for (let i = 0; ; i++) {
      const load = w.loadURL(url).then(() => 'ok' as const, (e: unknown) => e);
      const r = await Promise.race([load, sleep(LOAD_MS).then(() => 'slow' as const)]);
      if (r === 'ok') return w;
      if (r === 'slow') { opts.log?.('rank-slow', url.slice(0, 120)); w.webContents.stop(); return w; }
      if (/ERR_ABORTED/.test(String(r))) return w; // 리디렉트 중 끊긴 것은 무시
      if (i >= 1) throw toApiError(PROVIDER, r); // 한 번만 다시 (그래도 안 되면 인터넷 문제로)
      await sleep(1500);
    }
  }
  // 화면 읽기도 시간 제한. 창이 굳었으면 버리고 다음에 새로 만듦
  async function exec<T>(w: BrowserWindow, fn: () => T): Promise<T> {
    const run = w.webContents.executeJavaScript(`(${fn.toString()})()`) as Promise<T>;
    run.catch(() => {}); // 시간 초과 뒤에 늦게 실패해도 처리 안 된 오류로 남지 않게
    const r = await Promise.race([run, sleep(EXEC_MS).then(() => TIMEOUT)]);
    if (r === TIMEOUT) {
      opts.log?.('rank-exec-timeout', w.webContents.getURL().slice(0, 120));
      if (win === w) { w.destroy(); win = null; }
      throw new ApiError('network', '네이버 화면이 응답하지 않아요. 잠시 뒤 다시 확인해 주세요.', PROVIDER, true);
    }
    return r as T;
  }
  // 결과 글이 하나도 없을 때만 화면 글자를 봄 (결과 제목에 "보안 문자" 같은 말이 있어도 오판하지 않게)
  function blocked(r: { urls: string[]; text: string }, url: string) {
    if (/captcha|nid\.naver\.com/i.test(url) || (!r.urls.length && BLOCKED_HINT.test(r.text))) {
      opts.log?.('rank-blocked', url.slice(0, 120));
      throw new ApiError('rate', '네이버가 잠시 검색 조회를 막았어요. 몇 시간 뒤에 다시 확인해 주세요. (평소 쓰는 브라우저에서 검색하는 데는 문제없어요)', PROVIDER);
    }
  }

  // 결과가 하나도 없는데 "검색 결과 없음" 표시도 없으면 화면이 덜 뜬 것 → 순위 없음으로 저장하지 않음 (2026-11-11 리뷰)
  function notLoaded(r: { urls: string[]; empty?: boolean; main?: boolean }) {
    if (!r.urls.length && !r.empty && r.main !== true) throw new ApiError('network', '네이버 검색 화면을 다 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요.', PROVIDER, true);
  }
  // 블로그 탭: RANK_MAX 개를 볼 때까지 스크롤 (블로그 글 전부의 자리를 보므로 끝까지)
  async function blogTab(keyword: string) {
    const w = await open(`https://search.naver.com/search.naver?ssc=tab.blog.all&query=${encodeURIComponent(keyword)}`);
    let r = await exec(w, readBlogTab);
    blocked(r, w.webContents.getURL());
    notLoaded(r);
    let still = 0, n = r.urls.length;
    // 다음 결과가 늦게 와도 90위 전에 멈추지 않게: 새 결과가 없을 때 5번(약 7초)까지 기다림
    while (n < RANK_MAX && still < 5 && !r.empty) {
      await exec(w, () => globalThis.scrollTo(0, document.body.scrollHeight));
      await sleep(1400);
      r = await exec(w, readBlogTab);
      if (r.urls.length === n) still++; else { still = 0; n = r.urls.length; }
    }
    return r.urls.slice(0, RANK_MAX);
  }
  async function total(keyword: string) {
    const w = await open(`https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(keyword)}`);
    await sleep(800); // 묶음 일부는 늦게 그려짐
    const r = await exec(w, readTotal);
    blocked(r, w.webContents.getURL());
    notLoaded(r);
    return r.urls;
  }

  async function post(k: PostKey): Promise<RawPost | null> {
    const w = await open(`https://blog.naver.com/PostView.naver?blogId=${encodeURIComponent(k.blogId)}&logNo=${k.logNo}&redirect=Dlog&widgetTypeCall=true&noTrackingCode=true&directAccess=false`);
    const r = await exec(w, readPost);
    return r.found ? { url: postUrlOf(k), title: r.title, text: r.text, images: r.images, videos: r.videos, date: r.date } : null;
  }
  // 블로그 탭 첫 화면 (30개)만
  async function firstPage(query: string) {
    const w = await open(`https://search.naver.com/search.naver?ssc=tab.blog.all&query=${encodeURIComponent(query)}`);
    const r = await exec(w, readBlogTab);
    blocked(r, w.webContents.getURL());
    notLoaded(r);
    return r.urls;
  }

  // 사용자가 보는 창: 순위를 잰 것과 같은 조건(로그인 없는 세션)으로 검색 화면을 열고 그 글 자리로
  let viewer: BrowserWindow | null = null;
  async function show(o: { keyword: string; url: string; where: 'blog' | 'total'; rank: number | null }) {
    const k = postKeyOf(o.url);
    if (!k) throw new Error('글 주소가 올바르지 않아요');
    if (!viewer || viewer.isDestroyed()) {
      // 측정 세션과 나눔: 이 창에서 로그인해도 순위 측정은 계속 로그인 없는 상태로
      viewer = new BrowserWindow({ width: 1200, height: 900, autoHideMenuBar: true, webPreferences: { session: ses(VIEW_PARTITION), sandbox: true, contextIsolation: true, nodeIntegration: false } });
      const okUrl = (u: string) => { try { const h = new URL(u).hostname; return /^https:$/.test(new URL(u).protocol) && (h === 'naver.com' || h.endsWith('.naver.com')) && h !== 'nid.naver.com'; } catch { return false; } };
      viewer.webContents.setWindowOpenHandler(({ url }) => { if (okUrl(url)) viewer?.loadURL(url); return { action: 'deny' }; }); // 새 창 대신 같은 창, 네이버 안에서만
      viewer.webContents.on('will-navigate', (e, url) => { if (!okUrl(url)) e.preventDefault(); });
      viewer.on('closed', () => { viewer = null; });
    }
    const w = viewer;
    w.setTitle(`네이버 검색에서 보기 · ${o.keyword}`);
    w.show(); w.focus();
    const page = o.where === 'blog' ? `https://search.naver.com/search.naver?ssc=tab.blog.all&query=${encodeURIComponent(o.keyword)}` : `https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(o.keyword)}`;
    const load = w.loadURL(page).then(() => 'ok', (e: unknown) => e);
    if (await Promise.race([load, sleep(LOAD_MS).then(() => 'slow')]) === 'slow') w.webContents.stop();
    await sleep(800);
    const note = o.rank == null ? `"${o.keyword}" ${o.where === 'blog' ? '블로그 탭' : '통합검색'}에서 이 글 위치` : o.where === 'blog' ? `"${o.keyword}" 블로그 탭 ${o.rank}위` : `"${o.keyword}" 통합검색 블로그 글 ${o.rank}번째`;
    const run = () => w.webContents.executeJavaScript(`(${markPost.toString()})(${JSON.stringify({ id: `${k.blogId}/${k.logNo}`, where: o.where, note, app: APP.appName })})`).catch((e: unknown) => { opts.log?.('rank-show-js', String(e).slice(0, 200)); return false; }) as Promise<boolean>;
    // 블로그 탭은 아래쪽 글이면 스크롤로 더 불러와야 보임 (최대 RANK_MAX)
    for (let i = 0; i < 8; i++) {
      if (w.isDestroyed()) return false;
      if (await run()) return true;
      if (o.where !== 'blog') break;
      await w.webContents.executeJavaScript('window.scrollTo(0, document.body.scrollHeight)').catch(() => {});
      await sleep(1000);
    }
    return w.isDestroyed() ? false : run();
  }

  return {
    show,
    // 원인 분석 자료: 제목 검색 · 블로그 탭 상위 글 · 통합검색 블로그 글 수 · 우리 글과 상위 글 본문 (화면 요청 3 + 1 + top)
    // 다른 사람 글은 숫자 계산에만 쓰고 저장하지 않음 (부르는 쪽에서 숫자만 남김)
    diagnoseData: (keyword: string, title: string, target: PostKey, topN: number): Promise<DiagnoseRaw> => serial(async () => {
      const soft = async <T>(fn: () => Promise<T>, d: T) => { try { return await fn(); } catch (e) { if (e instanceof ApiError && e.code === 'rate') throw e; return d; } };
      const ours = await soft(() => post(target), null); // 먼저 읽어서 네이버에 실제로 올라간 제목으로 검색
      const q = ours?.title || title;
      await sleep(1200);
      const titleRank = q ? await soft(async () => rankOf(await firstPage(q), target).rank, undefined as number | null | undefined) : undefined;
      await pause();
      const urls = await soft(() => firstPage(keyword), [] as string[]);
      const tops: PostKey[] = [];
      for (const u of urls) { const k = postKeyOf(u); if (k && k.blogId !== target.blogId && !tops.some((t) => t.blogId === k.blogId && t.logNo === k.logNo)) tops.push(k); if (tops.length >= topN) break; }
      await pause();
      const totalBlogs = await soft(async () => {
        const w = await open(`https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(keyword)}`);
        await sleep(800);
        const r = await exec(w, readTotal);
        blocked(r, w.webContents.getURL());
        return r.urls.length;
      }, null as number | null);
      const top: RawPost[] = [];
      for (const k of tops) { await sleep(1200 + Math.floor(Math.random() * 1200)); const p = await soft(() => post(k), null); if (p) top.push(p); }
      return { titleRank, top, totalBlogs, ours };
    }),
    // 검색어 하나: 블로그 탭 → (쉬고) → 통합검색. 이 블로그 글이 나온 자리를 모두 돌려줌
    search: (keyword: string, blogId: string): Promise<{ hits: RankHit[]; totalBlogs: number; seen: number }> => serial(async () => {
      const burls = await blogTab(keyword);
      const b = ranksOf(burls, blogId);
      await pause();
      const turls = await total(keyword);
      const t = ranksOf(turls, blogId);
      const urls = [...new Set([...b.keys(), ...t.keys()])];
      const totalBlogs = new Set(turls.map((u) => { const k = postKeyOf(u); return k ? postUrlOf(k) : u; })).size;
      return { hits: urls.map((url) => ({ url, blogRank: b.get(url) ?? null, totalRank: t.get(url) ?? null })).sort((x, y) => (x.blogRank ?? 999) - (y.blogRank ?? 999)), totalBlogs, seen: burls.length };
    }),
    // 블로그 최근 글 50개 (RSS). 비공개 · 없는 블로그면 빈 목록
    recentPosts: async (blogId: string): Promise<RssPost[]> => {
      let res: Response;
      try { res = await fetch(`https://rss.blog.naver.com/${encodeURIComponent(blogId)}.xml`, { signal: AbortSignal.timeout(10_000) }); } catch (e) { throw toApiError(PROVIDER, e); }
      if (!res.ok) throw new ApiError('server', '블로그 글 목록을 받지 못했어요. 잠시 뒤 다시 해 주세요.', PROVIDER, true);
      return parseRss(await res.text()).filter((p) => p.key.blogId === blogId.toLowerCase());
    },
    close: () => { if (idle) clearTimeout(idle); win?.destroy(); win = null; if (viewer && !viewer.isDestroyed()) viewer.destroy(); viewer = null; },
  };
}
export type RankChecker = ReturnType<typeof createRankChecker>;
