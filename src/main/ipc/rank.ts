// 블로그 노출 순위 통로 (태권 글뚝딱 2.8.0에서 옮김, 2026-11-11)
// - 블로그 주소 하나 → RSS 최근 글을 모두 불러옴. 글마다 검색어: 직접 정한 것 → 앱으로 쓴 글의 검색어(유치원 블로그일 때, 제목으로 맞춤) → 태그 → 제목
// - 검색어 하나를 한 번 검색해 그 블로그 글 전부의 자리를 기록 (rank_searches). 글별 · 검색어별 화면은 이 기록으로 만듦
// - 하루 횟수 · 같은 검색어 다시 보기 간격을 둠 (네이버가 막지 않게). 화면은 검색어 하나씩 차례로 부름
import { app } from 'electron';
import { z } from 'zod';
import { handle, type AppCtx } from './index';
import { log } from '../log';
import { ApiError } from '../services/errors';
import { createRankChecker } from '../services/blog-rank';
import { blogIdOf } from '../services/browser-draft';
import { loadSettings } from '../settings';
import { hintOf, lookupKeywords } from '../services/naver-keywords';
import { diagnose, statsOf, suggestKeywords, DIAG_DAILY_LIMIT, DIAG_TOP, type Diagnosis } from '../../shared/diagnose';
import type { KeywordRow } from '../../shared/types';
import { foreignKeyword, notParentKeyword } from '../../shared/keywords';
import { searchPlaces } from '../../shared/areas';
import {
  blogIdFrom, checkFrom, keywordsOf, matchPosts, postKeyOf, postKeywords, volumeId,
  RANK_COOLDOWN_MS, RANK_DAILY_LIMIT, type KeywordSummary, type PostRow, type RankOverview, type RankSearch, type RankVolume, type RssPost,
} from '../../shared/rank';

const BLOG_KEY = 'rankBlog'; // 마지막으로 본 블로그 아이디
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };
const Kw = z.string().trim().min(1).max(40);
// 하루 한도: 설치본은 고정. 개발 실행(시험판)에서만 GTD_RANK_LIMIT · GTD_DIAG_LIMIT 로 늘려 시험할 수 있음
const devLimit = (name: string, d: number) => { const n = Number(process.env[name]); return !app.isPackaged && n > 0 ? n : d; };
const rankLimit = () => devLimit('GTD_RANK_LIMIT', RANK_DAILY_LIMIT);
const diagLimit = () => devLimit('GTD_DIAG_LIMIT', DIAG_DAILY_LIMIT);

