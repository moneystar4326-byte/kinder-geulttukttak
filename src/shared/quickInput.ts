// "주제 한 줄로 바로 쓰기"의 글 재료 만들기 — 컴퓨터판(NewArticle) · 휴대폰판(mobile/)이 같이 씀 (2026-10-26 휴대폰판 시작하며 뺌)
import { ENDINGS, type ArticleInput, type DojoProfile } from './types';
import { quickEnding, quickKind, quickWhen } from './quick';

export const emptyInput = (p?: DojoProfile | null): ArticleInput => ({
  kind: '수업 후기', audience: p?.audiences[0] ?? '초등 저학년', region: p?.region ?? '', topic: '',
  facts: { activities: '', coachingPoints: '', scenes: '', values: '', extra: '', photoNotes: '', event: { when: '', where: '', who: '', bring: '', apply: '' }, recruit: { who: '', trial: '' }, growth: { before: '', now: '', process: '' } },
  mainKeyword: '', subKeywords: [], tone: p?.tone ?? '따뜻한 설명형', ending: ENDINGS[0],
  includeProfile: { philosophy: true, classFeatures: true, credentials: false, contact: false, address: false }, withCards: true, titlePrefix: '',
});

// 메모에 나온 나이 · 학년으로 독자 정하기, 없으면 도장 교육 대상 전체
// 중 · 고등을 먼저 ("중학교 1학년"이 초등으로 가지 않게), 숫자는 앞자리 숫자가 없을 때만 ("14살"이 유치부로 가지 않게)
export const quickAudience = (t: string, profile?: DojoProfile | null) => {
  if (/중학|중등|고등|청소년|중[1-3]|고[1-3]/.test(t)) return '중등 이상';
  if (/유치|(?<!\d)[4-7]\s*살|어린이집/.test(t)) return '유치부';
  if (/(?<!\d)[1-3]\s*학년|저학년/.test(t)) return '초등 저학년';
  if (/(?<!\d)[4-6]\s*학년|고학년/.test(t)) return '초등 고학년';
  if (/성인|어른/.test(t)) return '성인';
  return profile?.audiences.join(' · ') || '초등 저학년';
};

// 문장 끝(. ! ? 뒤 띄어쓰기 · 줄 끝)에서만 자름 — "10.18 승급심사", "3.1절"이 잘리지 않게. 비면 메모 앞부분
export const quickTopic = (memo: string) => {
  const first = memo.split(/[.!?](?=\s|$)|[\r\n]/).map((x) => x.trim()).find((x) => /[^.!?…\s]/.test(x)) ?? memo;
  return first.length > 40 ? `${first.slice(0, 40)}…` : first;
};

export function buildQuickInput(o: { memo: string; profile: DojoProfile | null; main?: string; subs?: string[]; withCards: boolean; titlePrefix: string }): ArticleInput {
  const memo = o.memo.trim();
  const topic = quickTopic(memo);
  const base = emptyInput(o.profile);
  const kind = quickKind(memo);
  return {
    ...base,
    kind, topic, audience: quickAudience(memo, o.profile), mainKeyword: o.main || topic.replace(/…$/, ''), subKeywords: o.subs ?? [], ending: quickEnding(kind),
    facts: { ...base.facts, activities: memo, event: { ...base.facts.event!, when: kind === '행사 안내' ? quickWhen(memo) : '' } },
    includeProfile: { philosophy: true, classFeatures: true, credentials: true, contact: false, address: false },
    withCards: o.withCards,
    titlePrefix: o.titlePrefix,
  };
}
