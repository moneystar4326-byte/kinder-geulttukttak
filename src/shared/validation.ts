// 입력 검사 · 결과 점검 (AI 없이 코드로 하는 것)
import type { ArticleDoc, ArticleInput, DojoProfile, ReviewFlag } from './types';
import { bodyText, countDoc, minCharsFor } from './count';
import { uncheckedMentions } from './strengths';
import { IND, isDaycare } from './industry';

// 생성 전에 빠진 재료 (빠지면 먼저 보완 요청)
export function missingInputs(input: ArticleInput): string[] {
  const miss: string[] = [];
  const f = input.facts;
  if (!input.topic.trim()) miss.push('주제');
  // 주요 키워드는 비워도 됨 (주제를 씀 — withKeywordFallback)
  if (input.subKeywords.length > 2) miss.push('보조 키워드는 2개까지');
  if (input.kind === '수업 후기' && !f.activities.trim()) miss.push(isDaycare ? '한 놀이 · 활동' : '진행 활동');
  // 한 줄 메모(진행 활동)가 있으면 행사 · 모집 칸은 비어도 됨 — 메모에 있는 것만 쓰고 없는 건 "도장으로 문의" (2026-10-18)
  if (input.kind === '행사 안내' && !f.activities.trim()) {
    const e = f.event;
    if (!e?.when.trim()) miss.push('행사 일시');
    if (!e?.where.trim()) miss.push('행사 장소');
    if (!e?.who.trim()) miss.push('행사 대상');
    if (!e?.apply.trim()) miss.push('신청 방법');
  }
  if (input.kind === '모집 안내' && !f.activities.trim() && !f.recruit?.who.trim()) miss.push(isDaycare ? '입소 대상' : '모집 대상');
  if (input.kind === '성장 이야기') {
    if (!f.growth?.before.trim()) miss.push('이전 모습');
    if (!f.growth?.now.trim()) miss.push('현재 관찰');
  }
  return miss;
}

// 키워드를 고르지 않았으면 주제를 주요 키워드로
export function withKeywordFallback(input: ArticleInput): ArticleInput {
  return input.mainKeyword.trim() ? input : { ...input, mainKeyword: input.topic.trim() };
}

// 목표 지역이 도장 소재지와 다르면 확인 안내 (그 지역에 있다고 쓰지 않게)
export function regionWarning(input: ArticleInput, profile: DojoProfile): string | null {
  const a = input.region.replace(/\s/g, ''), b = profile.region.replace(/\s/g, '');
  if (!a || !b) return null;
  if (a.includes(b) || b.includes(a)) return null;
  return `목표 지역(${input.region})이 ${IND.place} 소재지(${profile.region})와 달라요. 글에는 "${input.region}에 있다"고 쓰지 않고, 가까운 곳이라는 사실만 써요.`;
}

// 보장 · 과장 표현 (기획서 6.1)
const BANNED: [RegExp, string][] = [
  [/상위\s*노출|검색\s*1위|순위\s*보장/, '검색 순위를 보장하는 표현'],
  [/보장(합니다|해요|드립니다|됩니다)/, '결과를 보장하는 표현'],
  [/무조건|100\s*%|반드시\s*(좋아|나아|향상)/, '단정 · 과장 표현'],
  [/(키가|성장판|면역력|ADHD|집중력이\s*좋아)/, '건강 · 의학 효과로 읽힐 수 있는 표현'],
  [/(최고의|최고|국내\s*1위|넘버원|No\.?\s*1)/i, '최상급 홍보 표현'],
];
// 어린이집 (기획안 v0.2 6 · 10장): 입소 약속 · 진단 · 발달 효과
const DAYCARE_BANNED: [RegExp, string][] = [
  [/입소\s*(보장|확정|약속)|(바로|즉시|대기\s*없이)\s*입소|대기\s*없(이|어요|습니다)/, '입소를 약속하는 표현'],
  [/발달\s*(지연|장애)|자폐|ADHD|장애가\s*있|느린\s*아이|문제\s*행동/, '진단 · 평가로 읽힐 수 있는 표현'],
  [/(언어|두뇌|인지|신체)\s*발달(이|을)?\s*(빨라|좋아|향상|쑥쑥)|지능(이|을)?\s*(높|향상)|면역력/, '발달 · 건강 효과를 보장하는 표현'],
];

