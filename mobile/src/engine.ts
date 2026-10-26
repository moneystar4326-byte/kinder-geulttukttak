// 휴대폰판 글 만들기 엔진: 컴퓨터판 generateArticle(초안 → 분량 보완 → 흐름 다듬기 → 사실 점검)을 그대로 부르고
// 저장소(Db)만 휴대폰용으로 바꿔 끼움 → 같은 지시문 · 같은 규칙이라 컴퓨터판과 글 품질이 같음
import { generateArticle } from '../../src/main/article';
import { createOpenAI, listenHint } from '../../src/main/services/openai';
import type { Db } from '../../src/main/db';
import type { ArticleInput, DojoProfile } from '../../src/shared/types';
import { articleStore, secrets, type MobileArticle } from './store';

// 컴퓨터판 settings.ts 기본값과 같게
export const MODELS = { text: 'gpt-6.1-sol', image: 'gpt-image-2.5-flare' };

async function ai() {
  const key = await secrets.get('openai');
  if (!key) throw new Error('설정에서 OpenAI 키를 먼저 넣어 주세요.');
  return createOpenAI({ apiKey: key, textModel: MODELS.text, imageModel: MODELS.image });
}

// generateArticle 이 쓰는 저장소 함수 세 개만 휴대폰 저장소로
function mobileDb(): Db {
  return {
    getArticle: (id: string) => { const a = articleStore.get(id); return a ? { id: a.id, input: a.input, currentVersionId: a.doc ? `${a.id}-v` : null, status: a.status } : null; },
    setArticleStatus: (id: string, status: string) => { const a = articleStore.get(id); if (a) articleStore.put({ ...a, status }); },
    addVersion: (v: { articleId: string; title: string; doc: MobileArticle['doc']; counts: MobileArticle['counts']; note: string }) => {
      const a = articleStore.get(v.articleId)!;
      const next = { ...a, title: v.title, doc: v.doc, counts: v.counts, note: v.note };
      articleStore.put(next);
      return { version: next, current: true };
    },
  } as unknown as Db;
}

export async function makeArticle(input: ArticleInput, profile: DojoProfile, onStep: (s: string) => void, signal: AbortSignal) {
  const o = await ai();
  const id = `m${Date.now().toString(36)}`;
  articleStore.put({ id, input, title: input.topic, doc: null, status: 'draft', createdAt: new Date().toISOString() });
  try {
    await generateArticle({ db: mobileDb(), ai: o.text, profile }, id, { signal, step: onStep });
  } catch (e) {
    articleStore.remove(id); // 실패한 빈 글은 남기지 않음 (컴퓨터판과 같게)
    throw e;
  }
  return id;
}

export async function listen(audio: Uint8Array, mime: string, profile: DojoProfile | null) {
  const o = await ai();
  const hint = listenHint(profile ? [profile.name, profile.region, ...(profile.nearbyAreas ?? []).map((a) => a.name)] : []);
  return o.listen(audio, mime, { hint });
}

export async function testKey(key: string) {
  const o = createOpenAI({ apiKey: key, textModel: MODELS.text, imageModel: MODELS.image });
  await o.ping();
}
