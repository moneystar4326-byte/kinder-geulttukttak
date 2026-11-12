// 노출 원인 분석 (태권 글뚝딱 2.8.0에서 옮김, 2026-11-11): 규칙으로만 판단 (AI 없음). 네이버 순위 방식은 공개되지 않았으므로
// "확인된 사실(ok · warn)"과 "가능성(info)"을 나누고, 할 일은 앞 순서(더 확실한 원인)부터 3개까지
// 순서: ① 새 글 ② 누락 ③ 우리 다른 글 ④ 검색어 위치 · 횟수 ⑦ 상위 글 비교 ⑤ 검색어 경쟁 ⑥ 통합검색 블로그 자리 ⑧ 블로그 활동
import type { RankCheck, RankVolume } from './rank';
import { APP } from './kinder';

export const NEW_POST_DAYS = 3; // 발행 후 이 기간은 순위가 자리 잡는 중으로 봄
export const KW_FEW = 1; // 본문 검색어 이 횟수 이하면 적음
export const KW_GOOD = [3, 5] as const; // 권장 범위 (안내 문구용)
export const KW_MANY = 10; // 이 횟수를 넘으면 많음
export const ACTIVE_30D_OK = 4; // 최근 30일 이 개수 이상이면 꾸준함
export const ACTIVE_30D_LOW = 2; // 이 개수 이하면 적음
export const TOP_RATIO = 0.7; // 상위 글 평균의 이 비율 아래면 짧음 · 적음
export const DIAG_DAILY_LIMIT = 10; // 하루 진단 횟수
export const DIAG_TOP = 3; // 비교할 상위 글 수

export interface PostStats {
  url: string;
  title: string;
  chars: number; // 본문 글자 수 (띄어쓰기 제외)
  images: number;
  videos: number;
  publishedAt: string | null;
  kwInTitle: 'front' | 'back' | 'words' | null; // 제목에 검색어가: 앞쪽 절반 · 뒤쪽 · 단어만 흩어져 있음 · 없음
  kwCount: number; // 본문에 검색어가 붙은 그대로 나온 횟수 (띄어쓰기 무시)
  kwWords: number; // 검색어 단어가 따로따로 나온 횟수 중 가장 적은 것 (단어 하나면 kwCount 와 같음)
}
export type FindingStatus = 'ok' | 'warn' | 'info' | 'unknown';
export interface Finding { id: string; status: FindingStatus; title: string; detail?: string; todo?: string }
export interface Suggestion { keyword: string; volume?: string; why: string }
export interface Diagnosis {
  keyword: string;
  createdAt: string;
  findings: Finding[];
  todos: string[];
  ours: PostStats | null;
  top: PostStats[];
  avg: { chars: number; images: number } | null;
  suggestions: Suggestion[];
}

const nospace = (s: string) => s.replace(/[\s\u200b-\u200d\ufeff]+/g, '').toLowerCase(); // 네이버 본문의 폭 없는 공백도 뺌

// 제목 · 본문에서 검색어 찾기 (띄어쓰기 무시)
export function keywordInTitle(title: string, keyword: string): PostStats['kwInTitle'] {
  const t = nospace(title), k = nospace(keyword);
  if (!k || !t) return null;
  const i = t.indexOf(k);
  if (i >= 0) return i + k.length / 2 <= t.length / 2 ? 'front' : 'back';
  const words = keyword.split(/\s+/).map(nospace).filter(Boolean);
  return words.length > 1 && words.every((w) => t.includes(w)) ? 'words' : null;
}
export function keywordCount(text: string, keyword: string) {
  const t = nospace(text), k = nospace(keyword);
  if (!k) return 0;
  let n = 0;
  for (let i = t.indexOf(k); i >= 0; i = t.indexOf(k, i + k.length)) n++;
  return n;
}
export function wordsCount(text: string, keyword: string) {
  const words = keyword.split(/\s+/).filter(Boolean);
  return words.length ? Math.min(...words.map((w) => keywordCount(text, w))) : 0;
}
// 본문에서 검색어를 쓴 정도: 붙인 그대로 · 단어별 중 큰 쪽 (네이버는 단어를 따로 써도 찾아 줌)
export const kwUse = (p: Pick<PostStats, 'kwCount' | 'kwWords'>) => Math.max(p.kwCount, p.kwWords ?? 0);
export function statsOf(raw: { url: string; title: string; text: string; images: number; videos: number; date: string | null }, keyword: string): PostStats {
  return { url: raw.url, title: raw.title, chars: nospace(raw.text).length, images: raw.images, videos: raw.videos, publishedAt: parsePostDate(raw.date), kwInTitle: keywordInTitle(raw.title, keyword), kwCount: keywordCount(raw.text, keyword), kwWords: wordsCount(raw.text, keyword) };
}

