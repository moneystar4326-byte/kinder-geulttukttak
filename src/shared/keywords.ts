// 한 줄로 바로 쓰기: 메모에서 주제 낱말을 뽑아 네이버 검색량으로 키워드 자동 고르기
// 검색량은 원문 문자열("< 10" 포함)이라 고를 때만 숫자로 어림 ("< 10" → 5). 화면 · 저장은 원문 그대로
import type { DojoProfile, KeywordRow } from './types';
import { APP } from './daycare';

// 어린이집 글에 자주 나오는 주제 낱말 (메모에 있으면 조회 · 고르기에 씀)
// 행사 낱말도 같이 (태권 글뚝딱 2026-10-18: 행사 낱말이 없어 행사 글에 엉뚱한 키워드가 붙던 문제)
const EVENT_TERMS = ['생일잔치', '생일파티', '재롱잔치', '운동회', '발표회', '공개수업', '부모참여수업', '견학', '소풍', '나들이', '현장학습', '졸업식', '수료식', '입학식', '김장', '할로윈', '핼러윈', '크리스마스', '행사', '공연'];
const TOPIC_TERMS = ['적응기간', '적응', '낮잠', '배변훈련', '배변', '편식', '분리불안', '숲체험', '바깥놀이', '오감놀이', '촉감놀이', '미술놀이', '물놀이', '누리과정', '연장보육', '영아', '유아', '입소', '대기', '등원', '하원', '급식', '간식', '말하기', '감기', ...EVENT_TERMS];
const T = APP.term; // 어린이집

export function topicTerms(memo: string) {
  const t = memo.replace(/\s/g, '');
  const found = TOPIC_TERMS.filter((w) => t.includes(w));
  // "승급심사"가 있으면 "심사"는 겹치므로 뺌
  return found.filter((w) => !found.some((o) => o !== w && o.includes(w)));
}

// 지역 이름: "서울 동작구 신대방동" → ["신대방동", "신대방", "동작구", "동작"]
export function regionWords(region: string) {
  const parts = region.trim().split(/\s+/).slice(1).reverse();
  return [...new Set(parts.flatMap((p) => [p, p.replace(/(동|구|시|읍|면)$/, '')]).filter((p) => p.length >= 2))];
}

// 조회에 보낼 힌트 (네이버는 띄어쓰기 없이 최대 5개)
export function hintWords(memo: string, region: string) {
  const r = regionWords(region)[0];
  const terms = topicTerms(memo);
  // 행사 낱말은 "어린이집생일잔치"처럼 학부모가 찾는 꼴도 같이 조회
  const ev = terms.filter((t) => EVENT_TERMS.includes(t)).map((t) => `어린이집${t}`);
  return [...new Set([T, ...(r ? [`${r}${T}`] : []), ...terms.map((t) => (t.length <= 2 ? `${T}${t}` : t)), ...ev])].slice(0, 5);
}

const num = (v?: string) => (v == null ? 0 : /^\d+$/.test(v) ? Number(v) : /<\s*10/.test(v) ? 5 : 0);
export const volumeOf = (r: KeywordRow) => num(r.pc) + num(r.mobile);

// 시설 유형 낱말 (어린이집 정보의 유형 → 키워드에 들어가도 되는 낱말)
// 2026-10-27 실제 조회: 민간인 요요유치원에 "가정어린이집" · "유치원소풍"이 보조 키워드로 골라짐 → 사실과 다른 키워드
const TYPE_WORDS: Record<string, string[]> = {
  국공립: ['국공립', '국립', '공립', '구립', '시립', '군립'],
  사회복지법인: ['사회복지법인', '법인'],
  '법인 · 단체 등': ['법인', '단체'],
  민간: ['민간'],
  가정: ['가정'],
  협동: ['협동', '부모협동'],
  직장: ['직장'],
};
// 어린이집이 아닌 기관 (언제나 뺌)
const OTHER_PLACE = /유치원|놀이학교|영어유|어학원|학원/;
// 학부모가 아니라 원장 · 창업자 · 교사가 찾는 말 (2026-10-27 실제 조회: 낙엽 놀이 글에 "어린이집매매"가 보조로)
const NOT_PARENT = /매매|매물|임대|컨설팅|개원|창업|인수|양도|권리금|구인|채용|교사모집|자격증|급여|원장/;

