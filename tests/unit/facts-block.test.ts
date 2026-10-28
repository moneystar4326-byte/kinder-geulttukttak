// 태권 글뚝딱 2026-10-28 실사용에서 옮김: 행사 안내 글에 [성장 이야기] 칸(현재 관찰)에 적은 결과가 AI에게 안 가서 빠짐,
// 주제 칸에 직접 쓴 행사 이름을 사실 확인이 "사실에 없는 내용"으로 표시
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { factsBlock, reviewPrompt } from '../../src/main/services/openai/prompts';
import { DEMO_PROFILE } from '../../src/main/services/openai/demo';
import type { ArticleInput } from '../../src/shared/types';

const input = {
  kind: '행사 안내', audience: '유아 (만 3~5세)', region: '서울 동작구 신대방동', topic: '보라매공원 가을 운동회 다녀온 이야기',
  facts: {
    activities: '공 굴리기, 이어달리기', coachingPoints: '순서를 기다리도록 도움', scenes: '한 명도 빠짐없이 끝까지 달림', values: '함께하는 즐거움', extra: '', photoNotes: '',
    event: { when: '2026.10.24', where: '보라매공원 잔디마당', who: '', bring: '', apply: '' },
    recruit: { who: '', trial: '' },
    growth: { before: '', now: '햇살반 친구들이 이어달리기를 끝까지 함', process: '' },
  },
  mainKeyword: '유치원 운동회', subKeywords: [], tone: '따뜻한 설명형', ending: '유치원 소개로 마무리',
  includeProfile: { philosophy: true, classFeatures: true, credentials: false, contact: false, address: false }, withCards: true, titlePrefix: '',
} as unknown as ArticleInput;

test('글 종류와 다른 칸에 적은 사실도 버리지 않고 보냄', () => {
  const b = factsBlock(input);
  assert.match(b, /햇살반 친구들이 이어달리기를 끝까지 함/);
  assert.match(b, /보라매공원 잔디마당/);
  // 빈 칸은 보내지 않음
  assert.doesNotMatch(b, /모집 대상|이전 모습/);
});

test('사실 확인은 주제 칸도 사실로 봄', () => {
  const doc = { titleCandidates: [], sections: [{ id: 's1', paragraphs: ['보라매공원 가을 운동회'] }], tags: [], photoSuggestions: [], reviewFlags: [] };
  const p = reviewPrompt(doc, DEMO_PROFILE, input);
  const facts = p.slice(0, p.lastIndexOf('[글]'));
  assert.match(facts, /보라매공원 가을 운동회 다녀온 이야기/);
});

test('글 쓰기 · 사실 확인에 오늘 날짜를 알려 줌 (지난 행사를 미래로 보지 않게)', async () => {
  const { todayLine, articlePrompt } = await import('../../src/main/services/openai/prompts');
  assert.equal(todayLine(new Date('2026-10-27T16:00:00Z')), '[오늘] 2026년 10월 28일 수요일 — 이보다 앞선 날짜는 이미 지난 일이다');
  const p = articlePrompt(DEMO_PROFILE, input, null);
  assert.match(p, /^\[오늘\] /);
  // 지난 행사는 후기 글로
  assert.match(p, /\[오늘\]보다 앞이면 이미 끝난 행사의 후기 글/);
  const doc = { titleCandidates: [], sections: [{ id: 's1', paragraphs: ['x'] }], tags: [], photoSuggestions: [], reviewFlags: [] };
  assert.match(reviewPrompt(doc, DEMO_PROFILE, input), /\[오늘\] /);
});
