// AI 응답 · IPC 입력 검증 스키마
import { z } from 'zod';
import { ARTICLE_KINDS, TONES } from './types';
import { APP } from './daycare';

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
  audiences: z.array(s(30)).min(1, `${APP.audLabel}을 하나 이상 골라 주세요`),
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
  titlePrefix: s(60).optional(),
  writer: Writer.optional(),
  writerSign: z.boolean().optional(),
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