export function localFlags(doc: ArticleDoc, profile: DojoProfile, input?: ArticleInput): ReviewFlag[] {
  const flags: ReviewFlag[] = [];
  const counts = countDoc(doc);
  const min = minCharsFor(input?.kind);
  if (counts.withoutSpaces < min) flags.push({ code: 'too-short', message: `본문이 공백 제외 ${counts.withoutSpaces}자예요 (최소 ${min.toLocaleString()}자).` });
  const avoid = profile.avoidWords.split(',').map((s) => s.trim()).filter(Boolean);
  for (const s of doc.sections) {
    const text = [s.heading ?? '', ...s.paragraphs].join('\n');
    for (const [re, label] of isDaycare ? [...BANNED, ...DAYCARE_BANNED] : BANNED) if (re.test(text)) flags.push({ code: 'banned', message: `${label}: "${text.match(re)![0]}"`, sectionId: s.id });
    for (const w of avoid) if (text.includes(w)) flags.push({ code: 'avoid-word', message: `피할 표현 "${w}"이 있어요`, sectionId: s.id });
  }
  for (const m of uncheckedMentions(bodyText(doc), profile)) flags.push({ code: 'unchecked-service', message: m });
  if (isDaycare && input) {
    const facts = factsText(input, profile);
    for (const a of unknownAmounts(bodyText(doc), facts)) flags.push({ code: 'fee', message: `사실 칸에 없는 금액 "${a}"이 글에 있어요. 보육료 · 필요경비는 적어 준 그대로만 써요.` });
    for (const n of childNames(facts)) if (bodyText(doc).includes(n)) flags.push({ code: 'child-name', message: `메모에 있던 이름 "${n}"이 글에 있어요. 아이 이름이면 "한 친구"로 바꿔 주세요.` });
  }
  // 같은 문장 반복
  const sentences = bodyText(doc).split(/(?<=[.!?。])\s+/).map((x) => x.trim()).filter((x) => x.length > 15);
  const seen = new Set<string>();
  for (const x of sentences) {
    if (seen.has(x)) { flags.push({ code: 'repeat', message: `같은 문장이 반복돼요: "${x.slice(0, 30)}…"` }); break; }
    seen.add(x);
  }
  // 키워드 과다 반복은 순위 공식이 아니라 읽기 불편 → 안내만 (띄어 쓴 꼴도 같이 셈)
  if (input?.mainKeyword) {
    const n = keywordCount(bodyText(doc), input.mainKeyword);
    if (n > KEYWORD_MAX) flags.push({ code: 'keyword-heavy', message: `주요 키워드가 ${n}번 나와요. 읽기 어색하지 않은지 확인해 주세요.` });
  }
  return flags;
}

export const KEYWORD_MAX = 6;
const KEYWORD_TAILS = isDaycare
  ? ['국공립어린이집', '가정어린이집', '민간어린이집', '직장어린이집', '어린이집', '유치원', '숲체험', '놀이']
  : ['태권도장', '태권도', '체육관', '줄넘기', '품새', '학원', '운동'];

// 검색어 → 본문에 쓸 띄어 쓴 꼴 ("신대방동태권도" → "신대방동 태권도", 이미 띄어 썼으면 그대로)
export function spacedKeyword(kw: string) {
  const k = kw.trim();
  if (/\s/.test(k)) return k;
  for (const t of KEYWORD_TAILS) {
    if (k.length > t.length && k.endsWith(t)) return `${k.slice(0, -t.length)} ${t}`;
  }
  return k;
}

// ---------- 어린이집: 아이 이름 · 금액 (코드 점검, 2026-10-27) ----------
// 원장님 · 선생님이 적은 재료(메모 · 칸)와 어린이집 정보를 한 덩어리로 — 여기 있는 금액 · 이름만 사실로 봄
export function factsText(input: ArticleInput, profile: DojoProfile) {
  const f = input.facts;
  return [input.topic, f.activities, f.coachingPoints, f.scenes, f.values, f.extra, f.photoNotes,
    ...Object.values(f.event ?? {}), ...Object.values(f.recruit ?? {}), ...Object.values(f.growth ?? {}),
    profile.otherFacts ?? '', profile.classFeatures, profile.hours ?? '', profile.classes ?? ''].join('\n');
}