// 글 화면의 발행일 "2026. 10. 27. 17:30" (한국 시간). "3시간 전" 같은 말은 지금 기준으로
export function parsePostDate(s: string | null | undefined, now = Date.now()): string | null {
  if (!s) return null;
  const m = s.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?\s*(\d{1,2}):(\d{2})?/) ?? s.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (m) {
    const [, y, mo, d, h = '0', mi = '0'] = m;
    return new Date(Date.UTC(+y, +mo - 1, +d, +h - 9, +mi)).toISOString();
  }
  const ago = s.match(/(\d+)\s*(분|시간)\s*전/);
  if (ago) return new Date(now - Number(ago[1]) * (ago[2] === '분' ? 60_000 : 3600_000)).toISOString();
  if (/방금/.test(s)) return new Date(now).toISOString();
  return null;
}

// 검색어 뒤 조사: 받침이 있으면 앞 것 ("신대방동 유치원"이 · 을 · 은), 없으면 뒤 것 (유치원판은 검색어가 대개 "유치원"으로 끝나 받침이 있음)
export function josa(word: string, pair: '이/가' | '을/를' | '은/는') {
  const c = (word.trim().at(-1) ?? '').charCodeAt(0) - 0xac00;
  const [has, no] = pair.split('/');
  return c >= 0 && c < 11172 && c % 28 !== 0 ? has : no;
}

const num = (s?: string) => (s != null && /^\d+$/.test(s) ? Number(s) : s != null && /</.test(s) ? 5 : null); // "< 10" 은 5로 셈
export const volumeTotal = (v?: RankVolume | null) => { const a = num(v?.pc), b = num(v?.mobile); return a == null && b == null ? null : (a ?? 0) + (b ?? 0); };
const comma = (n: number) => Math.round(n).toLocaleString('ko-KR');
const ageText = (ms: number) => (ms < 3600_000 ? `${Math.max(1, Math.round(ms / 60_000))}분` : ms < 86_400_000 ? `${Math.round(ms / 3600_000)}시간` : `${Math.floor(ms / 86_400_000)}일`);

export interface DiagnoseInput {
  keyword: string;
  now: string;
  check: RankCheck;
  ours: PostStats | null; // 우리 글을 못 읽었으면 null
  publishedAt: string | null; // RSS 또는 글 화면
  titleRank: number | null | undefined; // 제목 그대로 검색한 순위 (null = 30위 안에 없음, undefined = 확인 못 함)
  volume: RankVolume | null | undefined; // undefined = 검색광고 키 없음
  totalBlogs: number | null; // 통합검색 첫 화면 블로그 글 수
  top: PostStats[]; // 블로그 탭 상위 글 (우리 블로그 글 제외)
  recent30: number | null; // 최근 30일 발행 수 (RSS)
  suggestions: Suggestion[];
}

