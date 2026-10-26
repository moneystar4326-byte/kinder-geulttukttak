// OpenAI 어댑터: 글(Responses API + 구조화 출력) · 이미지(Images API)를 따로 둠.
// 같은 키라도 모델 권한이 다를 수 있어 오류를 구분해서 돌려줌 (errors.ts)
import fs from 'node:fs';
import path from 'node:path';
import OpenAI, { toFile } from 'openai';
import { z } from 'zod';
import { ApiError, toApiError } from '../errors';
import {
  CARD_COPY_JSON, CardCopySchema, CARD_ONE_JSON, CardOneSchema, MEMO_SPLIT_JSON, MemoSplitSchema, GENERATED_ARTICLE_JSON, GeneratedArticleSchema, KEYWORD_IDEAS_JSON, KeywordIdeasSchema,
  PARAGRAPH_JSON, ParagraphSchema, REVIEW_JSON, ReviewSchema, TITLES_JSON, TitlesSchema,
} from '../../../shared/schemas';
import type { ArticleDoc, ArticleInput, DojoProfile, ReviewFlag, RevisionKind } from '../../../shared/types';
import { IND, isDaycare, type Writer } from '../../../shared/industry';
import * as P from './prompts';

export interface Usage { model: string; kind: string; reported: unknown }
export interface CallOpts { signal?: AbortSignal; onUsage?: (u: Usage) => void }

export interface TextAI {
  generate(p: DojoProfile, input: ArticleInput, regionNote: string | null, o?: CallOpts): Promise<ArticleDoc>;
  expand(doc: ArticleDoc, current: number, o?: CallOpts, min?: number): Promise<ArticleDoc>;
  polish(doc: ArticleDoc, input: ArticleInput, o?: CallOpts): Promise<ArticleDoc>;
  review(doc: ArticleDoc, p: DojoProfile, input: ArticleInput, o?: CallOpts): Promise<ReviewFlag[]>;
  revise(kind: Exclude<RevisionKind, 'titles' | 'paragraph'>, doc: ArticleDoc, o?: CallOpts, min?: number): Promise<ArticleDoc>;
  titles(doc: ArticleDoc, input: ArticleInput, o?: CallOpts): Promise<string[]>;
  paragraph(doc: ArticleDoc, sectionId: string, index: number, instruction: string, o?: CallOpts): Promise<string>;
  cardOne(doc: ArticleDoc, title: string, index: number, current: { title: string; sub: string; scene: string }, others: string[], kind?: string, o?: CallOpts, writer?: Writer): Promise<{ title: string; sub: string }>;
  cardCopies(doc: ArticleDoc, title: string, kind?: string, o?: CallOpts, writer?: Writer): Promise<{ title: string; sub: string; scene: string; afterSectionId: string }[]>;
  keywordIdeas(region: string, topic: string, kind: string, o?: CallOpts): Promise<string[]>;
  splitMemo(memo: string, kind: string, topic: string, o?: CallOpts): Promise<Record<string, string>>;
}

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

// 메모 말로 넣기 (2026-10-26): 받아쓰기 모델 + 힌트(태권도 낱말 + 그 도장의 이름 · 동네 · 주변 학교)
// mini 는 첫마디 · 고유명사를 자주 틀려서(잡음 섞은 시험 98% vs 100%) 큰 모델로. 1분에 약 8원
export const LISTEN_MODEL = 'gpt-4o-transcribe';
const LISTEN_HINT = isDaycare
  ? '어린이집 원장님 · 선생님의 보육 메모. 영아반, 유아반, 만 0세, 만 1세, 만 2세, 누리과정, 적응기간, 낮잠, 배변훈련, 바깥놀이, 숲체험, 오감놀이, 생일잔치, 연장보육, 담임 선생님.'
  : '태권도장 관장님의 수업 메모. 품새, 태극 1장, 승급심사, 승품단, 국기원, 유치부, 초등부, 미트, 겨루기, 앞차기, 돌려차기, 줄넘기, 사범님.';
export const listenHint = (names: string[]) => {
  const extra = [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, 20).join(', ');
  return (extra ? `${LISTEN_HINT} ${IND.place} · 동네 이름: ${extra}.` : LISTEN_HINT).slice(0, 600);
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
    async cardOne(doc, title, index, current, others, kind, o, writer) {
      const r = await json('card_one', 'text', P.SYSTEM_RULES, P.cardOnePrompt(doc, title, index, current, others, kind, writer), CARD_ONE_JSON, CardOneSchema, o);
      return { title: r.title.trim(), sub: r.sub.trim() };
    },
    async cardCopies(doc, title, kind, o, writer) {
      return (await json('cards', 'text', P.SYSTEM_RULES, P.cardCopyPrompt(doc, title, kind, writer), CARD_COPY_JSON, CardCopySchema, o)).cards;
    },
    async splitMemo(memo, kind, topic, o) {
      const r = await json('memo', 'text', P.MEMO_RULES, P.memoPrompt(memo, kind, topic), MEMO_SPLIT_JSON, MemoSplitSchema, o);
      return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v).trim()]));
    },
    async keywordIdeas(region, topic, kind, o) {
      const r = await json('keywords', 'text', '너는 네이버 블로그 검색어를 제안한다. 숫자를 지어내지 않는다.', P.keywordIdeasPrompt(region, topic, kind), KEYWORD_IDEAS_JSON, KeywordIdeasSchema, o);
      return [...new Set(r.keywords.map((k) => k.trim()).filter(Boolean))].slice(0, 10);
    },
  };

  const image: ImageAI = {
    async background(prompt, o = {}) {
      let res: any;
      const size = o.size ?? '1536x1024';
      const refs = (o.refs ?? []).filter((f) => fs.existsSync(f));
      try {
        if (refs.length) {
          // 참고 사진(도복 · 띠)을 같이 보내 그대로 따라 그리게 (1버전 태권 글뚝딱과 같은 방식)
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
