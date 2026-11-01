// 글 · 카드 만들기가 실패했을 때 이유별로 보여 줄 버튼 (2026-11-02: 무엇을 누를지까지 알려 줌)
export type FailAction = 'billing' | 'keys' | 'settings' | 'retry' | 'kakao';

export const OPENAI_BILLING = 'https://platform.openai.com/settings/organization/billing/overview';
export const OPENAI_KEYS = 'https://platform.openai.com/api-keys';

const AI_JOBS = new Set(['article', 'revise', 'cards', 'card']);

export const isAiJob = (type: string) => AI_JOBS.has(type);

export function failActions(type: string, code?: string): FailAction[] {
  if (!isAiJob(type)) return [];
  switch (code) {
    case 'quota': return ['billing', 'retry'];
    case 'auth': return ['keys', 'settings'];
    case 'rate': case 'server': case 'network': case 'schema': return ['retry'];
    case 'permission': return ['kakao'];
    default: return [];
  }
}