export function diagnose(x: DiagnoseInput): Diagnosis {
  const f: Finding[] = [];
  const now = Date.parse(x.now);
  const kw = `"${x.keyword}"`;

  // ① 새 글
  const age = x.publishedAt ? now - Date.parse(x.publishedAt) : null;
  const fresh = age != null && age < NEW_POST_DAYS * 86_400_000;
  if (age == null) f.push({ id: 'new', status: 'unknown', title: '발행 시각을 확인하지 못했어요' });
  else if (fresh) f.push({ id: 'new', status: 'warn', title: `발행한 지 ${ageText(age)}밖에 안 됐어요`, detail: '새 글은 처음 며칠 동안 순위가 오르내리며 자리를 잡아요.', todo: `발행 후 ${NEW_POST_DAYS}일이 지나서 다시 확인해 보세요. 그 전에는 글을 고치지 않는 게 좋아요.` });
  else f.push({ id: 'new', status: 'ok', title: `발행한 지 ${ageText(age)} 지났어요` });

  // ② 누락 (제목 그대로 검색)
  if (x.titleRank === undefined) f.push({ id: 'indexed', status: 'unknown', title: '제목 검색을 확인하지 못했어요' });
  else if (x.titleRank != null) f.push({ id: 'indexed', status: 'ok', title: `제목 그대로 검색하면 ${x.titleRank}위로 나와요`, detail: '네이버 검색에는 잘 들어가 있어요. 이 검색어에서 밀리는 이유는 아래 항목을 보세요.' });
  else if (fresh) f.push({ id: 'indexed', status: 'info', title: '제목으로 검색해도 아직 안 나와요', detail: '새 글은 검색에 들어가기까지 하루쯤 걸리기도 해요.', todo: '하루 뒤 다시 확인해 보세요. 그래도 안 나오면 누락일 수 있어요.' });
  else f.push({ id: 'indexed', status: 'warn', title: '제목 그대로 검색해도 안 나와요 (누락 의심)', detail: '검색 결과에서 빠진 글일 수 있어요. 발행 뒤 여러 번 고쳤거나, 같은 글 · 사진을 다른 곳에도 올렸거나, 외부 링크가 많으면 생기기도 해요.', todo: '네이버 검색에서 빠진 글일 수 있어요. 같은 내용을 다른 곳에 올렸는지 확인하고, 계속 안 나오면 네이버 고객센터 [검색 누락 문의]를 이용해 보세요.' });

  // ③ 우리 다른 글
  if (x.check.blogRank == null && x.check.otherRank != null) f.push({ id: 'cannibal', status: 'warn', title: `이 검색어로는 우리 다른 글이 ${x.check.otherRank}위에 나와요`, detail: '같은 검색어로 쓴 글이 여러 개면 네이버는 보통 한 글만 보여줘요.', todo: `${kw}${josa(x.keyword, '은/는')} 예전 글이 맡고 있어요. 새 글은 다른 검색어(아래 추천)로 잡아 보세요.` });

  // ④ 검색어 위치 · 횟수
  const o = x.ours;
  if (!o) f.push({ id: 'title', status: 'unknown', title: '우리 글 내용을 읽지 못했어요', detail: '비공개 글이거나 잠시 열리지 않았어요.' });
  else {
    if (o.kwInTitle === 'front') f.push({ id: 'title', status: 'ok', title: `제목 앞쪽에 ${kw}${josa(x.keyword, '이/가')} 있어요` });
    else if (o.kwInTitle === 'back') f.push({ id: 'title', status: 'info', title: `제목 뒤쪽에 ${kw}${josa(x.keyword, '이/가')} 있어요`, todo: `다음 글은 ${kw}${josa(x.keyword, '을/를')} 제목 앞쪽에 넣어 보세요.` });
    else if (o.kwInTitle === 'words') f.push({ id: 'title', status: 'info', title: `제목에 ${kw}의 단어가 떨어져 있어요`, detail: `제목: ${o.title}`, todo: `제목에 ${kw}${josa(x.keyword, '을/를')} 붙여서 그대로 넣어 보세요.` });
    else f.push({ id: 'title', status: 'warn', title: `제목에 ${kw}${josa(x.keyword, '이/가')} 없어요`, detail: `제목: ${o.title}`, todo: `제목 앞쪽에 ${kw}${josa(x.keyword, '을/를')} 넣어 보세요. (이미 발행한 글은 여러 번 고치지 말고 한 번만)` });
    const use = kwUse(o), words = x.keyword.trim().includes(' ') && o.kwWords !== o.kwCount ? ` (단어별로는 ${o.kwWords}번)` : '';
    if (use <= KW_FEW) f.push({ id: 'body', status: 'warn', title: `본문에 ${kw}${josa(x.keyword, '이/가')} ${o.kwCount}번만 나와요${words}`, todo: `본문에 ${kw}${josa(x.keyword, '을/를')} 자연스럽게 ${KW_GOOD[0]}~${KW_GOOD[1]}번 넣어 보세요.` });
    else if (o.kwCount > KW_MANY) f.push({ id: 'body', status: 'warn', title: `본문에 ${kw}${josa(x.keyword, '이/가')} ${o.kwCount}번이나 나와요`, detail: '같은 검색어를 너무 많이 반복하면 오히려 불리할 수 있어요.', todo: `본문의 ${kw}${josa(x.keyword, '을/를')} ${KW_GOOD[1]}번 안쪽으로 줄여 보세요.` });
    else f.push({ id: 'body', status: 'ok', title: `본문에 ${kw}${josa(x.keyword, '이/가')} ${o.kwCount}번 나와요${words}` });
  }

  // ⑦ 상위 글 비교
  let avg: Diagnosis['avg'] = null;
  if (x.top.length) {
    avg = { chars: x.top.reduce((s, t) => s + t.chars, 0) / x.top.length, images: x.top.reduce((s, t) => s + t.images, 0) / x.top.length };
    const head = `상위 ${x.top.length}개 글은 평균 ${comma(avg.chars)}자 · 사진 ${comma(avg.images)}장`;
    if (o) {
      const short = o.chars < avg.chars * TOP_RATIO, few = o.images < avg.images * TOP_RATIO;
      const ours = `우리 글은 ${comma(o.chars)}자 · 사진 ${o.images}장`;
      if (short || few) f.push({ id: 'compare', status: 'warn', title: `상위 글보다 ${short && few ? '글이 짧고 사진이 적어요' : short ? '글이 짧아요' : '사진이 적어요'}`, detail: `${head}, ${ours}이에요.`, todo: `이 검색어의 상위 글은 평균 ${comma(avg.chars)}자 · 사진 ${comma(avg.images)}장이에요. 다음 글은 ${short ? '실제 놀이 · 활동 이야기를 더 써서 ' : ''}${few ? '직접 찍은 사진(아이 얼굴은 가려서)을 더 넣어 ' : ''}비슷하게 맞춰 보세요.` });
      else f.push({ id: 'compare', status: 'ok', title: '글 길이 · 사진 수는 상위 글만큼 돼요', detail: `${head}, ${ours}이에요.` });
    } else f.push({ id: 'compare', status: 'info', title: head });
    const titled = x.top.filter((t) => t.kwInTitle === 'front' || t.kwInTitle === 'back').length;
    if (titled === x.top.length && o && (o.kwInTitle == null || o.kwInTitle === 'words')) f.push({ id: 'compare-title', status: 'info', title: `상위 ${x.top.length}개 글은 모두 제목에 ${kw}${josa(x.keyword, '이/가')} 있어요` });
  } else f.push({ id: 'compare', status: 'unknown', title: '상위 글을 읽지 못했어요' });

  // ⑤ 검색어 경쟁
  const vt = volumeTotal(x.volume);
  if (x.volume === undefined) f.push({ id: 'volume', status: 'unknown', title: '검색량을 확인하지 못했어요', detail: '설정에서 네이버 검색광고 키를 넣으면 검색량 · 경쟁도도 같이 봐요.' });
  else if (x.volume === null || vt == null) f.push({ id: 'volume', status: 'info', title: '검색광고 자료에 없는 검색어예요', detail: '찾는 사람이 아주 적은 검색어일 수 있어요.' });
  else if (vt < 30) f.push({ id: 'volume', status: 'info', title: `한 달에 ${comma(vt)}번쯤 검색되는 작은 검색어예요`, detail: '순위가 높아도 들어오는 사람은 적어요.' });
  else if (x.volume.competition === '높음') f.push({ id: 'volume', status: 'warn', title: `한 달 ${comma(vt)}번 검색 · 경쟁이 센 검색어예요`, detail: '오래된 블로그 · 큰 업체 글이 위를 차지하기 쉬워요.', todo: `학부모님이 실제로 찾는 더 좁은 검색어(동네 · 아파트 이름이나 운동회 · 재롱잔치 같은 행사 이름을 붙인 것, 예: ○○동 ${APP.term})로 먼저 상위에 올라 보세요. 아래 추천을 참고하세요.` });
  else f.push({ id: 'volume', status: 'ok', title: `한 달 ${comma(vt)}번 검색 · 경쟁 ${x.volume.competition ?? '정보 없음'}` });

  // ⑥ 통합검색 블로그 자리
  if (x.totalBlogs != null && x.check.totalRank == null) {
    if (x.totalBlogs <= 2) f.push({ id: 'serp', status: 'info', title: `통합검색 첫 화면에 블로그 글이 ${x.totalBlogs}개뿐이에요`, detail: '이 검색어는 지도 · 플레이스 같은 다른 칸이 먼저 나와요.', todo: '이 검색어는 블로그보다 네이버 플레이스(지도) 관리가 더 효과적일 수 있어요.' });
    else f.push({ id: 'serp', status: 'info', title: `통합검색 첫 화면에 블로그 글이 ${x.totalBlogs}개 나와요`, detail: '블로그 탭 순위가 오르면 통합검색에도 나올 수 있어요.' });
  }

  // ⑧ 블로그 활동
  if (x.recent30 == null) f.push({ id: 'active', status: 'unknown', title: '최근 발행 수를 확인하지 못했어요' });
  else if (x.recent30 >= ACTIVE_30D_OK) f.push({ id: 'active', status: 'ok', title: `최근 30일 동안 글을 ${x.recent30}개 썼어요` });
  else if (x.recent30 <= ACTIVE_30D_LOW) f.push({ id: 'active', status: 'warn', title: `최근 30일 동안 글이 ${x.recent30}개뿐이에요`, detail: '꾸준히 쓰는 블로그가 유리한 편이에요.', todo: '일주일에 2~3개씩 꾸준히 올려 보세요.' });
  else f.push({ id: 'active', status: 'info', title: `최근 30일 동안 글을 ${x.recent30}개 썼어요`, detail: `일주일 1개 이상(30일 ${ACTIVE_30D_OK}개 이상)을 권해요.` });

  // 할 일: 새 글이면 기다리기가 먼저 (그 밖의 손질은 3일 뒤 결과를 보고)
  const todos = fresh ? [f.find((y) => y.id === 'new')!.todo!, ...f.filter((y) => y.id === 'indexed' && y.todo).map((y) => y.todo!)]
    : f.filter((y) => y.todo && y.status === 'warn').map((y) => y.todo!).concat(f.filter((y) => y.todo && y.status === 'info').map((y) => y.todo!));
  return { keyword: x.keyword, createdAt: x.now, findings: f, todos: [...new Set(todos)].slice(0, 3), ours: o, top: x.top, avg, suggestions: x.suggestions };
}

