// 입력 검사 · 결과 점검 (AI 없이 코드로 하는 것)
import type { ArticleDoc, ArticleInput, DojoProfile, ReviewFlag } from './types';
import { bodyText, countDoc, minCharsFor } from './count';
import { uncheckedMentions } from './strengths';

// 생성 전에 빠진 재료 (빠지면 먼저 보완 요청)
export function missingInputs(input: ArticleInput): string[] {
  const miss: string[] = [];
  const f = input.facts;
  if (!input.topic.trim()) miss.push('주제');
  // 주요 키워드는 비워도 됨 (주제를 씀 — withKeywordFallback)
  if (input.subKeywords.length > 2) miss.push('보조 키워드는 2개까지');
  if (input.kind === '수업 후기' && !f.activities.trim()) miss.push('진행 활동');
  // 한 줄 메모(진행 활동)가 있으면 행사 · 모집 칸은 비어도 됨 — 메모에 있는 것만 쓰고 없는 건 "도장으로 문의" (2026-10-18)
  if (input.kind === '행사 안내' && !f.activities.trim()) {
    const e = f.event;
    if (!e?.when.trim()) miss.push('행사 일시');
    if (!e?.where.trim()) miss.push('행사 장소');
    if (!e?.who.trim()) miss.push('행사 대상');
    if (!e?.apply.trim()) miss.push('신청 방법');
  }
  if (input.kind === '모집 안내' && !f.activities.trim() && !f.recruit?.who.trim()) miss.push('모집 대상');
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
  return `목표 지역(${input.region})이 도장 소재지(${profile.region})와 달라요. 글에는 "${input.region}에 있다"고 쓰지 않고, 가까운 곳이라는 사실만 써요.`;
}

// 보장 · 과장 표현 (기획서 6.1)
const BANNED: [RegExp, string][] = [
  [/상위\s*노출|검색\s*1위|순위\s*보장/, '검색 순위를 보장하는 표현'],
  [/보장(합니다|해요|드립니다|됩니다)/, '결과를 보장하는 표현'],
  [/무조건|100\s*%|반드시\s*(좋아|나아|향상)/, '단정 · 과장 표현'],
  [/(키가|성장판|면역력|ADHD|집중력이\s*좋아)/, '건강 · 의학 효과로 읽힐 수 있는 표현'],
  [/(최고의|최고|국내\s*1위|넘버원|No\.?\s*1)/i, '최상급 홍보 표현'],
];

export function localFlags(doc: ArticleDoc, profile: DojoProfile, input?: ArticleInput): ReviewFlag[] {
  const flags: ReviewFlag[] = [];
  const counts = countDoc(doc);
  const min = minCharsFor(input?.kind);
  if (counts.withoutSpaces < min) flags.push({ code: 'too-short', message: `본문이 공백 제외 ${counts.withoutSpaces}자예요 (최소 ${min.toLocaleString()}자).` });
  const avoid = profile.avoidWords.split(',').map((s) => s.trim()).filter(Boolean);
  for (const s of doc.sections) {
    const text = [s.heading ?? '', ...s.paragraphs].join('\n');
    for (const [re, label] of BANNED) if (re.test(text)) flags.push({ code: 'banned', message: `${label}: "${text.match(re)![0]}"`, sectionId: s.id });
    for (const w of avoid) if (text.includes(w)) flags.push({ code: 'avoid-word', message: `피할 표현 "${w}"이 있어요`, sectionId: s.id });
  }
  for (const m of uncheckedMentions(bodyText(doc), profile)) flags.push({ code: 'unchecked-service', message: m });
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
const KEYWORD_TAILS = ['태권도장', '태권도', '체육관', '줄넘기', '품새', '학원', '운동'];

// 검색어 → 본문에 쓸 띄어 쓴 꼴 ("신대방동태권도" → "신대방동 태권도", 이미 띄어 썼으면 그대로)
export function spacedKeyword(kw: string) {
  const k = kw.trim();
  if (/\s/.test(k)) return k;
  for (const t of KEYWORD_TAILS) {
    if (k.length > t.length && k.endsWith(t)) return `${k.slice(0, -t.length)} ${t}`;
  }
  return k;
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
