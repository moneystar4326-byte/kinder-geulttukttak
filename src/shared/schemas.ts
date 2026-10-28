// AI 응답 · IPC 입력 검증 스키마
import { z } from 'zod';
import { ARTICLE_KINDS, AUDIENCES, BRIEF_PURPOSES, TONES } from './types';
import { APP } from './kinder';

export const GeneratedArticleSchema = z.object({
  titleCandidates: z.array(z.string().min(1)).length(3),
  sections: z.array(z.object({ id: z.string().min(1), heading: z.string(), paragraphs: z.array(z.string()).min(1) })).min(3),
  tags: z.array(z.string()),
  photoSuggestions: z.array(z.object({ afterSectionId: z.string(), caption: z.string() })),
  reviewFlags: z.array(z.object({ code: z.string(), message: z.string(), sectionId: z.string() })),
});

// OpenAI 구조화 출력용 JSON Schema (strict: 모든 키 required, additionalProperties false)
const str = { type: 'string' } as const;
export const GENERATED_ARTICLE_JSON = {
  type: 'object',
  additionalProperties: false,
  required: ['titleCandidates', 'sections', 'tags', 'photoSuggestions', 'reviewFlags'],
  properties: {
    titleCandidates: { type: 'array', items: str },
    sections: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['id', 'heading', 'paragraphs'],
        properties: { id: str, heading: { type: 'string', description: '소제목. 도입부처럼 소제목이 없으면 빈 문자열' }, paragraphs: { type: 'array', items: str } },
      },
    },
    tags: { type: 'array', items: str },
    photoSuggestions: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['afterSectionId', 'caption'], properties: { afterSectionId: str, caption: str } },
    },
    reviewFlags: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['code', 'message', 'sectionId'], properties: { code: str, message: str, sectionId: str } },
    },
  },
} as const;

export const ReviewSchema = z.object({
  flags: z.array(z.object({ code: z.string(), message: z.string(), sectionId: z.string() })),
});
export const REVIEW_JSON = {
  type: 'object', additionalProperties: false, required: ['flags'],
  properties: {
    flags: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['code', 'message', 'sectionId'], properties: { code: str, message: str, sectionId: str } },
    },
  },
} as const;

export const CardCopySchema = z.object({
  cards: z.array(z.object({ title: z.string().min(1), sub: z.string().min(1), scene: z.string().min(1), afterSectionId: z.string() })).length(3),
});
export const CARD_COPY_JSON = {
  type: 'object', additionalProperties: false, required: ['cards'],
  properties: {
    cards: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['title', 'sub', 'scene', 'afterSectionId'],
        properties: {
          title: { type: 'string', description: '카드 제목 10~28자' },
          sub: { type: 'string', description: '2문장 60~110자: 제목에 대한 답 + 글 속 구체 내용' },
          scene: { type: 'string', description: '배경 그림 장면 설명 (영어, 글자 없는 장면)' },
          afterSectionId: str,
        },
      },
    },
  },
} as const;