// 재료가 주제 한 줄뿐인지 (주제를 뺀 활동 · 장면 · 도운 점 · 성장 · 행사 칸이 거의 비었음)
// 이러면 글에 "무엇을 했는지" 같은 구체 답이 없어 카드 제목을 질문으로 쓰지 않음 (2026-10-27 요요유치원 시험)
export function thinFacts(input: ArticleInput) {
  const f = input.facts;
  const own = [f.activities, f.coachingPoints, f.scenes, ...Object.values(f.growth ?? {}), ...Object.values(f.event ?? {})].join(' ');
  const flat = (t: string) => t.replace(/[\s.,!?…]/g, '');
  return flat(own.split(input.topic.replace(/…$/, '')).join('')).length < 25;
}

// 메모에 "민준이가 · 서연이는"처럼 이름 + 이 + 조사로 적힌 말 (받침 있는 이름 + "이"는 아이를 부르는 꼴)
// 아이 · 놀이처럼 받침 없는 말은 걸리지 않고, 흔한 말은 따로 뺌
const NOT_NAME = new Set(['어린', '물놀', '손놀', '몸놀', '소꿉놀', '모래놀', '선생님', '원장님', '친구들', '우리', '오늘', '처음', '마음', '사람', '하늘', '바깥놀']);
const BATCHIM = (ch: string) => { const c = ch.charCodeAt(0) - 0xac00; return c >= 0 && c < 11172 && c % 28 !== 0; };
export function childNames(facts: string) {
  const out = new Set<string>();
  for (const m of facts.matchAll(/(?<![가-힣])([가-힣]{2,3})이(?:가|는|도|랑|를|와|의|한테|에게|만|\s|[.,!?]|$)/g)) {
    const n = m[1];
    if (BATCHIM(n[n.length - 1]) && !NOT_NAME.has(n) && !/(님|들|반|팀|원|실|장|집|방|놀)$/.test(n)) out.add(n);
  }
  return [...out];
}

// 짧은 글(카드 문구)에서 이름 + 이 → "한 친구" ("민준이가 블록을" → "한 친구가 블록을")
export function hideChildNames(text: string, names: string[]) {
  return names.reduce((t, n) => t.replace(new RegExp(`${n}이?`, 'g'), '한 친구'), text);
}

// 글에 나온 금액 중 사실 칸에 없는 것 ("월 15만 원", "30,000원")
export function unknownAmounts(text: string, facts: string) {
  const norm = (a: string) => a.replace(/[\s,]/g, '');
  const known = new Set([...facts.matchAll(/\d[\d,]*\s*만?\s*원/g)].map((m) => norm(m[0])));
  return [...new Set([...text.matchAll(/\d[\d,]*\s*만?\s*원/g)].map((m) => m[0].trim()))].filter((a) => !known.has(norm(a)));
}

// 띄어쓰기와 상관없이 키워드가 나온 횟수
export function keywordCount(text: string, kw: string) {
  const chars = [...kw.replace(/\s+/g, '')];
  if (!chars.length) return 0;
  const re = new RegExp(chars.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*'), 'g');
  return (text.match(re) ?? []).length;
}

// 복사용 본문 (제목 · 태그 · 사진 안내 · 편집 지시문 없이)
export function plainBody(doc: ArticleDoc) {
  return doc.sections.map((s) => [s.heading ? s.heading : '', ...s.paragraphs].filter(Boolean).join('\n\n')).join('\n\n');
}

export function markdownBody(title: string, doc: ArticleDoc) {
  const parts = [`# ${title}`, ''];
  for (const s of doc.sections) {
    if (s.heading) parts.push(`## ${s.heading}`, '');
    for (const p of s.paragraphs) parts.push(p, '');
  }
  if (doc.tags.length) parts.push(doc.tags.map((t) => `#${t.replace(/^#/, '')}`).join(' '));
  return parts.join('\n');
}

// 파일 이름에서 Windows 금지 문자 제거
export function safeFileName(s: string, max = 60) {
  const t = s.replace(/[\\/:*?"<>|\x00-\x1F]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  const r = /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(t) ? `_${t}` : t;
  return (r || '글').slice(0, max);
}

export function maskSecret(v: string | null | undefined) {
  if (!v) return null;
  return v.length <= 8 ? '••••' : `${v.slice(0, 3)}••••${v.slice(-4)}`;
}
