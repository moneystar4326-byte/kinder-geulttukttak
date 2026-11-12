// 블로그 노출 순위 (태권 글뚝딱 2.8.0에서 옮김, 2026-11-11)
// - 블로그 주소 하나로 최근 글(RSS)을 모두 불러와, 글마다 검색어(앱 검색어 → 태그 → 제목)로 순위를 봄
// - 검색어 하나를 한 번 검색하면 그 블로그 글 전부의 자리를 같이 기록 (같은 태그를 쓰는 글이 많아 조회가 크게 줄어듦)
// - 로그인하지 않은 상태의 네이버 검색 화면을 그대로 읽어 "몇 번째에 보이는지"를 셈 (검색 API 순위는 실제 화면과 달라서 쓰지 않음)
// - 블로그 탭: 스크롤하면 같은 글이 다시 나오기도 함 → 화면에 "처음 나온 자리"가 순위
// - 통합검색: 첫 화면에 나온 블로그 글만, 위에서 몇 번째인지 (묶음 제목은 자주 바뀌어 세지 않음)

export const RANK_MAX = 90; // 블로그 탭은 90위(스크롤 3번)까지만 봄
export const RANK_DAILY_LIMIT = 40; // 하루 검색어 확인 횟수 (네이버가 막지 않게)
export const RANK_COOLDOWN_MS = 3 * 3600_000; // 같은 검색어는 3시간 안에 다시 조회하지 않음
export const RANK_KEYWORDS_MAX = 5; // 글 하나에 볼 검색어
export const RANK_ALL_POSTS = 20; // [모두 확인]은 최근 글 이만큼의 첫 검색어
export const RANK_TAG_KEYWORDS = 2; // 태그에서 가져올 검색어 수

export interface PostKey { blogId: string; logNo: string }
export interface RankCheck {
  keyword: string;
  blogRank: number | null; // 블로그 탭 순위 (RANK_MAX 안에 없으면 null)
  totalRank: number | null; // 통합검색 첫 화면에서 몇 번째 블로그 글인지 (없으면 null)
  otherRank: number | null; // 이 글은 없지만 같은 블로그의 다른 글이 블로그 탭에 있을 때 그 순위
  otherUrl: string | null;
  checkedAt: string;
  seen?: number | null; // 블로그 탭에서 실제로 본 자리 수 (RANK_MAX 보다 적으면 결과가 그만큼뿐이었음)
}
// 검색 한 번의 기록: 그 블로그 글 중 결과에 나온 것 전부
export interface RankHit { url: string; blogRank: number | null; totalRank: number | null }
export interface RankSearch { keyword: string; checkedAt: string; hits: RankHit[]; totalBlogs: number | null; seen?: number | null }
export type KeywordSource = 'custom' | 'app' | 'tag' | 'title';
export interface PostRow {
  url: string;
  title: string;
  publishedAt: string | null;
  tags: string[];
  keywords: string[];
  keywordSource: KeywordSource; // 직접 정함 · 앱으로 쓴 글의 검색어 · 태그 · 제목
  articleId: string | null; // 앱으로 쓴 글이면
  latest: Record<string, RankCheck | undefined>; // 검색어 → 가장 최근 확인
  previous: Record<string, RankCheck | undefined>; // 검색어 → 그 앞 확인 (변화 표시용)
  history: Record<string, RankCheck[]>; // 검색어 → 최근 10번 (오래된 것 먼저)
  diagnoses: Record<string, import('./diagnose').Diagnosis>; // 검색어 → 가장 최근 원인 분석
}
export interface KeywordSummary { keyword: string; checkedAt: string | null; seen?: number | null; posts: (RankHit & { title: string })[]; usedBy: number }
export interface RankOverview {
  blogId: string | null;
  ownBlog: boolean; // 유치원 정보의 블로그인지 (앱으로 쓴 글 · 동네 이름 추천은 이때만)
  rssCount: number; // RSS로 받은 글 수 (블로그 설정에 따라 10개뿐일 수 있음)
  rows: PostRow[];
  keywords: KeywordSummary[];
  usedToday: number; limit: number; diagToday: number; diagLimit: number;
}

