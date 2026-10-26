// "주제 한 줄로 바로 쓰기"의 글 재료 만들기 — 컴퓨터판(NewArticle) · 휴대폰판(mobile/)이 같이 씀 (2026-10-26 휴대폰판 시작하며 뺌)
import { ENDINGS, type ArticleInput, type DojoProfile } from './types';
import { quickEnding, quickKind, quickWhen } from './quick';
import { daycareAge, type Writer } from './daycare';

export const emptyInput = (p?: DojoProfile | null): ArticleInput => ({
  kind: '수업 후기', audience: p?.audiences[0] ?? '유아 (만 3~5세)', region: p?.region ?? '', topic: '',
  facts: { activities: '', coachingPoints: '', scenes: '', values: '', extra: '', photoNotes: '', event: { when: '', where: '', who: '', bring: '', apply: '' }, recruit: { who: '', trial: '' }, growth: { before: '', now: '', process: '' } },
  mainKeyword: '', subKeywords: [], tone: p?.tone ?? '따뜻한 설명형', ending: ENDINGS[0],
  includeProfile: { philosophy: true, classFeatures: true, credentials: false, contact: false, address: false }, withCards: true, titlePrefix: '',
});

// 메모에 나온 만 나이 · 돌로 영아 / 유아 (둘 다 나오거나 없으면 어린이집 대상 전체 — 카드 그림 나이와 같은 규칙)
export const quickAudience = (t: string, profile?: DojoProfile | null) => {
  const age = daycareAge(t);
  if (age === 'infant') return '영아 (만 0~2세)';
  if (age === 'preschool') return '유아 (만 3~5세)';
  return profile?.audiences.join(' · ') || '유아 (만 3~5세)';
};

// 문장 끝(. ! ? 뒤 띄어쓰기 · 줄 끝)에서만 자름 — "10.18 승급심사", "3.1절"이 잘리지 않게. 비면 메모 앞부분
export const quickTopic = (memo: string) => {
  const first = memo.split(/[.!?](?=\s|$)|[\r\n]/).map((x) => x.trim()).find((x) => /[^.!?…\s]/.test(x)) ?? memo;
  return first.length > 40 ? `${first.slice(0, 40)}…` : first;
};

export function buildQuickInput(o: { memo: string; profile: DojoProfile | null; main?: string; subs?: string[]; withCards: boolean; titlePrefix: string; writer?: Writer; writerSign?: boolean }): ArticleInput {
  const memo = o.memo.trim();
  const topic = quickTopic(memo);
  const base = emptyInput(o.profile);
  const kind = quickKind(memo);
  return {
    ...base,
    kind, topic, audience: quickAudience(memo, o.profile), mainKeyword: o.main || topic.replace(/…$/, ''), subKeywords: o.subs ?? [], ending: quickEnding(kind, o.writer?.role === '교사'),
    ...(o.writer ? { writer: o.writer, writerSign: !!o.writerSign } : {}),
    facts: { ...base.facts, activities: memo, event: { ...base.facts.event!, when: kind === '행사 안내' ? quickWhen(memo) : '' } },
    includeProfile: { philosophy: true, classFeatures: true, credentials: true, contact: false, address: false },
    withCards: o.withCards,
    titlePrefix: o.titlePrefix,
  };
}
