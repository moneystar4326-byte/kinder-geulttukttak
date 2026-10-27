// "주제 한 줄로 바로 쓰기"의 글 재료 만들기 — 컴퓨터판(NewArticle) · 휴대폰판(mobile/)이 같이 씀 (2026-10-26 휴대폰판 시작하며 뺌)
import { AUDIENCES, ENDINGS, type ArticleInput, type DojoProfile } from './types';
import { fallbackKeyword } from './validation';
import { quickEnding, quickKind, quickWhen } from './quick';
import type { Writer } from './kinder';

export const emptyInput = (p?: DojoProfile | null): ArticleInput => ({
  kind: '수업 후기', audience: AUDIENCES[0], region: p?.region ?? '', topic: '',
  facts: { activities: '', coachingPoints: '', scenes: '', values: '', extra: '', photoNotes: '', event: { when: '', where: '', who: '', bring: '', apply: '' }, recruit: { who: '', trial: '' }, growth: { before: '', now: '', process: '' } },
  mainKeyword: '', subKeywords: [], tone: p?.tone ?? '따뜻한 설명형', ending: ENDINGS[0],
  includeProfile: { philosophy: true, classFeatures: true, credentials: false, contact: false, address: false }, withCards: true, titlePrefix: '',
});


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
    kind, topic, audience: AUDIENCES[0], mainKeyword: o.main || fallbackKeyword(base.region, topic), subKeywords: o.subs ?? [], ending: quickEnding(kind, o.writer?.role === '교사'),
    ...(o.writer ? { writer: o.writer, writerSign: !!o.writerSign } : {}),
    facts: { ...base.facts, activities: memo, event: { ...base.facts.event!, when: kind === '행사 안내' ? quickWhen(memo) : '' } },
    includeProfile: { philosophy: true, classFeatures: true, credentials: true, contact: false, address: false },
    withCards: o.withCards,
    titlePrefix: o.titlePrefix,
  };
}

// 메모가 첫 문장(주제) 하나뿐인지 → 화면에 "한 줄만 더" 안내 (2026-10-27 보라매공원 글: 한 줄 메모로 1,500자를 일반론으로 채움)
export const thinMemo = (memo: string) => {
  const m = memo.trim();
  const flat = (t: string) => t.replace(/[\s.,!?…]/g, '');
  return !!m && flat(m.split(quickTopic(m).replace(/…$/, '')).join('')).length < 10;
};
