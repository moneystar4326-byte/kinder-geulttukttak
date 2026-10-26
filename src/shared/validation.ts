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
  // ADHD · 면역력은 위 BANNED 에 이미 있어 넣지 않음 (같은 말에 경고 두 번)
  [/발달\s*(지연|장애)|자폐|장애가\s*있|느린\s*아이|문제\s*행동/, '진단 · 평가로 읽힐 수 있는 표현'],
  [/(언어|두뇌|인지|신체)\s*발달(이|을)?\s*(빨라|좋아|향상|쑥쑥)|지능(이|을)?\s*(높|향상)/, '발달 · 건강 효과를 보장하는 표현'],
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
    const body = bodyText(doc);
    for (const a of unknownAmounts(body, factsText(input, profile))) flags.push({ code: 'fee', message: `사실 칸에 없는 금액 "${a}"이 글에 있어요. 보육료 · 필요경비는 적어 준 그대로만 써요.` });
    for (const n of childNames(memoText(input))) if (body.includes(n)) flags.push({ code: 'child-name', message: `메모에 있던 이름 "${n}"이 글에 있어요. 아이 이름이면 "한 친구"로 바꿔 주세요.` });
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
  ? ['국공립어린이집', '가정어린이집', '민간어린이집', '직장어린이집', '어린이집', '유치원'] // "놀이"는 넣지 않음 (물놀이 → 물 놀이)
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

// 이번 글 재료(주제 · 메모 · 칸)만 — 아이 이름은 여기서만 찾음 (어린이집 정보의 "자체 조리 급식이"까지 보지 않게)
export function memoText(input: ArticleInput) {
  const f = input.facts;
  return [input.topic, f.activities, f.coachingPoints, f.scenes, f.extra, f.photoNotes,
    ...Object.values(f.event ?? {}), ...Object.values(f.recruit ?? {}), ...Object.values(f.growth ?? {})].join('\n');
}

// 재료가 주제 한 줄뿐인지 (주제를 뺀 활동 · 장면 · 도운 점 · 성장 · 행사 · 입소 · 추가 안내 칸이 거의 비었음)
// 이러면 글에 "무엇을 했는지" 같은 구체 답이 없어 카드 제목을 질문으로 쓰지 않음 (2026-10-27 요요유치원 시험)
export function thinFacts(input: ArticleInput) {
  const f = input.facts;
  const own = [f.activities, f.coachingPoints, f.scenes, f.extra, ...Object.values(f.growth ?? {}), ...Object.values(f.event ?? {}), ...Object.values(f.recruit ?? {})].join(' ');
  const flat = (t: string) => t.replace(/[\s.,!?…]/g, '');
  return flat(own.split(input.topic.replace(/…$/, '')).join('')).length < 25;
}

// 아이 이름 찾기 (2026-10-27 버그 점검: 전에는 "낙엽이 · 기분이 · 간식이"를 이름으로 잡고 "채원이 · 지우가"는 놓침)
// 이름 꼴(이름 + 이/가/는 …)이면서 글자가 모두 흔한 이름 글자일 때만 이름으로 봄. 낙엽 · 간식처럼 이름에 잘 안 쓰는 글자가 있으면 뺌
const NAME_SYL = new Set([...'가건겸결경규근기나다단담도동라람래련령로률린민미범별보빈산상서석선설성세소솔수슬승시아안언연영예오온완용우욱운원위유윤율은의이인일재정제주준지진찬창채철초태하한해현형혜호홍화환효후훈휘희']);
// 흔한 성씨만 (어 · 은 · 기처럼 낱말 첫 글자와 겹치는 드문 성씨는 빼서 "어린이"가 이름이 되지 않게)
const SURNAME = new Set([...'김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구민진나지엄채원천방공현함변염여추도소석선설연']);
// 이름 글자로만 된 흔한 낱말
const NOT_NAME = new Set(['아이', '다시', '서로', '이제', '하나', '우유', '수영', '하원', '주제', '시소', '수유', '이유', '유아', '영아', '아기', '가지', '오이', '동시', '미소', '이미', '지원', '연주', '경기', '주인', '소원', '선수', '수업', '이미지', '아이들']);
const BATCHIM = (ch: string) => { const c = ch.charCodeAt(0) - 0xac00; return c >= 0 && c < 11172 && c % 28 !== 0; };
const nameLike = (n: string) => !NOT_NAME.has(n) && (n.length === 2 ? [...n].every((c) => NAME_SYL.has(c)) : SURNAME.has(n[0]) && [...n.slice(1)].every((c) => NAME_SYL.has(c)));
const END = '(?=[\\s.,!?~]|$)';
export function childNames(memo: string) {
  const out = new Set<string>();
  const add = (n: string, batchim: boolean | null) => { if (nameLike(n) && (batchim == null || BATCHIM(n.at(-1)!) === batchim)) out.add(n); };
  // 받침 있는 이름 + 이 (+ 조사): 민준이가 · 채원이는 · 민준이 웃었어요
  for (const m of memo.matchAll(new RegExp(`(?<![가-힣])([가-힣]{2,3})이(?:가|는|도|랑|를|와|의|만|한테|에게)?${END}`, 'g'))) add(m[1], true);
  // 받침 없는 이름 + 조사: 지우가 · 서아는
  // ("채원이가"의 "채원이"처럼 받침 있는 이름 + 이 는 위에서 잡으므로 뺌)
  for (const m of memo.matchAll(new RegExp(`(?<![가-힣])([가-힣]{2,3})(?:가|는|랑|를|도|와|의|한테|에게)${END}`, 'g'))) {
    if (!(m[1].endsWith('이') && BATCHIM(m[1].at(-2)!))) add(m[1], false);
  }
  // 받침 있는 이름 + 받침 뒤 조사: 민준은 · 채원을 · 민준과
  for (const m of memo.matchAll(new RegExp(`(?<![가-힣])([가-힣]{2,3})(?:은|을|과|이랑)${END}`, 'g'))) add(m[1], true);
  return [...out];
}

// 아이 이름 → "한 친구", 조사도 받침 없는 꼴로 ("민준이가" → "한 친구가", "민준을" → "한 친구를", "지우는" → "한 친구는")
const JOSA: Record<string, string> = { 은: '는', 을: '를', 과: '와', 으로: '로', 이랑: '랑' };
export function hideChildNames(text: string, names: string[]) {
  return names.reduce((t, n) => t
    .replace(new RegExp(`${n}이(?=가|는|도|랑|를|와|의|만|한테|에게)`, 'g'), '한 친구')
    .replace(new RegExp(`${n}이${END}`, 'g'), '한 친구가')
    .replace(new RegExp(`${n}(이랑|으로|은|을|과)`, 'g'), (_m, j: string) => `한 친구${JOSA[j]}`)
    .replace(new RegExp(n, 'g'), '한 친구'), text);
}

// 글에 나온 금액 중 사실 칸에 없는 것. 금액은 숫자로 바꿔 비교 ("3만 원" = "30,000원", "5천 원" = 5000원)
const AMOUNT = /(\d[\d,]*(?:\.\d+)?)\s*(만|천)?\s*원/g;
const won = (m: RegExpMatchArray) => Math.round(Number(m[1].replace(/,/g, '')) * (m[2] === '만' ? 10000 : m[2] === '천' ? 1000 : 1));
export function unknownAmounts(text: string, facts: string) {
  const known = new Set([...facts.matchAll(AMOUNT)].map(won));
  return [...new Set([...text.matchAll(AMOUNT)].filter((m) => !known.has(won(m))).map((m) => m[0].trim()))];
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
