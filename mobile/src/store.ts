// 휴대폰판 보관: OpenAI 키는 안드로이드 보안 저장소(Keystore), 도장 정보 · 글은 이 앱 안(localStorage)
// 컴퓨터판과 자동으로 합치지 않음 (2026-10-26 기획: 처음엔 따로)
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import type { ArticleDoc, ArticleInput, DojoProfile } from '../../src/shared/types';

export const secrets = {
  async get(name: 'openai'): Promise<string> { try { return ((await SecureStorage.get(name)) as string | null) ?? ''; } catch { return ''; } },
  async set(name: 'openai', v: string) { await SecureStorage.set(name, v); },
  async remove(name: 'openai') { await SecureStorage.remove(name); },
};

const read = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } };
const write = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));

// 컴퓨터판 도장 정보와 같은 모양. 휴대폰 1주차는 핵심 칸만 받고 나머지는 빈 값
export const blankProfile = (): DojoProfile => ({
  id: 'default', name: '', region: '', audiences: ['초등 저학년'], philosophy: '', classFeatures: '', brand: { main: '#0094FF', accent: '#081E29' },
  tone: '따뜻한 설명형', avoidWords: '', nearbyAreas: [],
});
export const profileStore = {
  get: (): DojoProfile | null => read<DojoProfile | null>('gtd-profile', null),
  save: (p: DojoProfile) => write('gtd-profile', { ...p, updatedAt: new Date().toISOString() }),
};

export interface MobileArticle { id: string; input: ArticleInput; title: string; doc: ArticleDoc | null; counts?: { withoutSpaces: number }; status: string; createdAt: string; note?: string }
export const articleStore = {
  list: (): MobileArticle[] => read<MobileArticle[]>('gtd-articles', []),
  get: (id: string) => articleStore.list().find((a) => a.id === id) ?? null,
  put(a: MobileArticle) { const all = articleStore.list().filter((x) => x.id !== a.id); write('gtd-articles', [a, ...all].slice(0, 200)); },
  remove(id: string) { write('gtd-articles', articleStore.list().filter((x) => x.id !== id)); },
};