// 좁은 검색어 추천: 검색광고 연관 검색어 중 원래 단어를 품고, 검색량이 원래보다 적고(30% 이하) 너무 작지 않으며(30 이상), 경쟁이 "높음"이 아닌 것
// 유치원판: 우리와 맞지 않는 키워드(어린이집 · 영어유치원 · 다른 유치원 이름 · 원장님 쪽 말 — keywords.ts foreignKeyword)는 부르는 쪽이 넘긴 foreign 으로 뺌
// 없으면 유치원 정보의 동네 · 주변 아파트 이름에 "유치원"을 붙인 것 (학부모님이 "동네 + 유치원"으로 찾음, 검색량 없이)
// 학교 이름은 붙이지 않음 ("○○초 유치원"은 그 학교 병설유치원, 곧 다른 유치원으로 읽힘)
const PLACE_END = /(동|구|시|군|읍|면|리|역|아파트|마을|단지|타운|자이|푸르지오|래미안|힐스테이트|e편한세상)$/;
const KINDER_TAIL = new RegExp(`^(국공립|공립|단설|병설|사립)?${APP.term}$`);
export function suggestKeywords(keyword: string, related: { keyword: string; pc?: string; mobile?: string; competition?: string }[], places: string[], have: string[] = [], foreign: (k: string) => boolean = () => false): Suggestion[] {
  const base = volumeTotal(related.find((r) => nospace(r.keyword) === nospace(keyword)));
  const words = keyword.split(/\s+/).map(nospace).filter(Boolean);
  const skip = new Set([keyword, ...have].map(nospace));
  const out: Suggestion[] = [];
  const picked = related
    .filter((r) => !skip.has(nospace(r.keyword)) && words.some((w) => w.length >= 2 && nospace(r.keyword).includes(w)) && r.competition !== '높음' && !foreign(r.keyword))
    .map((r) => ({ r, v: volumeTotal(r) }))
    .filter(({ v }) => v != null && v >= 30 && (base == null || v <= base * 0.3))
    .sort((a, b) => b.v! - a.v!);
  for (const { r, v } of picked.slice(0, 3)) { out.push({ keyword: r.keyword, volume: `${comma(v!)}회`, why: `경쟁 ${r.competition ?? '정보 없음'} · 더 좁은 검색어` }); skip.add(nospace(r.keyword)); }
  const tail = words.find((w) => KINDER_TAIL.test(w)) ?? APP.term;
  for (const p of places) {
    if (out.length >= 3) break;
    const name = p.replace(/\s+/g, ' ').trim();
    if (!PLACE_END.test(name) || /지역$/.test(name) || name.length < 2) continue; // "지역" 같은 빈 이름은 거름 (역으로 끝나도)
    const k = `${name} ${tail}`;
    if (skip.has(nospace(k))) continue;
    out.push({ keyword: k, why: '우리 동네 이름을 붙인 검색어' }); skip.add(nospace(k));
  }
  return out;
}
