// 흐름 2차 점검 (2026-10-27 요요유치원 보라매공원 글: 억지 이음 문장 · 해요/합니다 섞임 · 어울리지 않는 낱말 · 메모 통째 키워드)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFixes, generateArticle } from '../../src/main/article';
import { openDb } from '../../src/main/db';
import { demoText, DEMO_INPUT, DEMO_PROFILE } from '../../src/main/services/openai/demo';
import type { TextAI } from '../../src/main/services/openai';
import * as P from '../../src/main/services/openai/prompts';
import { buildQuickInput, thinMemo } from '../../src/shared/quickInput';
import { fallbackKeyword, withKeywordFallback } from '../../src/shared/validation';
import type { ArticleDoc } from '../../src/shared/types';

const doc = (): ArticleDoc => ({
  titleCandidates: ['제목'], tags: [], photoSuggestions: [], reviewFlags: [],
  sections: [
    { id: 's1', paragraphs: ['아이들과 공원에 갔어요. 저도 이런 표현에 마음을 둡니다.'] },
    { id: 's2', heading: '둘', paragraphs: ['필요한 도움을 생각하다 보면 친구들도 보게 돼요. 함께 놀았어요.', '마지막 문단이에요.'] },
  ],
});

test('고칠 문장만 바꾸고, 없는 문장 · 새 숫자는 건너뜀', () => {
  const r = applyFixes(doc(), [
    { sectionId: 's1', before: '저도 이런 표현에 마음을 둡니다.', after: '저도 아이들의 이런 모습을 눈여겨봐요.' },
    { sectionId: 's1', before: '글에 없는 문장이에요.', after: '바꿈' },
    { sectionId: 's2', before: '함께 놀았어요.', after: '10명이 함께 놀았어요.' }, // 사실에 없는 숫자
  ], 0);
  assert.equal(r.count, 1);
  assert.equal(r.doc.sections[0].paragraphs[0], '아이들과 공원에 갔어요. 저도 아이들의 이런 모습을 눈여겨봐요.');
  assert.equal(r.doc.sections[1].paragraphs[0], '필요한 도움을 생각하다 보면 친구들도 보게 돼요. 함께 놀았어요.');
});

test('억지 이음 문장은 지울 수 있고(빈 after), 섹션 id가 틀려도 글 전체에서 찾음', () => {
  const r = applyFixes(doc(), [{ sectionId: 's9', before: '필요한 도움을 생각하다 보면 친구들도 보게 돼요.', after: '' }], 0);
  assert.equal(r.count, 1);
  assert.equal(r.doc.sections[1].paragraphs[0], '함께 놀았어요.');
});

test('지워서 분량이 기준 아래로 내려가면 그 고침은 건너뜀', () => {
  const r = applyFixes(doc(), [{ sectionId: 's2', before: '마지막 문단이에요.', after: '' }], 60);
  assert.equal(r.count, 0);
  assert.equal(r.doc.sections[1].paragraphs.length, 2);
});

const fakeAI = (over: Partial<TextAI>): TextAI & { calls: string[] } => {
  const calls: string[] = [];
  const base: TextAI = { ...demoText, review: async () => [], ...over };
  const out = Object.fromEntries(Object.entries(base).map(([k, f]) => [k, (...a: any[]) => { calls.push(k); return (f as any)(...a); }])) as unknown as TextAI;
  return Object.assign(out, { calls });
};
const setup = () => {
  const db = openDb(':memory:');
  const profile = db.saveProfile(DEMO_PROFILE);
  return { db, profile, art: db.createArticle(profile.id, DEMO_INPUT, [], false) };
};
const ctx = () => ({ signal: new AbortController().signal, step: () => {} });

test('글 만들기: 다듬기 다음 2차 점검 한 번, 고친 수를 버전 메모에', async () => {
  const { db, profile, art } = setup();
  const first = (await demoText.generate(profile, DEMO_INPUT, null)).sections[0].paragraphs[0];
  const sentence = first.split(/(?<=[.!?])\s+/)[0];
  const ai = fakeAI({ proofread: async () => [{ sectionId: 's1', before: sentence, after: '바꾼 첫 문장이에요.' }] });
  const r = await generateArticle({ db, ai, profile }, art.id, ctx());
  assert.deepEqual(ai.calls.filter((c) => c === 'polish' || c === 'proofread' || c === 'review'), ['polish', 'proofread', 'review']);
  assert.match(r.version.doc.sections[0].paragraphs[0], /^바꾼 첫 문장이에요\./);
  assert.match(r.version.note ?? '', /흐름 2차 점검 1곳/);
});

test('2차 점검이 실패하면 다듬은 글 그대로, 멈추기는 그대로 멈춤', async () => {
  const { db, profile, art } = setup();
  const r = await generateArticle({ db, ai: fakeAI({ proofread: async () => { throw new Error('형식 오류'); } }), profile }, art.id, ctx());
  assert.ok(r.version.doc.sections.length > 0);
  const s = setup();
  const ac = new AbortController();
  const ai = fakeAI({ proofread: async () => { ac.abort(); throw Object.assign(new Error('멈춤'), { name: 'AbortError' }); } });
  await assert.rejects(generateArticle({ db: s.db, ai, profile: s.profile }, s.art.id, { signal: ac.signal, step: () => {} }));
});

test('2차 점검 지시문: 어색한 낱말 · 억지 이음 · 말투 섞임 · 반복 · 추측, 사실은 그대로', () => {
  const p = P.proofreadPrompt(doc(), DEMO_INPUT);
  for (const w of ['어울리지 않는', '이음', '합니다', '반복', '추측', '사실']) assert.match(p, new RegExp(w));
  assert.match(P.SYSTEM_RULES, /해요체/);
});

test('키워드를 못 고르면 메모 통째 대신 "동네 유치원"', () => {
  assert.equal(fallbackKeyword('서울 동작구 신대방동', '장미반 아이들과 함께 보라매공원으로 소풍갔어요'), '신대방동 유치원');
  assert.equal(fallbackKeyword('', '숲 체험'), '숲 체험');
  const q = buildQuickInput({ memo: '장미반 아이들과 함께 보라매공원으로 소풍갔어요', profile: { ...DEMO_PROFILE, region: '서울 동작구 신대방동' } as any, withCards: false, titlePrefix: '' });
  assert.equal(q.mainKeyword, '신대방동 유치원');
  assert.equal(buildQuickInput({ memo: '소풍', profile: null, main: '보라매공원 소풍', withCards: false, titlePrefix: '' }).mainKeyword, '보라매공원 소풍');
  assert.equal(withKeywordFallback({ ...DEMO_INPUT, mainKeyword: '', region: '서울 마포구 망원동' }).mainKeyword, '망원동 유치원');
});

test('메모가 한 줄뿐이면 얇은 메모', () => {
  assert.equal(thinMemo('장미반 아이들과 함께 보라매공원으로 소풍갔어요'), true);
  assert.equal(thinMemo('장미반 아이들과 보라매공원으로 소풍 갔어요. 분수대 앞에서 비눗방울을 불고 도시락을 먹었어요.'), false);
  assert.equal(thinMemo(''), false);
});