// 자세히 쓰기 검색어 확인: 주요 1 · 보조 최대 2 + 바꿀 때 보여 줄 후보, 각각 넣을 문장 예시
const planItem = { type: 'object', additionalProperties: false, required: ['keyword', 'sentence', 'why'], properties: { keyword: str, sentence: str, why: str } } as const;
export const KEYWORD_PLAN_JSON = {
  type: 'object', additionalProperties: false, required: ['main', 'subs', 'others'],
  properties: { main: planItem, subs: { type: 'array', items: planItem }, others: { type: 'array', items: planItem } },
} as const;
const PlanItemSchema = z.object({ keyword: z.string(), sentence: z.string(), why: z.string() });
export const KeywordPlanSchema = z.object({ main: PlanItemSchema, subs: z.array(PlanItemSchema), others: z.array(PlanItemSchema) });
// 자세히 쓰기 글 성격 정리 (check 가 없으면 빈 문자열)
export const BRIEF_JSON = {
  type: 'object', additionalProperties: false, required: ['purpose', 'note', 'facts', 'check', 'notes', 'exclude', 'topicGap', 'asks'],
  properties: {
    purpose: { type: 'string', enum: ['소식', '안내', '교육', '성장', '모집'] },
    note: str,
    facts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text', 'quote', 'unclear'], properties: { text: str, quote: str, unclear: { type: 'boolean' } } } },
    check: { type: 'object', additionalProperties: false, required: ['quote', 'question'], properties: { quote: str, question: str } },
    notes: { type: 'array', items: str },
    exclude: { type: 'array', items: str },
    topicGap: str,
    asks: { type: 'array', items: str },
  },
} as const;
export const BriefSchema = z.object({
  purpose: z.enum(['소식', '안내', '교육', '성장', '모집']), note: z.string(),
  facts: z.array(z.object({ text: z.string(), quote: z.string(), unclear: z.boolean() })),
  check: z.object({ quote: z.string(), question: z.string() }), notes: z.array(z.string()), exclude: z.array(z.string()), topicGap: z.string(), asks: z.array(z.string()),
});
// 지어낸 문장 검사: 고칠 문장과 고친 문장 (지울 거면 fix 빈 문자열)
export const VERIFY_JSON = {
  type: 'object', additionalProperties: false, required: ['issues'],
  properties: { issues: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['sentence', 'type', 'fix'], properties: { sentence: str, type: { type: 'string', enum: ['지어냄', '틀림', '해설', '되풀이'] }, fix: str } } } },
} as const;
export const VerifySchema = z.object({ issues: z.array(z.object({ sentence: z.string(), type: z.enum(['지어냄', '틀림', '해설', '되풀이']), fix: z.string() })) });
export const KeywordIdeasSchema = z.object({ keywords: z.array(z.string()) });
export const KEYWORD_IDEAS_JSON = {
  type: 'object', additionalProperties: false, required: ['keywords'],
  properties: { keywords: { type: 'array', items: str } },
} as const;

// 한 줄 메모 → 재료 칸 나누기 (메모에 없는 칸은 빈 문자열)
export const MEMO_FIELDS = ['activities', 'coachingPoints', 'scenes', 'values', 'extra', 'photoNotes', 'eventWhen', 'eventWhere', 'eventWho', 'eventBring', 'eventApply', 'recruitWho', 'recruitTrial', 'growthBefore', 'growthNow', 'growthProcess'] as const;
export const MemoSplitSchema = z.object({ activities: z.string(), coachingPoints: z.string(), scenes: z.string(), values: z.string(), extra: z.string(), photoNotes: z.string(), eventWhen: z.string(), eventWhere: z.string(), eventWho: z.string(), eventBring: z.string(), eventApply: z.string(), recruitWho: z.string(), recruitTrial: z.string(), growthBefore: z.string(), growthNow: z.string(), growthProcess: z.string() });
export const MEMO_SPLIT_JSON = {
  type: 'object', additionalProperties: false, required: ['activities', 'coachingPoints', 'scenes', 'values', 'extra', 'photoNotes', 'eventWhen', 'eventWhere', 'eventWho', 'eventBring', 'eventApply', 'recruitWho', 'recruitTrial', 'growthBefore', 'growthNow', 'growthProcess'],
  properties: { activities: str, coachingPoints: str, scenes: str, values: str, extra: str, photoNotes: str, eventWhen: str, eventWhere: str, eventWho: str, eventBring: str, eventApply: str, recruitWho: str, recruitTrial: str, growthBefore: str, growthNow: str, growthProcess: str },
} as const;

export const ParagraphSchema = z.object({ paragraph: z.string().min(1) });
export const PARAGRAPH_JSON = {
  type: 'object', additionalProperties: false, required: ['paragraph'], properties: { paragraph: str },
} as const;

// 카드 한 장 문구만 다시 (2026-10-18) — 그림은 그대로
export const CardOneSchema = z.object({ title: z.string().min(1), sub: z.string().min(1) });
export const CARD_ONE_JSON = {
  type: 'object', additionalProperties: false, required: ['title', 'sub'],
  properties: { title: { type: 'string', description: '카드 제목 10~28자' }, sub: { type: 'string', description: '2문장 60~110자: 제목에 대한 답 + 글 속 구체 내용' } },
} as const;

export const TitlesSchema = z.object({ titleCandidates: z.array(z.string().min(1)).length(3) });
export const TITLES_JSON = {
  type: 'object', additionalProperties: false, required: ['titleCandidates'], properties: { titleCandidates: { type: 'array', items: str } },
} as const;