// 우리 어린이집과 맞지 않는 키워드인지: 유치원 · 학원, 원장 · 창업자 쪽 말(매매 · 임대 · 채용), 다른 유형(가정어린이집 — "어린이집가정통신문"처럼 뒤에 오는 건 괜찮음), "○○어린이집"의 ○○이 우리 동네 · 주변 아파트 · 우리 유형 · 주제 낱말이 아님(다른 동네 · 다른 어린이집 이름)
export function foreignKeyword(keyword: string, region: string, profile?: Pick<DojoProfile, 'facilityType' | 'nearbyAreas'> | null) {
  const k = keyword.replace(/\s/g, '');
  if (OTHER_PLACE.test(k) || NOT_PARENT.test(k)) return true;
  const own = TYPE_WORDS[profile?.facilityType ?? ''] ?? [];
  const at = k.indexOf(T);
  if (at <= 0) return false;
  // "○○어린이집"의 ○○에서 아는 낱말을 지워 보고 남는 게 있으면 남의 이름
  const apts = (profile?.nearbyAreas ?? []).flatMap((a) => [a.name, a.name.replace(/아파트$/, '')]).map((n) => n.replace(/\s/g, '')).filter((n) => n.length >= 2);
  const known = [...regionWords(region), ...apts, ...own, ...TOPIC_TERMS].sort((a, b) => b.length - a.length);
  let rest = k.slice(0, at);
  for (const w of known) rest = rest.split(w).join('');
  return rest.length > 0;
}

// 고르기: 우리와 맞지 않는 키워드(foreignKeyword)를 먼저 빼고, 주제 낱말(없으면 "어린이집")이 들어간 키워드만 → 주요 = 주제 낱말이 든 것 중 검색량 최대,
// 보조 = 지역 · 주변 아파트 이름이 든 것 1개 + 다른 키워드 1개. 관련 없는 건 낱말 조건에서 빠짐
export function pickKeywords(rows: KeywordRow[], memo: string, region: string, profile?: Pick<DojoProfile, 'facilityType' | 'nearbyAreas'> | null) {
  if (!rows.length) return { main: '', subs: [] as string[] }; // 조회 실패 → 화면에서 주제로 대신
  const terms = topicTerms(memo);
  const apts = (profile?.nearbyAreas ?? []).flatMap((a) => [a.name, a.name.replace(/아파트$/, '')]).map((n) => n.replace(/\s/g, '')).filter((n) => n.length >= 2);
  const regs = [...regionWords(region), ...apts];
  const has = (k: string, ws: string[]) => ws.some((w) => k.replace(/\s/g, '').includes(w));
  const related = rows.filter((r) => has(r.keyword, terms.length ? [...terms, T] : [T]) && !foreignKeyword(r.keyword, region, profile));
  const byVol = [...related].sort((a, b) => volumeOf(b) - volumeOf(a));
  // 2026-10-18 실사용: "1박2일"(예능 이름, 월 10만)이 "태권도합숙"(월 250)을 이겨 주요가 됨 → 주제 낱말 키워드 중에서도
  // 어린이집 · 아이 쪽 말이 든 것만 고름. 넓은 말(1박2일 · 레크레이션강사)은 학부모 검색이 아님
  const kid = (k: string) => /어린이집|어린이|아이|유아|영아|아기|육아|키즈/.test(k);
  const topical = terms.length ? byVol.filter((r) => has(r.keyword, terms) && kid(r.keyword)) : byVol;
  // 너무 넓은 "어린이집" 하나보다 주제가 드러나는 키워드를 주요로 (주제 낱말이 있을 때)
  // 주제 낱말이 있는데 맞는 검색어가 없으면 검색량 큰 엉뚱한 것 대신 "어린이집 낮잠"처럼 주제 그대로
  const main = (topical.find((r) => volumeOf(r) >= 10) ?? topical[0])?.keyword ?? (terms.length ? `${T} ${terms[0]}` : byVol[0]?.keyword ?? '');
  const subs: string[] = [];
  const local = byVol.find((r) => r.keyword !== main && has(r.keyword, regs) && volumeOf(r) > 0);
  if (local) subs.push(local.keyword);
  // 둘째 보조도 주제 낱말이 들어간 것만 (없으면 넣지 않음 — 억지 키워드 금지)
  // 메모에 주제 낱말이 없으면 둘째 보조는 비움 (2026-10-27 실제 조회: 낙엽 놀이 글에 "가정어린이집" → 빼니 "어린이집매매" → "어린이집매물"…
  // 주제와 상관없는 "어린이집○○"는 끝없이 나옴. 주제를 모르면 고르지 않는 게 맞음)
  const other = terms.length ? topical.find((r) => r.keyword !== main && !subs.includes(r.keyword) && volumeOf(r) >= 10) : undefined;
  if (other) subs.push(other.keyword);
  return { main, subs: subs.slice(0, 2) };
}
