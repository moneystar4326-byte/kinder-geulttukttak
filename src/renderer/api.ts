// 메인 통로 호출 (preload 의 window.gtd). 실패하면 사용자 문장 오류를 던짐
import type { Article, ArticleInput, ArticleSummary, ArticleVersion, Card, CardSet, DojoProfile, Job, KeywordRow } from '../shared/types';

declare global {
  interface Window { gtd: { call: (ch: string, arg?: unknown) => Promise<{ ok: boolean; data?: any; error?: string; code?: string }>; onJob: (fn: (j: Job) => void) => () => void } }
}

export class CallError extends Error { constructor(msg: string, public code?: string) { super(msg); } }

export async function call<T = any>(ch: string, arg?: unknown): Promise<T> {
  const r = await window.gtd.call(ch, arg);
  if (!r.ok) throw new CallError(r.error ?? '문제가 생겼어요', r.code);
  return r.data as T;
}

export const onJob = (fn: (j: Job) => void) => window.gtd.onJob(fn);

export interface AppInfo {
  version: string; dataDir: string; hasProfile: boolean; browser: string | null;
  settings: { setupDone: boolean; textModel: string; imageModel: string; saveDir: string; typingSpeed: number; imageAutoRetry: number; monthlyImageLimit: number; browserPath: string; keywordCacheHours: number };
  secrets: Record<'openai' | 'naverApiKey' | 'naverSecret' | 'naverCustomer' | 'kakao', string | null>;
}
export interface ArticleBundle {
  article: Article; version: ArticleVersion | null;
  versions: { id: string; note: string; createdAt: string; title: string; counts: { withSpaces: number; withoutSpaces: number } }[];
  cardSet: CardSet | null; jobs: Job[];
}
export type { Article, ArticleInput, ArticleSummary, ArticleVersion, Card, CardSet, DojoProfile, Job, KeywordRow };

// 데이터 폴더 안 자산 미리보기 주소 (gtd-asset://)
export function assetUrl(dataDir: string, file?: string, bust?: string) {
  if (!file) return '';
  const base = `${dataDir.replace(/\\/g, '/')}/assets/`;
  const f = file.replace(/\\/g, '/');
  if (!f.startsWith(base)) return '';
  return `gtd-asset://local/${f.slice(base.length).split('/').map(encodeURIComponent).join('/')}${bust ? `?v=${encodeURIComponent(bust)}` : ''}`;
}

// 브라우저 저장소: 작성 중인 폼 같은 편의 기능만 (막혀 있어도 앱은 동작)
export const local = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 무시 */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* 무시 */ } },
};