// 네이버 블로그 글 주소 → 아이디 · 글 번호. 아래 모양을 모두 받음
//   https://blog.naver.com/아이디/224451496312 · https://m.blog.naver.com/아이디/224451496312
//   https://blog.naver.com/PostView.naver?blogId=아이디&logNo=224451496312 (PostView.nhn 도)
export function postKeyOf(url: string | null | undefined): PostKey | null {
  if (!url) return null;
  const s = url.trim();
  const a = s.match(/^(?:https?:\/\/)?(?:m\.)?blog\.naver\.com\/([A-Za-z0-9_-]+)\/(\d{6,})(?:[/?#]|$)/i);
  if (a && !/^PostView/i.test(a[1])) return { blogId: a[1].toLowerCase(), logNo: a[2] };
  if (/^(?:https?:\/\/)?(?:m\.)?blog\.naver\.com\/PostView\.(?:naver|nhn)/i.test(s)) {
    const id = s.match(/[?&]blogId=([A-Za-z0-9_-]+)/i)?.[1], no = s.match(/[?&]logNo=(\d{6,})/i)?.[1];
    if (id && no) return { blogId: id.toLowerCase(), logNo: no };
  }
  return null;
}
export function blogIdFrom(input: string | null | undefined): string | null {
  const s = (input ?? '').trim();
  if (!s) return null;
  const k = postKeyOf(s);
  if (k) return k.blogId;
  const m = s.match(/^(?:https?:\/\/)?(?:m\.)?blog\.naver\.com\/(?:PostList\.(?:naver|nhn)\?.*?blogId=)?([A-Za-z0-9_-]{3,30})(?:[/?#]|$)/i)
    ?? s.match(/^(?:https?:\/\/)?(?:m\.)?blog\.naver\.com\/[^?]*\?(?:.*&)?blogId=([A-Za-z0-9_-]{3,30})/i);
  if (m && !/^(PostView|PostList)/i.test(m[1])) return m[1].toLowerCase();
  if (/^[A-Za-z0-9_-]{3,30}$/.test(s)) return s.toLowerCase(); // 아이디만
  return null;
}
export const postUrlOf = (k: PostKey) => `https://blog.naver.com/${k.blogId}/${k.logNo}`;
export const sameBlog = (a: PostKey, blogId: string) => a.blogId === blogId.toLowerCase();

// 검색 화면에서 읽은 주소 목록(화면 순서) → 이 글의 순위 · 같은 블로그 다른 글의 가장 높은 순위
export function rankOf(urls: string[], target: PostKey) {
  const seen = new Set<string>();
  let n = 0, rank: number | null = null, other: { rank: number; url: string } | null = null;
  for (const u of urls) {
    const k = postKeyOf(u);
    if (!k) continue;
    const id = `${k.blogId}/${k.logNo}`;
    n++; // 화면에 보인 자리 (다시 나온 글도 한 자리를 차지함)
    if (seen.has(id)) continue;
    seen.add(id);
    if (k.blogId === target.blogId && k.logNo === target.logNo) { rank ??= n; continue; }
    if (k.blogId === target.blogId && !other) other = { rank: n, url: postUrlOf(k) };
  }
  return { rank, other, seen: n };
}

// 검색 화면 주소 목록 → 이 블로그 글들이 처음 나온 자리 (주소 → 순위)
export function ranksOf(urls: string[], blogId: string) {
  const out = new Map<string, number>(), seen = new Set<string>();
  let n = 0;
  for (const u of urls) {
    const k = postKeyOf(u);
    if (!k) continue;
    n++;
    const id = postUrlOf(k);
    if (seen.has(id)) continue;
    seen.add(id);
    if (k.blogId === blogId.toLowerCase()) out.set(id, n);
  }
  return out;
}
// 검색 기록 하나에서 이 글의 결과 (없으면 같은 블로그의 가장 높은 다른 글)
export function checkFrom(search: RankSearch, url: string): RankCheck {
  const me = search.hits.find((h) => h.url === url);
  const other = me?.blogRank != null ? null : search.hits.filter((h) => h.url !== url && h.blogRank != null).sort((a, b) => a.blogRank! - b.blogRank!)[0];
  return { keyword: search.keyword, blogRank: me?.blogRank ?? null, totalRank: me?.totalRank ?? null, otherRank: other?.blogRank ?? null, otherUrl: other?.url ?? null, checkedAt: search.checkedAt, seen: search.seen ?? null };
}

// 블로그 RSS (https://rss.blog.naver.com/아이디.xml) → 최근 글 목록. 제목은 CDATA 로 옴
export interface RssPost { title: string; url: string; key: PostKey; publishedAt: string | null; tags: string[] }
const decode = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, '&').trim();
export function parseRss(xml: string): RssPost[] {
  const out: RssPost[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const tag = (t: string) => { const r = m[1].match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)); return r ? decode(r[1]) : ''; };
    const key = postKeyOf(tag('guid')) ?? postKeyOf(tag('link'));
    if (!key) continue;
    const d = Date.parse(tag('pubDate'));
    const tags = [...new Set(tag('tag').split(',').map((t) => t.trim()).filter((t) => t && t.length <= 40))];
    out.push({ title: tag('title'), url: postUrlOf(key), key, publishedAt: Number.isFinite(d) ? new Date(d).toISOString() : null, tags });
  }
  return out;
}

// 제목 비교: 띄어쓰기 · 기호 · [동네 머리말]을 빼고 비교. 네이버에서 조금 고쳐도 맞게 2글자 묶음 유사도로
export const normTitle = (s: string) => s.replace(/\[[^\]]*\]/g, '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
function bigrams(s: string) { const m = new Map<string, number>(); for (let i = 0; i < s.length - 1; i++) { const b = s.slice(i, i + 2); m.set(b, (m.get(b) ?? 0) + 1); } return m; }
export function titleScore(a: string, b: string) {
  const x = normTitle(a), y = normTitle(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.length >= 8 && y.length >= 8 && (x.includes(y) || y.includes(x))) return 0.95;
  const A = bigrams(x), B = bigrams(y);
  let both = 0, total = 0;
  for (const [k, v] of A) { both += Math.min(v, B.get(k) ?? 0); total += v; }
  for (const v of B.values()) total += v;
  return total ? (2 * both) / total : 0;
}
export const TITLE_MATCH = 0.8;

// 앱에서 쓴 글 ↔ 블로그 최근 글 맞추기. 글은 만든 날 하루 전부터 발행된 것만, 글 하나에 블로그 글 하나
export function matchPosts(articles: { id: string; titles: string[]; createdAt: string }[], posts: RssPost[], taken: Set<string> = new Set()) {
  const pairs: { articleId: string; post: RssPost; score: number }[] = [];
  for (const a of articles) {
    const from = Date.parse(a.createdAt) - 86_400_000;
    for (const p of posts) {
      if (p.publishedAt && Date.parse(p.publishedAt) < from) continue;
      const score = Math.max(0, ...a.titles.filter(Boolean).map((t) => titleScore(t, p.title)));
      if (score >= TITLE_MATCH) pairs.push({ articleId: a.id, post: p, score });
    }
  }
  pairs.sort((x, y) => y.score - x.score);
  const used = new Set(taken), done = new Set<string>(), out = new Map<string, RssPost>();
  for (const p of pairs) {
    if (done.has(p.articleId) || used.has(p.post.url)) continue;
    out.set(p.articleId, p.post); done.add(p.articleId); used.add(p.post.url);
  }
  return out;
}

// 글의 검색어: 주요 → 보조 → 직접 추가 순서, 띄어쓰기만 다른 것은 하나로
export function keywordsOf(main: string | undefined, subs: string[] | undefined, extra: string[] = []) {
  const out: string[] = [], seen = new Set<string>();
  for (const k of [main ?? '', ...(subs ?? []), ...extra]) {
    const t = k.replace(/\s+/g, ' ').trim();
    const id = t.replace(/\s/g, '').toLowerCase();
    if (!t || t.length > 40 || seen.has(id)) continue;
    seen.add(id); out.push(t);
  }
  return out.slice(0, RANK_KEYWORDS_MAX);
}

// 태그도 앱 검색어도 없을 때: 제목 첫 마디 (쉼표 · 기호 앞). 너무 길면 앞 세 낱말
export function titleKeyword(title: string): string | null {
  const head = title.replace(/\[[^\]]*\]/g, ' ').split(/[,，|｜:：!！?？·~()「」<>]/)[0].replace(/\s+/g, ' ').trim();
  if (!head) return null;
  if (head.length <= 20) return head.length >= 2 ? head : null;
  return head.split(' ').slice(0, 3).join(' ');
}
// 글의 검색어: 직접 정한 것 → 앱으로 쓴 글의 검색어 → 태그 앞쪽 → 제목
export function postKeywords(p: { title: string; tags: string[] }, custom: string[] | null, app: string[] | null): { keywords: string[]; source: KeywordSource } {
  if (custom?.length) return { keywords: keywordsOf('', custom), source: 'custom' };
  if (app?.length) return { keywords: keywordsOf('', app), source: 'app' };
  const tags = keywordsOf('', p.tags).slice(0, RANK_TAG_KEYWORDS);
  if (tags.length) return { keywords: tags, source: 'tag' };
  const t = titleKeyword(p.title);
  return { keywords: t ? [t] : [], source: 'title' };
}

// 화면 문구
// 없을 때: 90위까지 봤으면 "90위 밖", 그 전에 끝났으면 본 만큼만 말함 (결과가 적었는지, 더 안 불러와졌는지 구분할 수 없어서)
export const rankText = (r: number | null | undefined, seen?: number | null) => (r != null ? `${r}위` : seen != null && seen < RANK_MAX ? `${seen}위까지 봤는데 없음` : `${RANK_MAX}위 밖`);
export function changeText(now: number | null, before: number | null | undefined): { text: string; kind: 'up' | 'down' | 'same' | 'new' | 'gone' } | null {
  if (before === undefined) return null;
  if (now != null && before == null) return { text: '새로 보임', kind: 'new' };
  if (now == null && before != null) return { text: '안 보임', kind: 'gone' };
  if (now == null || before == null) return null;
  if (now === before) return { text: '그대로', kind: 'same' };
  return now < before ? { text: `▲ ${before - now}`, kind: 'up' } : { text: `▼ ${now - before}`, kind: 'down' };
}

// 네이버가 자동 조회를 막은 화면인지 (우회하지 않고 멈춤)
export const BLOCKED_HINT = /자동입력\s*방지|비정상적인\s*(검색|접근)|captcha|보안\s*문자|일시적으로\s*제한/i;

// 월간 검색량 (네이버 검색광고 API 원문: 숫자 또는 "< 10" 같은 문자열)
export interface RankVolume { pc?: string; mobile?: string; competition?: string; fetchedAt?: string }
export const volumeId = (k: string) => k.replace(/\s+/g, '').toLowerCase();
export function volumeText(v: RankVolume | null | undefined) {
  if (!v || (v.pc == null && v.mobile == null)) return null;
  const n = (x?: string) => (x != null && /^\d+$/.test(x) ? Number(x) : null);
  const a = n(v.pc), b = n(v.mobile);
  if (a != null && b != null) return { total: (a + b).toLocaleString('ko-KR'), detail: `PC ${a.toLocaleString('ko-KR')} · 모바일 ${b.toLocaleString('ko-KR')}` };
  return { total: `${v.mobile ?? '?'}`, detail: `PC ${v.pc ?? '?'} · 모바일 ${v.mobile ?? '?'}` }; // "< 10" 이 섞이면 더하지 않고 원문대로
}
