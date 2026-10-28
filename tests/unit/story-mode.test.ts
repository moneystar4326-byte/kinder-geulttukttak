// 자세히 쓰기 새 흐름: "어떤 일이 있었나요?" 이야기 칸 + 검색어 계획 (태권 글뚝딱 2026-10-28에서 옮김 — 항목표 · 일반론 채우기 · 키워드 3~5번 때문에 어색하던 문장)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { articlePrompt, factsBlock, keywordPlanPrompt, polishPrompt } from '../../src/main/services/openai/prompts';
import { DEMO_PROFILE } from '../../src/main/services/openai/demo';
import { emptyInput } from '../../src/shared/quickInput';
import { memoText, missingInputs, thinFacts } from '../../src/shared/validation';
import { minCharsForInput, STORY_MIN } from '../../src/shared/count';
import { ArticleInputSchema } from '../../src/shared/schemas';
import type { ArticleInput } from '../../src/shared/types';

const story = '10월 24일 보라매공원에서 가을 운동회를 했어요. 햇살반 친구들이 이어달리기를 끝까지 달렸고, 부모님들과 큰 공 굴리기도 했어요.';
const base = emptyInput(DEMO_PROFILE);
const withStory: ArticleInput = {
  ...base, kind: '행사 안내', topic: '보라매공원 가을 운동회', facts: { ...base.facts, story },
  keywordPlan: [{ role: '주요', keyword: '유치원운동회', sentence: '보라매공원에서 유치원 운동회를 했어요.' }, { role: '보조', keyword: '가을운동회', sentence: '아이들과 함께한 가을 운동회 이야기예요.' }],
  mainKeyword: '유치원운동회', subKeywords: ['가을운동회'],
};

test('이야기 글: 검색어 계획대로 2~3번, 일반론으로 늘리지 않음, 항목 이름 금지, 섹션 3~5개', () => {
  const p = articlePrompt(DEMO_PROFILE, withStory, null);
  assert.match(p, /\[검색어 계획\]/);
  assert.match(p, /주요 "유치원운동회" 예: 보라매공원에서 유치원 운동회를 했어요\./);
  assert.doesNotMatch(p, /3~5번/);
  assert.doesNotMatch(p, /교육적 설명 · 지도 방향 · 가정에서 도울 점으로 채우되/);
  assert.match(p, /일반론.*늘리지 않는다/);
  assert.match(p, /항목 이름을 글에 쓰지 않는다/);
  assert.match(p, /섹션 3~5개/);
  assert.match(p, /원장님 · 선생님 이야기: 10월 24일/);
  // 태권도 말이 섞이지 않음
  assert.doesNotMatch(p, /도장|관장|태권/);
  assert.doesNotMatch(factsBlock(withStory), /관찰 장면: \(없음/);
  assert.match(polishPrompt({ titleCandidates: [], sections: [], tags: [], photoSuggestions: [], reviewFlags: [] }, withStory), /2~3번/);
});

test('한 줄로 쓰기 · 예전 칸 입력은 그대로 (3~5번, 섹션 5~7개, 최소 분량)', () => {
  const old: ArticleInput = { ...base, topic: '촉감놀이', mainKeyword: '유치원 촉감놀이', facts: { ...base.facts, activities: '밀가루 반죽 촉감놀이' } };
  const p = articlePrompt(DEMO_PROFILE, old, null);
  assert.match(p, /3~5번/);
  assert.match(p, /섹션 5~7개/);
  assert.equal(minCharsForInput(old), 1500);
  assert.equal(minCharsForInput(withStory), STORY_MIN);
});

test('이야기가 있으면 칸별 필수는 묻지 않음, 입력 형식도 통과', () => {
  assert.deepEqual(missingInputs({ ...withStory, kind: '성장 이야기' }), []);
  assert.deepEqual(missingInputs({ ...withStory, kind: '성장 이야기', facts: { ...withStory.facts, story: '' } }), ['이전 모습', '현재 관찰']);
  assert.ok(ArticleInputSchema.safeParse(withStory).success);
});

test('유치원 점검(아이 이름 · 재료 적음)도 이야기 칸을 봄', () => {
  assert.match(memoText({ ...withStory, facts: { ...withStory.facts, story: '민준이가 처음으로 혼자 신발을 신었어요.' } }), /민준이가/);
  assert.equal(thinFacts(withStory), false);
  assert.equal(thinFacts({ ...withStory, facts: { ...withStory.facts, story: '' } }), true);
});

test('검색어 고르기 지시: 이야기와 맞는 것만, 검색량은 참고, 후보 없으면 이야기 속 말 (유치원 말로)', () => {
  const p = keywordPlanPrompt({ region: '서울 동작구 신대방동', kind: '행사 안내', topic: 't', story, candidates: [{ keyword: '유치원', volume: 37180 }, { keyword: '유치원운동회', volume: 250 }] });
  assert.match(p, /유치원\(37180\), 유치원운동회\(250\)/);
  assert.match(p, /검색량이 커도 이야기와 상관없으면 고르지 않는다/);
  assert.match(p, /"유치원" 한 낱말처럼 너무 넓은 말은 주요로 고르지 않는다/);
  assert.doesNotMatch(p, /도장|관장|태권/);
  assert.match(keywordPlanPrompt({ region: '', kind: '', topic: '', story, candidates: [] }), /없음 \(이야기 속 말로 고른다\)/);
});

test('검색어 후보: 재료와 관련된 것만 검색량순 (넓은 말 · 남의 이름 · 원장 쪽 말 빼고), 놀이 낱말도 조회', async () => {
  const { planCandidates, hintWords } = await import('../../src/shared/keywords');
  const rows = ['육아', '키즈카페', '유치원', '유치원운동회', '가을운동회', '어린이집운동회', '유치원매매', '푸르니유치원', '햇살유치원'].map((k, i) => ({ keyword: k, pc: String(1000 - i * 100), mobile: '0', source: 'naver' as const }));
  const c = planCandidates(rows, '운동회 이어달리기', '서울 동작구 신대방동', { name: '신대방햇살유치원', facilityType: '사립(개인)', nearbyAreas: [] }).map((x) => x.keyword);
  assert.deepEqual(c, ['유치원', '유치원운동회', '가을운동회', '햇살유치원']);
  assert.ok(hintWords('블록놀이 하다가 탑을 쌓았어요', '서울 동작구 신대방동').includes('블록놀이'));
});

test('이야기 글은 900자 넘으면 "짧아요" 경고 없음', async () => {
  const { localFlags } = await import('../../src/shared/validation');
  const doc = { titleCandidates: ['t'], sections: [{ id: 's1', paragraphs: ['가'.repeat(1000)] }], tags: [], photoSuggestions: [], reviewFlags: [] };
  assert.ok(!localFlags(doc, DEMO_PROFILE, withStory).some((f) => f.code === 'too-short'));
  assert.ok(localFlags(doc, DEMO_PROFILE, { ...withStory, kind: '수업 후기', facts: { ...withStory.facts, story: '' } }).some((f) => f.code === 'too-short'));
});

test('새 요청(keywords:plan)이 화면 → 앱 허용 목록에 있음 (빠지면 ② 검색어 확인이 늘 실패)', async () => {
  const fs = await import('node:fs');
  assert.match(fs.readFileSync('src/preload/index.ts', 'utf8'), /'keywords:plan'/);
  assert.match(fs.readFileSync('src/main/ipc/index.ts', 'utf8'), /handle\('keywords:plan'/);
});
