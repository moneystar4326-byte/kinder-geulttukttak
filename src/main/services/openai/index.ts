// OpenAI 어댑터: 글(Responses API + 구조화 출력) · 이미지(Images API)를 따로 둠.
// 같은 키라도 모델 권한이 다를 수 있어 오류를 구분해서 돌려줌 (errors.ts)
import fs from 'node:fs';
import path from 'node:path';
import OpenAI, { toFile } from 'openai';
import { z } from 'zod';
import { ApiError, toApiError } from '../errors';
import {
  BRIEF_JSON, BriefSchema, VERIFY_JSON, VerifySchema, CARD_COPY_JSON, CardCopySchema, CARD_ONE_JSON, CardOneSchema, MEMO_SPLIT_JSON, MemoSplitSchema, GENERATED_ARTICLE_JSON, GeneratedArticleSchema, KEYWORD_IDEAS_JSON, KeywordIdeasSchema, KEYWORD_PLAN_JSON, KeywordPlanSchema,
  PARAGRAPH_JSON, ParagraphSchema, PROOFREAD_JSON, ProofreadSchema, REVIEW_JSON, ReviewSchema, TITLES_JSON, TitlesSchema,
} from '../../../shared/schemas';
import type { ArticleBrief, ArticleDoc, ArticleInput, DojoProfile, ReviewFlag, RevisionKind } from '../../../shared/types';
import { APP, type Writer } from '../../../shared/kinder';
import * as P from './prompts';

export interface Usage { model: string; kind: string; reported: unknown }
export interface CallOpts { signal?: AbortSignal; onUsage?: (u: Usage) => void }
// 흐름 2차 점검이 돌려주는 고칠 문장 (after 가 빈 문자열이면 지움)
export interface Fix { sectionId: string; before: string; after: string }

export interface TextAI {
  generate(p: DojoProfile, input: ArticleInput, regionNote: string | null, o?: CallOpts): Promise<ArticleDoc>;
  expand(doc: ArticleDoc, current: number, o?: CallOpts, min?: number): Promise<ArticleDoc>;
  polish(doc: ArticleDoc, input: ArticleInput, o?: CallOpts): Promise<ArticleDoc>;
  proofread(doc: ArticleDoc, input: ArticleInput, o?: CallOpts): Promise<Fix[]>;
  review(doc: ArticleDoc, p: DojoProfile, input: ArticleInput, o?: CallOpts): Promise<ReviewFlag[]>;
  revise(kind: Exclude<RevisionKind, 'titles' | 'paragraph'>, doc: ArticleDoc, o?: CallOpts, min?: number): Promise<ArticleDoc>;
  titles(doc: ArticleDoc, input: ArticleInput, o?: CallOpts): Promise<string[]>;
  paragraph(doc: ArticleDoc, sectionId: string, index: number, instruction: string, o?: CallOpts): Promise<string>;
  cardOne(doc: ArticleDoc, title: string, index: number, current: { title: string; sub: string; scene: string }, others: string[], input?: P.CardInput, o?: CallOpts, writer?: Writer, noQuestion?: boolean): Promise<{ title: string; sub: string }>;
  cardCopies(doc: ArticleDoc, title: string, input?: P.CardInput, o?: CallOpts, writer?: Writer, noQuestion?: boolean): Promise<{ title: string; sub: string; scene: string; afterSectionId: string }[]>;
  keywordIdeas(region: string, topic: string, kind: string, o?: CallOpts): Promise<string[]>;
  keywordPlan(q: { region: string; kind: string; topic: string; story: string; candidates: { keyword: string; volume: number | null }[] }, o?: CallOpts): Promise<KeywordPlanResult>;
  splitMemo(memo: string, kind: string, topic: string, o?: CallOpts): Promise<Record<string, string>>;
  brief(q: { kind: string; topic: string; story: string }, o?: CallOpts): Promise<ArticleBrief>;
  verify(doc: ArticleDoc, p: DojoProfile, input: ArticleInput, o?: CallOpts): Promise<VerifyIssue[]>;
}