// ---------- IPC 입력 ----------
const s = (max = 4000) => z.string().max(max);
const Writer = z.object({ id: s(64), role: z.enum(['원장', '교사']), name: s(30), className: s(30).optional() });
export const ProfileInput = z.object({
  id: s(64),
  name: s(80).min(1, `${APP.nameLabel}을 적어 주세요`),
  region: s(80).min(1, '소재 지역을 적어 주세요'),
  address: s(200).optional(),
  audiences: z.array(s(30)).optional().transform(() => [...AUDIENCES]), // 유치원은 늘 만 3~5세
  philosophy: s().min(1, `${APP.philLabel}을 적어 주세요`),
  classFeatures: s(),
  hours: s(300).optional(),
  classes: s(2000).optional(),
  promoDay: s(300).optional(),
  strengths: z.array(s(30)).max(30).optional(),
  strengthsEtc: s(500).optional(),
  otherFacts: s().optional(),
  credentials: s().optional(),
  contact: s(200).optional(),
  consultLink: s(300).optional(),
  blogUrl: s(300).optional(),
  mapName: s(80).optional(),
  logoPath: s(500).optional(),
  logoScale: z.number().int().min(60).max(200).optional(),
  logoOnDobok: z.boolean().optional(),
  dobokRefPath: s(500).optional(),
  coachRefPath: s(500).optional(),
  brand: z.object({ main: s(20), accent: s(20) }),
  tone: z.enum(TONES),
  avoidWords: s(500),
  nearbyAreas: z.array(z.object({ name: s(60), kind: s(30), distance: z.number().optional(), source: z.enum(['kakao', 'manual']) })).optional(),
  facilityType: s(30).optional(),
  writers: z.array(Writer).max(30).optional(),
  updatedAt: s(40).optional(),
});

const FactsInput = z.object({
  story: s(3000).optional(),
  activities: s(), coachingPoints: s(), scenes: s(), values: s(500), extra: s(), photoNotes: s(),
  event: z.object({ when: s(200), where: s(200), who: s(200), bring: s(500), apply: s(500) }).optional(),
  recruit: z.object({ who: s(500), trial: s(1000) }).optional(),
  growth: z.object({ before: s(), now: s(), process: s() }).optional(),
});

export const ArticleInputSchema = z.object({
  kind: z.enum(ARTICLE_KINDS),
  audience: s(40),
  region: s(80),
  topic: s(200),
  facts: FactsInput,
  mainKeyword: s(60),
  subKeywords: z.array(s(60)).max(2),
  tone: z.enum(TONES),
  ending: s(60),
  includeProfile: z.object({ philosophy: z.boolean(), classFeatures: z.boolean(), credentials: z.boolean(), contact: z.boolean(), address: z.boolean() }),
  withCards: z.boolean(),
  keywordPlan: z.array(z.object({ role: z.enum(['주요', '보조']), keyword: s(60), sentence: s(300), why: s(100).optional() })).max(3).optional(),
  titlePrefix: s(60).optional(),
  writer: Writer.optional(),
  writerSign: z.boolean().optional(),
  brief: z.object({
    purpose: z.enum(BRIEF_PURPOSES), note: s(200),
    facts: z.array(z.object({ text: s(300), quote: s(300), unclear: z.boolean() })).max(12),
    check: z.object({ quote: s(300), question: s(300) }).optional(),
    answer: z.enum(['맞아요', '빼기']).optional(),
    notes: z.array(s(300)).max(8), exclude: z.array(s(100)).max(8),
    topicGap: s(300).optional(), topicAnswer: s(500).optional(),
    asks: z.array(z.object({ question: s(300), answer: s(500).optional() })).max(3).optional(),
  }).optional(),
});

export const DocSchema = z.object({
  titleCandidates: z.array(s(200)),
  sections: z.array(z.object({ id: s(40), heading: s(200).optional(), paragraphs: z.array(s(8000)) })),
  tags: z.array(s(60)),
  photoSuggestions: z.array(z.object({ afterSectionId: s(40), caption: s(300) })),
  reviewFlags: z.array(z.object({ code: s(40), message: s(1000), sectionId: s(40).optional() })),
});

// 흐름 2차 점검: 고칠 문장만 (before 는 글에 있는 문장 그대로, after 가 빈 문자열이면 지움)
export const ProofreadSchema = z.object({
  fixes: z.array(z.object({ sectionId: z.string(), before: z.string(), after: z.string(), reason: z.string() })),
});
export const PROOFREAD_JSON = {
  type: 'object', additionalProperties: false, required: ['fixes'],
  properties: {
    fixes: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['sectionId', 'before', 'after', 'reason'], properties: { sectionId: str, before: str, after: str, reason: str } },
    },
  },
} as const;