export function registerRankIpc(ctx: AppCtx) {
  const { db } = ctx;
  // 같은 검색 · 같은 분석이 두 번 돌지 않게: 진행 중이면 그 결과를 같이 씀 (빠르게 두 번 누르면 한도 · 3시간 제한을 비켜 가던 것, 2026-11-11 리뷰)
  const inflight = new Map<string, Promise<unknown>>();
  const once = <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const cur = inflight.get(key);
    if (cur) return cur as Promise<T>;
    const p = fn().finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  };
  const checker = createRankChecker({ log });
  app.on('before-quit', () => checker.close());
  const gate = () => { if (!(process.env.GTD_LICENSE_OFF === '1' && !app.isPackaged)) ctx.license.assertCanCreate(); };

  const ownBlogId = () => blogIdOf(db.getProfile()?.blogUrl ?? '')?.toLowerCase() ?? null;
  const currentBlog = () => db.getSetting<string | null>(BLOG_KEY, null) ?? ownBlogId();

  // 유치원 블로그면: 앱으로 쓴 글 ↔ 블로그 글을 제목으로 맞춰, 앱 글의 검색어를 씀
  function appKeywords(blogId: string, posts: { url: string; title: string; publishedAt: string | null }[]) {
    const out = new Map<string, string[]>();
    if (blogId !== ownBlogId()) return out;
    const arts = db.listArticles().filter((s) => !s.demo && s.title).map((s) => {
      const a = db.getArticle(s.id)!;
      const v = a.currentVersionId ? db.getVersion(a.currentVersionId) : null;
      return { id: s.id, titles: [v?.title ?? '', ...(v?.doc?.titleCandidates ?? [])], createdAt: a.createdAt, kw: keywordsOf(a.input.mainKeyword, a.input.subKeywords) };
    });
    const rss = posts.map((p) => ({ title: p.title, url: p.url, key: postKeyOf(p.url)!, publishedAt: p.publishedAt, tags: [] })) as RssPost[];
    for (const [id, p] of matchPosts(arts, rss)) { const kw = arts.find((a) => a.id === id)!.kw; if (kw.length) out.set(p.url, kw); }
    return out;
  }

  function overview(rssCount = -1): RankOverview {
    const blogId = currentBlog();
    const base = { usedToday: db.countRankSearches(startOfToday()), limit: rankLimit(), diagToday: db.countDiagnoses(startOfToday()), diagLimit: diagLimit() };
    if (!blogId) return { blogId: null, ownBlog: false, rssCount: 0, rows: [], keywords: [], ...base };
    const posts = db.listBlogPosts(blogId);
    const app = appKeywords(blogId, posts);
    const byKw = new Map<string, RankSearch[]>();
    for (const s of db.rankSearches(blogId)) { const k = volumeId(s.keyword); (byKw.get(k) ?? byKw.set(k, []).get(k)!).push(s); }
    const rows: PostRow[] = posts.map((p) => {
      const { keywords, source } = postKeywords(p, p.keywords, app.get(p.url) ?? null);
      const latest: PostRow['latest'] = {}, previous: PostRow['previous'] = {}, history: PostRow['history'] = {};
      for (const k of keywords) {
        const h = (byKw.get(volumeId(k)) ?? []).map((s) => checkFrom(s, p.url));
        if (!h.length) continue;
        latest[k] = h[h.length - 1]; previous[k] = h[h.length - 2]; history[k] = h.slice(-10);
      }
      return { url: p.url, title: p.title, publishedAt: p.publishedAt, tags: p.tags, keywords, keywordSource: source, articleId: null, latest, previous, history, diagnoses: db.latestDiagnoses(p.url) };
    });
    // 검색어별: 글들이 쓰는 검색어 + 검색 기록이 있는 검색어
    const title = new Map(posts.map((p) => [p.url, p.title]));
    const names = new Map<string, string>(); const usedBy = new Map<string, number>();
    for (const r of rows) for (const k of r.keywords) { const id = volumeId(k); if (!names.has(id)) names.set(id, k); usedBy.set(id, (usedBy.get(id) ?? 0) + 1); }
    for (const [id, list] of byKw) if (!names.has(id)) names.set(id, list[list.length - 1].keyword);
    const keywords: KeywordSummary[] = [...names].map(([id, keyword]) => {
      const last = byKw.get(id)?.at(-1);
      return { keyword, checkedAt: last?.checkedAt ?? null, seen: last?.seen ?? null, usedBy: usedBy.get(id) ?? 0, posts: (last?.hits ?? []).map((h) => ({ ...h, title: title.get(h.url) ?? '(최근 50개 밖의 글)' })) };
    }).sort((a, b) => b.usedBy - a.usedBy || a.keyword.localeCompare(b.keyword));
    return { blogId, ownBlog: blogId === ownBlogId(), rssCount, rows, keywords, ...base };
  }

  // 블로그 주소를 넣거나(바꾸거나) 화면을 열 때: RSS 로 최근 글을 새로 받음 (못 받으면 저장된 글로)
  handle('rank:load', z.object({ blog: z.string().max(300).optional() }).optional(), async (arg) => {
    if (arg?.blog !== undefined) {
      const id = blogIdFrom(arg.blog);
      if (!id) throw new Error('네이버 블로그 주소를 확인해 주세요 (예: https://blog.naver.com/아이디 또는 아이디만)');
      db.setSetting(BLOG_KEY, id);
    }
    const blogId = currentBlog();
    if (!blogId) return { overview: overview(0), warn: null };
    let rssCount = -1, warn: string | null = null;
    try {
      const posts = await checker.recentPosts(blogId);
      rssCount = posts.length;
      if (posts.length) db.saveBlogPosts(blogId, posts);
      else warn = '블로그 글 목록이 비어 있어요. 블로그 주소가 맞는지, 전체 공개 글이 있는지 확인해 주세요.';
    } catch (e) { warn = `블로그 글 목록을 새로 받지 못했어요. 저장된 글로 보여 드려요. (${e instanceof Error ? e.message : ''})`; }
    return { overview: overview(rssCount), warn };
  });

  // 글의 검색어 직접 정하기 (null 이면 자동으로 되돌림)
  handle('rank:setKeywords', z.object({ url: z.string().max(300), keywords: z.array(z.string().max(40)).max(5).nullable() }), ({ url, keywords }) => {
    if (!db.getBlogPost(url)) throw new Error('글을 찾지 못했어요');
    db.setPostKeywords(url, keywords ? keywordsOf('', keywords) : null);
    return overview();
  });

  // 검색어 하나 확인: 이 블로그 글 전부의 자리를 기록. 3시간 안에 본 검색어는 지난 결과 그대로
  handle('rank:checkKeyword', z.object({ keyword: Kw }), async ({ keyword }) => {
    gate();
    const blogId = currentBlog();
    if (!blogId) throw new Error('블로그 주소를 먼저 넣어 주세요.');
    return once(`kw:${blogId}|${volumeId(keyword)}`, () => checkKeyword(blogId, keyword));
  });
  async function checkKeyword(blogId: string, keyword: string) {
    const last = db.rankSearches(blogId).filter((s) => volumeId(s.keyword) === volumeId(keyword)).at(-1);
    if (last && Date.now() - Date.parse(last.checkedAt) < RANK_COOLDOWN_MS) return { skipped: true, usedToday: db.countRankSearches(startOfToday()) };
    if (db.countRankSearches(startOfToday()) >= rankLimit()) throw new ApiError('limit', `오늘 순위 확인은 ${rankLimit()}번까지예요. 내일 다시 확인해 주세요. (네이버가 조회를 막지 않게 정해 둔 횟수예요)`, '네이버 검색');
    const r = await checker.search(keyword, blogId);
    db.addRankSearch(blogId, keyword, r.hits, r.totalBlogs, r.seen);
    return { skipped: false, usedToday: db.countRankSearches(startOfToday()) };
  }
  handle('rank:overview', z.undefined(), () => overview());
  // 네이버 검색 화면에서 그 글 자리 보여 주기 (조회 횟수에 넣지 않음: 사람이 한 번 여는 것)
  handle('rank:showInSearch', z.object({ keyword: Kw, url: z.string().max(300), where: z.enum(['blog', 'total']), rank: z.number().int().min(1).max(999).nullable() }), (o) => checker.show(o));

  // 검색어별 월간 검색량 (네이버 검색광고 API, 설정에 넣은 키). 검색어 하나씩 저장해 두고 설정의 재조회 간격 안에는 다시 부르지 않음
  // 키가 없으면 needKey, API 오류는 error 문장으로 (순위 화면은 그대로 보이게)
  const VOL = 'naver-volume';
  handle('rank:volumes', z.array(z.string().max(40)).max(120), async (words) => {
    const volumes: Record<string, RankVolume | null> = {};
    const maxAge = Math.max(1, loadSettings(db).keywordCacheHours) * 3600_000;
    const miss: string[] = [];
    for (const w of [...new Set(words.map((x) => x.trim()).filter(Boolean))]) {
      const c = db.cachedLookup(volumeId(w), VOL, maxAge);
      if (c) volumes[w] = c.rows[0] ?? null; else miss.push(w);
    }
    if (!miss.length) return { volumes, needKey: false, error: null };
    const v = ctx.vault;
    const apiKey = v.get('naverApiKey'), secret = v.get('naverSecret'), customerId = v.get('naverCustomer');
    if (!apiKey || !secret || !customerId) return { volumes, needKey: true, error: null };
    // 한 번에 5개까지 (API 규칙). 묶음을 쉬지 않고 보내면 검색광고가 400 · 429 로 잠깐 거절함 (2026-11-11 시험) →
    // 묶음 사이 1.2초 쉬고, 거절되면 2.5초 뒤 한 번 더. 그래도 안 되면 그 묶음만 빼고 나머지는 보여 줌 (키가 틀린 거절은 바로 멈춤)
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let failed = 0, lastErr: unknown = null;
    for (let i = 0; i < miss.length; i += 5) {
      const chunk = miss.slice(i, i + 5);
      if (i) await wait(1200);
      let r: Awaited<ReturnType<typeof lookupKeywords>> | null = null;
      for (let t = 0; t < 2 && !r; t++) {
        try { r = await lookupKeywords({ apiKey, secret, customerId }, chunk); } catch (e) {
          lastErr = e;
          if (e instanceof ApiError && e.code === 'auth') return { volumes, needKey: false, error: e.message };
          if (t === 0) await wait(2500);
        }
      }
      if (!r) { failed += chunk.length; log('rank-volume', `${chunk.length}개 실패: ${lastErr instanceof Error ? lastErr.message : ''}`); continue; }
      for (const w of chunk) {
        const row = r.rows.find((x) => volumeId(x.keyword) === volumeId(w)) ?? null;
        db.saveLookup(volumeId(w), VOL, '', row ? [row] : []);
        volumes[w] = row ? { pc: row.pc, mobile: row.mobile, competition: row.competition, fetchedAt: row.fetchedAt } : null;
      }
    }
    return { volumes, needKey: false, error: failed ? `검색어 ${failed}개는 네이버 검색광고가 잠깐 바빠서 받지 못했어요. 화면을 다시 열면 이어서 받아요.` : null };
  });

  // 검색광고 연관 검색어 (새 글 작성의 키워드 조회와 같은 저장 값을 같이 씀). 키가 없으면 undefined, 오류면 null
  async function related(keyword: string): Promise<KeywordRow[] | null | undefined> {
    const v = ctx.vault;
    const apiKey = v.get('naverApiKey'), secret = v.get('naverSecret'), customerId = v.get('naverCustomer');
    let q: string;
    try { q = hintOf([keyword]); } catch { return null; }
    const c = db.cachedLookup(q, 'naver', Math.max(1, loadSettings(db).keywordCacheHours) * 3600_000);
    if (c) return c.rows;
    if (!apiKey || !secret || !customerId) return undefined;
    try { const r = await lookupKeywords({ apiKey, secret, customerId }, [keyword]); db.saveLookup(q, 'naver', r.raw, r.rows); return r.rows; } catch (e) { log('rank-related', e instanceof Error ? e.message : String(e)); return null; }
  }

  // 원인 분석 (규칙). 같은 글 · 검색어는 하루 한 번 새로 (그 사이엔 저장된 결과), 하루 DIAG_DAILY_LIMIT 번
  handle('rank:diagnose', z.object({ url: z.string().max(300), keyword: Kw }), ({ url, keyword }) => { gate(); return once(`diag:${url}|${volumeId(keyword)}`, () => runDiagnose(url, keyword)); });
  async function runDiagnose(url: string, keyword: string): Promise<{ diagnosis: Diagnosis; cached: boolean; overview: RankOverview }> {
    const r = overview().rows.find((x) => x.url === url);
    const key = postKeyOf(url);
    if (!r || !key) throw new Error('글을 찾지 못했어요');
    const check = r.latest[keyword];
    if (!check) throw new Error('먼저 [순위 확인]을 해 주세요.');
    const old = r.diagnoses[keyword];
    if (old && old.createdAt >= startOfToday()) return { diagnosis: old, cached: true, overview: overview() };
    if (db.countDiagnoses(startOfToday()) >= diagLimit()) throw new ApiError('limit', `오늘 원인 분석은 ${diagLimit()}번까지예요. 내일 다시 해 주세요. (네이버가 조회를 막지 않게 정해 둔 횟수예요)`, '네이버 검색');

    const own = key.blogId === ownBlogId();
    const profile = own ? db.getProfile() : null; // 동네 이름 추천 · 다른 유치원 이름 거르기는 유치원 블로그일 때만 (다른 블로그는 어린이집 · 학원 · 원장님 쪽 말만 거름)
    const [rss, rel] = await Promise.all([checker.recentPosts(key.blogId).catch(() => null), related(keyword)]);
    const raw = await checker.diagnoseData(keyword, r.title, key, DIAG_TOP);
    // 우리 글도 상위 글도 못 읽었으면 인터넷 · 네이버 문제 → "확인 못 함"투성이를 하루 동안 저장하지 않음
    if (!raw.ours && !raw.top.length) throw new ApiError('network', '네이버 글을 읽지 못했어요. 인터넷 연결을 확인하고 잠시 뒤 다시 해 주세요.', '네이버 검색', true);
    const now = new Date().toISOString();
    const ours = raw.ours ? statsOf(raw.ours, keyword) : null;
    const volRow = rel?.find((x) => volumeId(x.keyword) === volumeId(keyword));
    const places = profile ? searchPlaces(profile.region, profile.nearbyAreas ?? []) : [];
    const foreign = profile ? (k: string) => foreignKeyword(k, profile.region, profile) : notParentKeyword;
    const diagnosis = diagnose({
      keyword, now, check, ours,
      publishedAt: r.publishedAt ?? ours?.publishedAt ?? null,
      titleRank: raw.titleRank,
      volume: rel === undefined ? undefined : volRow ? { pc: volRow.pc, mobile: volRow.mobile, competition: volRow.competition } : null,
      totalBlogs: raw.totalBlogs,
      top: raw.top.map((p) => statsOf(p, keyword)),
      recent30: rss ? rss.filter((p) => p.publishedAt && Date.parse(now) - Date.parse(p.publishedAt) < 30 * 86_400_000).length : null,
      suggestions: suggestKeywords(keyword, rel ?? [], places, r.keywords, foreign),
    });
    db.addDiagnosis(url, diagnosis);
    return { diagnosis, cached: false, overview: overview() };
  }
}