export type VerifyIssue = { sentence: string; type: '지어냄' | '틀림' | '해설' | '되풀이'; fix: string };

export type PlanPick = { keyword: string; sentence: string; why: string };
export type KeywordPlanResult = { main: PlanPick; subs: PlanPick[]; others: PlanPick[] };

export interface ImageAI {
  // 글자 없는 배경 그림 (세로 비율). 돌려준 PNG 를 카드 합성기가 1080×1350 으로 자름
  background(prompt: string, o?: CallOpts & { size?: '1024x1536' | '1536x1024'; refs?: string[] }): Promise<Buffer>;
}

// AI 가 섹션 heading 을 빈 문자열로 줄 수 있음 → undefined 로 정리, id 중복 · 빈 문단 정리
export function normalizeDoc(raw: z.infer<typeof GeneratedArticleSchema>): ArticleDoc {
  const ids = new Set<string>();
  const sections = raw.sections.map((s, i) => {
    let id = s.id.trim() || `s${i + 1}`;
    while (ids.has(id)) id = `${id}_${i + 1}`;
    ids.add(id);
    return { id, heading: s.heading.trim() || undefined, paragraphs: s.paragraphs.map((x) => x.trim()).filter(Boolean) };
  }).filter((s) => s.paragraphs.length);
  return {
    titleCandidates: raw.titleCandidates.map((t) => t.trim()),
    sections,
    tags: [...new Set(raw.tags.map((t) => t.replace(/^#/, '').trim()).filter(Boolean))].slice(0, 15),
    photoSuggestions: raw.photoSuggestions.filter((x) => ids.has(x.afterSectionId)),
    reviewFlags: raw.reviewFlags.map((f) => ({ code: f.code, message: f.message, sectionId: f.sectionId || undefined })),
  };
}

// 메모 말로 넣기 (2026-10-26): 받아쓰기 모델 + 힌트(유치원 낱말 + 그 유치원의 이름 · 동네 · 주변 장소)
// mini 는 첫마디 · 고유명사를 자주 틀려서(잡음 섞은 시험 98% vs 100%) 큰 모델로. 1분에 약 8원
export const LISTEN_MODEL = 'gpt-4o-transcribe';
const LISTEN_HINT = '유치원 원장님 · 선생님의 유치원 메모. 5세반, 6세반, 7세반, 만 3세, 만 4세, 만 5세, 누리과정, 방과후과정, 특성화 활동, 처음학교로, 입학설명회, 적응기간, 바깥놀이, 숲체험, 생일잔치, 담임 선생님.';
export const listenHint = (names: string[]) => {
  const extra = [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, 20).join(', ');
  return (extra ? `${LISTEN_HINT} ${APP.place} · 동네 이름: ${extra}.` : LISTEN_HINT).slice(0, 600);
};
export type Listen = (audio: Uint8Array, mime: string, o?: CallOpts & { hint?: string }) => Promise<string>;

export function createOpenAI(opts: { apiKey: string; textModel: string; imageModel: string; timeoutMs?: number }): { text: TextAI; image: ImageAI; listen: Listen; ping(): Promise<void> } {
  const client = new OpenAI({ apiKey: opts.apiKey, timeout: opts.timeoutMs ?? 180_000, maxRetries: 0 });

  async function json<T>(name: string, kind: string, instructions: string, input: string, schema: object, zod: z.ZodType<T>, o: CallOpts = {}): Promise<T> {
    // 형식 오류만 한 번 더 (비용 발생 주의: 같은 요청을 최대 2번까지만)
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      let res: any;
      try {
        res = await client.responses.create({
          model: opts.textModel, instructions, input,
          text: { format: { type: 'json_schema', name, schema: schema as any, strict: true } },
        }, { signal: o.signal });
      } catch (e) { throw toApiError('OpenAI', e); }
      o.onUsage?.({ model: opts.textModel, kind, reported: res.usage ?? null });
      if (res.status === 'incomplete') { lastErr = new ApiError('schema', 'AI 응답이 중간에 끊겼어요. 다시 시도해 주세요.', 'OpenAI'); continue; }
      try { return zod.parse(JSON.parse(res.output_text)); } catch (e) { lastErr = e; }
    }
    throw lastErr instanceof ApiError ? lastErr : new ApiError('schema', 'AI 응답 형식이 맞지 않았어요. 다시 시도해 주세요.', 'OpenAI', true);
  }

  // 유치원 카드 점검 (2026-10-27 요요유치원 시험: 제목 "밖에서 무엇을 하나요?"에 "풍경을 만나요"로 답함 · 카드끼리 같은 말 · 공원 글에 교실 그림)
  // 글처럼 만든 뒤 한 번 더 보고 고칠 곳만 고침. 실패하거나 모양이 다르면 처음 카드 그대로 (멈추기만 그대로 던짐)
  type CardCopyRow = { title: string; sub: string; scene: string; afterSectionId: string };
  async function checkCards(doc: ArticleDoc, title: string, cards: CardCopyRow[], input?: P.CardInput, o?: CallOpts, writer?: Writer, noQuestion = false): Promise<CardCopyRow[]> {
    try {
      const r = (await json('cards', 'text', P.SYSTEM_RULES, P.cardCheckPrompt(doc, title, cards, input, writer, noQuestion), CARD_COPY_JSON, CardCopySchema, o)).cards;
      if (r.length !== cards.length) return cards;
      // 카드를 넣을 자리는 처음 것 그대로, 답 없이 끝나는 글이 새로 생기면 그 카드는 처음 것
      return r.map((c, i) => (P.VAGUE_SUB.test(c.sub) && !P.VAGUE_SUB.test(cards[i].sub) ? cards[i] : { ...c, afterSectionId: cards[i].afterSectionId }));
    } catch (e: any) {
      if (o?.signal?.aborted || e?.name === 'AbortError' || e?.code === 'cancelled') throw e;
      return cards;
    }
  }

  const text: TextAI = {
    async generate(p, input, regionNote, o) {
      return normalizeDoc(await json('article', 'text', P.SYSTEM_RULES, P.articlePrompt(p, input, regionNote), GENERATED_ARTICLE_JSON, GeneratedArticleSchema, o));
    },
    async expand(doc, current, o, min) {
      return normalizeDoc(await json('article', 'text', P.SYSTEM_RULES, P.expandPrompt(doc, current, min), GENERATED_ARTICLE_JSON, GeneratedArticleSchema, o));
    },
    async polish(doc, input, o) {
      return normalizeDoc(await json('article', 'text', P.SYSTEM_RULES, P.polishPrompt(doc, input), GENERATED_ARTICLE_JSON, GeneratedArticleSchema, o));
    },
    async proofread(doc, input, o) {
      const r = await json('proofread', 'text', P.SYSTEM_RULES, P.proofreadPrompt(doc, input), PROOFREAD_JSON, ProofreadSchema, o);
      return r.fixes.map(({ sectionId, before, after }) => ({ sectionId, before, after }));
    },
    async review(doc, p, input, o) {
      const r = await json('review', 'text', '너는 사실 확인 담당이다. 근거 없는 지적은 하지 않는다.', P.reviewPrompt(doc, p, input), REVIEW_JSON, ReviewSchema, o);
      return r.flags.map((f) => ({ code: `ai-${f.code}`, message: f.message, sectionId: f.sectionId || undefined }));
    },
    async revise(kind, doc, o, min) {
      return normalizeDoc(await json('article', 'text', P.SYSTEM_RULES, P.revisePrompt(kind, doc, min), GENERATED_ARTICLE_JSON, GeneratedArticleSchema, o));
    },
    async titles(doc, input, o) {
      return (await json('titles', 'text', P.SYSTEM_RULES, P.titlesPrompt(doc, input), TITLES_JSON, TitlesSchema, o)).titleCandidates;
    },
    async paragraph(doc, sectionId, index, instruction, o) {
      return (await json('paragraph', 'text', P.SYSTEM_RULES, P.paragraphPrompt(doc, sectionId, index, instruction), PARAGRAPH_JSON, ParagraphSchema, o)).paragraph.trim();
    },
    // 카드 글이 답 없이 끝나면(P.VAGUE_SUB) 한 번만 더 만들어 덜 막연한 쪽을 씀 (비용: 그때만 2번)
    async cardOne(doc, title, index, current, others, input, o, writer, noQuestion) {
      const make = () => json('card_one', 'text', P.SYSTEM_RULES, P.cardOnePrompt(doc, title, index, current, others, input, writer, noQuestion), CARD_ONE_JSON, CardOneSchema, o);
      let r = await make();
      if (P.VAGUE_SUB.test(r.sub)) { const again = await make(); if (!P.VAGUE_SUB.test(again.sub)) r = again; }
      return { title: r.title.trim(), sub: r.sub.trim() };
    },
    async cardCopies(doc, title, input, o, writer, noQuestion) {
      const make = async () => (await json('cards', 'text', P.SYSTEM_RULES, P.cardCopyPrompt(doc, title, input, writer, noQuestion), CARD_COPY_JSON, CardCopySchema, o)).cards;
      const vague = (cards: { sub: string }[]) => cards.filter((c) => P.VAGUE_SUB.test(c.sub)).length;
      let cards = await make();
      if (vague(cards)) { const again = await make(); if (vague(again) < vague(cards)) cards = again; }
      cards = await checkCards(doc, title, cards, input, o, writer, noQuestion);
      // 재료가 적은 글인데 아직 질문 제목이 남았으면 한 번만 더 (글에 그 답이 없음)
      if (noQuestion && cards.some((c) => /[?？]/.test(c.title))) cards = await checkCards(doc, title, cards, input, o, writer, true);
      return cards;
    },
    async splitMemo(memo, kind, topic, o) {
      const r = await json('memo', 'text', P.MEMO_RULES, P.memoPrompt(memo, kind, topic), MEMO_SPLIT_JSON, MemoSplitSchema, o);
      return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v).trim()]));
    },
    async keywordIdeas(region, topic, kind, o) {
      const r = await json('keywords', 'text', '너는 네이버 블로그 검색어를 제안한다. 숫자를 지어내지 않는다.', P.keywordIdeasPrompt(region, topic, kind), KEYWORD_IDEAS_JSON, KeywordIdeasSchema, o);
      return [...new Set(r.keywords.map((k) => k.trim()).filter(Boolean))].slice(0, 10);
    },
    async brief(q, o) {
      const r = await json('brief', 'text', '너는 유치원 블로그 글의 편집자다. 재료에 없는 사실을 만들지 않는다.', P.briefPrompt(q), BRIEF_JSON, BriefSchema, o);
      const t = (x: string) => x.trim();
      const facts = r.facts.map((f) => ({ text: t(f.text), quote: t(f.quote), unclear: f.unclear })).filter((f) => f.text).slice(0, 12);
      const check = t(r.check.question) && facts.some((f) => f.unclear) ? { quote: t(r.check.quote), question: t(r.check.question) } : undefined;
      return { purpose: r.purpose, note: t(r.note), facts, check, notes: r.notes.map(t).filter(Boolean).slice(0, 8), exclude: r.exclude.map(t).filter(Boolean).slice(0, 8), topicGap: t(r.topicGap) || undefined, asks: r.asks.map(t).filter(Boolean).slice(0, 3).map((question) => ({ question })) };
    },
    async verify(doc, p, input, o) {
      return (await json('verify', 'text', '너는 사실 확인 담당이다. 근거 없는 지적은 하지 않는다.', P.verifyPrompt(doc, p, input), VERIFY_JSON, VerifySchema, o)).issues;
    },
    async keywordPlan(q, o) {
      const r = await json('keyword_plan', 'text', '너는 블로그 검색어를 고르는 담당이다. 숫자 · 사실을 지어내지 않는다.', P.keywordPlanPrompt(q), KEYWORD_PLAN_JSON, KeywordPlanSchema, o);
      const clean = (x: PlanPick) => ({ keyword: x.keyword.trim(), sentence: x.sentence.trim(), why: x.why.trim() });
      const main = clean(r.main);
      const subs = r.subs.map(clean).filter((x) => x.keyword && x.keyword !== main.keyword).slice(0, 2);
      const used = new Set([main.keyword, ...subs.map((x) => x.keyword)]);
      return { main, subs, others: r.others.map(clean).filter((x) => x.keyword && !used.has(x.keyword)).slice(0, 5) };
    },
  };

  const image: ImageAI = {
    async background(prompt, o = {}) {
      let res: any;
      const size = o.size ?? '1536x1024';
      const refs = (o.refs ?? []).filter((f) => fs.existsSync(f));
      try {
        if (refs.length) {
          // 참고 사진(원복 · 교실)을 같이 보내 그대로 따라 그리게
          const image = await Promise.all(refs.map((f) => toFile(fs.createReadStream(f), path.basename(f), { type: /\.jpe?g$/i.test(f) ? 'image/jpeg' : 'image/png' })));
          res = await client.images.edit({ model: opts.imageModel, image, prompt, size, quality: 'medium', n: 1 } as any, { signal: o.signal, timeout: 300_000 });
        } else {
          res = await client.images.generate({ model: opts.imageModel, prompt, size, quality: 'medium', n: 1 } as any, { signal: o.signal, timeout: 240_000 });
        }
      } catch (e) { throw toApiError('OpenAI 이미지', e); }
      o.onUsage?.({ model: opts.imageModel, kind: 'image', reported: res.usage ?? { images: 1 } });
      const b64 = res.data?.[0]?.b64_json;
      if (!b64) throw new ApiError('schema', '이미지를 받지 못했어요. 다시 시도해 주세요.', 'OpenAI 이미지', true);
      return Buffer.from(b64, 'base64');
    },
  };

  // 비용이 거의 없는 확인: 모델 목록에서 설정한 모델이 보이는지 (생성 요청 아님)
  async function ping() {
    try {
      await client.models.retrieve(opts.textModel);
    } catch (e) { throw toApiError('OpenAI', e); }
    try {
      await client.models.retrieve(opts.imageModel);
    } catch (e) { const err = toApiError('OpenAI 이미지', e); if (err.code !== 'bad-request') throw err; throw new ApiError('permission', `이미지 모델 "${opts.imageModel}"을 이 키로 쓸 수 없어요. 글 만들기는 되고, 카드는 템플릿 모드로 만들 수 있어요.`, 'OpenAI 이미지'); }
  }

  const listen: Listen = async (audio, mime, o = {}) => {
    const ext = /mp4|m4a|aac/.test(mime) ? 'm4a' : /ogg/.test(mime) ? 'ogg' : 'webm';
    let res: { text: string; usage?: unknown };
    try {
      res = (await client.audio.transcriptions.create({ file: await toFile(Buffer.from(audio), `memo.${ext}`, { type: mime }), model: LISTEN_MODEL, language: 'ko', prompt: o.hint ?? LISTEN_HINT }, { signal: o.signal })) as { text: string; usage?: unknown };
    } catch (e) { throw toApiError('OpenAI 받아쓰기', e); }
    o.onUsage?.({ model: LISTEN_MODEL, kind: 'audio', reported: res.usage ?? null });
    return res.text.trim();
  };

  return { text, image, listen, ping };
}
