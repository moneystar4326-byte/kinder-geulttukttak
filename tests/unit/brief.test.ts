// 짧은 재료로도 일반론 없이 (태권 글뚝딱 2026-10-28 실사용에서 옮김: 재료 한 줄 → 글의 절반이 "처음 등록 안내 · 집에서 살펴볼 것")
// 글 성격 정리 + 주제 설명 글감 → 글감 안에서만 설명 → 지어낸 문장 검사 — 유치원 말로
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyVerifyFixes, generateArticle } from '../../src/main/article';
import { openDb } from '../../src/main/db';
import { articlePrompt, briefPrompt, verifyPrompt } from '../../src/main/services/openai/prompts';
import type { TextAI } from '../../src/main/services/openai';
import { DEMO_PROFILE, demoText } from '../../src/main/services/openai/demo';
import { emptyInput } from '../../src/shared/quickInput';
import { ArticleInputSchema } from '../../src/shared/schemas';
import type { ArticleBrief, ArticleDoc, ArticleInput } from '../../src/shared/types';

const base = emptyInput(DEMO_PROFILE);
const brief: ArticleBrief = {
  purpose: '소식', note: '운동회 이야기를 전하는 소식 글로 준비했어요',
  facts: [
    { text: '보라매공원에서 가을 운동회를 함', quote: '보라매공원 가을 운동회', unclear: false },
    { text: '햇살반 이어달리기 끝까지 5명', quote: '햇살반 이어달리기 끝까지 5명', unclear: true },
  ],
  check: { quote: '햇살반 이어달리기 끝까지 5명', question: '햇살반 친구 5명이 이어달리기를 끝까지 달렸다는 뜻인가요?' },
  notes: ['이어달리기는 친구에게 바통을 건네며 차례를 기다리는 놀이예요.', '만 3~4세는 정해진 선을 따라 끝까지 달리는 것 자체가 큰 도전이에요.'],
  exclude: ['입학 상담 안내', '일반 육아 조언'],
};
const input: ArticleInput = {
  ...base, kind: '교육 정보', topic: '보라매공원 가을 운동회',
  facts: { ...base.facts, story: '보라매공원 가을 운동회 햇살반 이어달리기 끝까지 5명' },
  mainKeyword: '유치원운동회', subKeywords: ['가을운동회'], brief,
};

test('글 성격이 있으면 고른 종류(교육 정보) 대신 소식 흐름 · 글감 · 넣지 않을 것을 지시', () => {
  const p = articlePrompt(DEMO_PROFILE, input, null);
  assert.match(p, /\[구성\] 흐름: 무슨 일이었나/);
  assert.doesNotMatch(p, /\[구성\] 흐름: 학부모 질문/);
  assert.match(p, /\[주제 설명 글감/);
  assert.match(p, /이어달리기는 친구에게/);
  assert.match(p, /\[이 글에 넣지 않을 것\] 입학 상담 안내, 일반 육아 조언/);
  assert.match(p, /공백 제외 900~1200자 목표, 최소 800자. 분량은 주제 설명 글감으로 채우고/);
  assert.match(p, /"원아" · "원생"처럼 딱딱하게 부르지 않는다/);
  assert.match(p, /섹션 3~4개/);
  assert.doesNotMatch(p, /도장|관장|태권|돌려차기|선수/);
});

test('애매한 숫자: 원장님 · 선생님이 "맞아요" 해야 숫자를 씀, 답이 없거나 빼기면 쓰지 않음', () => {
  assert.match(articlePrompt(DEMO_PROFILE, input, null), /끝까지 5명 \(숫자가 어디에 붙는지 확인 안 됨 — 인원 · 숫자는 쓰지 않는다\)/);
  const yes = articlePrompt(DEMO_PROFILE, { ...input, brief: { ...brief, answer: '맞아요' } }, null);
  assert.match(yes, /- 햇살반 이어달리기 끝까지 5명\n/);
  assert.match(articlePrompt(DEMO_PROFILE, { ...input, brief: { ...brief, answer: '빼기' } }, null), /인원 · 숫자는 쓰지 않는다/);
});

test('이야기가 없으면(한 줄로 쓰기 등) 글 성격이 있어도 예전 지시 그대로', () => {
  const p = articlePrompt(DEMO_PROFILE, { ...input, facts: { ...input.facts, story: '' }, brief }, null);
  assert.doesNotMatch(p, /주제 설명 글감/);
  assert.match(p, /\[구성\] 흐름: 학부모 질문/);
});

test('글 성격 지시: 감정 · 성과를 제안하는 질문 금지, 숫자는 항목과 한 덩어리, 낱말 뜻풀이 글감 금지 (유치원 말로)', () => {
  const p = briefPrompt({ kind: '교육 정보', topic: '운동회', story: '햇살반 5명' });
  assert.match(p, /\[오늘\]/);
  assert.match(p, /고른 글 종류: 교육 정보/);
  assert.match(p, /감정 · 행동 · 성과를 새로 제안하는 질문 금지/);
  assert.match(p, /한 덩어리로 둔다/);
  assert.match(p, /낱말 뜻풀이/);
  assert.match(p, /유치원 교사라면 누구나 동의할/);
  assert.doesNotMatch(p, /도장|관장|태권/);
});

test('검사 지시: 주제 · 유치원 이름 · 검색어 · 글감은 문제가 아님, 검색어 문장은 지우지 않음', () => {
  const doc: ArticleDoc = { titleCandidates: [], sections: [{ id: 's1', paragraphs: ['첫 문장이에요.'] }], tags: [], photoSuggestions: [], reviewFlags: [] };
  const p = verifyPrompt(doc, DEMO_PROFILE, input);
  assert.match(p, /검색어\(유치원운동회, 가을운동회\)/);
  assert.match(p, /검색어가 든 문장은 지우지 말고/);
  assert.match(p, /이어달리기는 친구에게/);
  assert.match(p, /주제: 보라매공원 가을 운동회/);
  assert.match(p, /\[사실 — 유치원\]/);
  assert.doesNotMatch(p, /도장|관장|태권/);
});

test('검사 결과 반영: 그 문장만 바꾸거나 지우고, 검색어 문장은 지우지 않고, 빈 문단 · 섹션은 뺌', () => {
  const doc: ArticleDoc = {
    titleCandidates: ['가'], tags: [], photoSuggestions: [], reviewFlags: [],
    sections: [
      { id: 's1', paragraphs: ['안녕하세요. 며칠 동안 연습한 아이들이 끝까지 달렸어요.'] },
      { id: 's2', heading: '둘', paragraphs: ['이번 가을 운동회 이야기예요.', '이 표현은 순서를 뜻해요.'] },
      { id: 's3', heading: '셋', paragraphs: ['같은 말을 또 해요.'] },
    ],
  };
  const out = applyVerifyFixes(doc, [
    { sentence: '며칠 동안 연습한 아이들이 끝까지 달렸어요.', type: '지어냄', fix: '아이들이 끝까지 달렸어요.' },
    { sentence: '이번 가을 운동회 이야기예요.', type: '해설', fix: '' },
    { sentence: '이 표현은 순서를 뜻해요.', type: '해설', fix: '' },
    { sentence: '같은 말을 또 해요.', type: '되풀이', fix: '' },
    { sentence: '글에 없는 문장이에요.', type: '되풀이', fix: '' },
  ], ['가을운동회']);
  assert.equal(out.sections[0].paragraphs[0], '안녕하세요. 아이들이 끝까지 달렸어요.');
  assert.deepEqual(out.sections[1].paragraphs, ['이번 가을 운동회 이야기예요.']);
  assert.equal(out.sections.length, 2);
});

test('이야기 글: 분량 보완 없이 다듬기 · 흐름 2차 점검 뒤 검사까지, 짧으면 지어내지 않았다는 안내', async () => {
  const db = openDb(':memory:');
  const profile = db.saveProfile(DEMO_PROFILE);
  const art = db.createArticle(profile.id, input, [], false);
  const calls: string[] = [];
  const short: ArticleDoc = { titleCandidates: ['가', '나', '다'], tags: [], photoSuggestions: [], reviewFlags: [], sections: [{ id: 's1', paragraphs: ['짧은 글이에요.'] }, { id: 's2', heading: '둘', paragraphs: ['며칠 동안 연습했어요.'] }] };
  const ai: TextAI = {
    ...demoText, review: async () => [],
    generate: async () => (calls.push('generate'), structuredClone(short)),
    expand: async (d) => (calls.push('expand'), d),
    polish: async (d) => (calls.push('polish'), d),
    proofread: async () => (calls.push('proofread'), []),
    verify: async () => (calls.push('verify'), [{ sentence: '며칠 동안 연습했어요.', type: '지어냄', fix: '' }]),
  };
  const r = await generateArticle({ db, ai, profile }, art.id, { signal: new AbortController().signal, step: () => {} });
  assert.deepEqual(calls, ['generate', 'polish', 'proofread', 'verify']);
  assert.ok(!JSON.stringify(r.version.doc.sections).includes('며칠 동안 연습했어요'));
  assert.ok(r.version.doc.reviewFlags.some((f) => f.code === 'need-more-facts' && /지어내지 않으려고/.test(f.message)));
  assert.ok(!r.version.doc.reviewFlags.some((f) => f.code === 'too-short'));
});

test('검사가 실패해도 글은 저장 (고치지 않은 글 그대로)', async () => {
  const db = openDb(':memory:');
  const profile = db.saveProfile(DEMO_PROFILE);
  const art = db.createArticle(profile.id, input, [], false);
  const ai: TextAI = { ...demoText, review: async () => [], verify: async () => { throw new Error('네트워크'); } };
  const r = await generateArticle({ db, ai, profile }, art.id, { signal: new AbortController().signal, step: () => {} });
  assert.ok(r.version.doc.sections.length > 0);
});

test('입력 형식: 글 성격 통과, 화면 → 앱 허용 목록 · 요청 처리에 article:brief', () => {
  assert.equal(ArticleInputSchema.safeParse({ ...input, brief: { ...brief, answer: '맞아요' } }).success, true);
  assert.equal(ArticleInputSchema.safeParse({ ...input, brief: { ...brief, purpose: '홍보' } }).success, false);
  assert.match(fs.readFileSync('src/preload/index.ts', 'utf8'), /'article:brief'/);
  assert.match(fs.readFileSync('src/main/ipc/index.ts', 'utf8'), /handle\('article:brief'/);
});

// 태권 글뚝딱 2.2.9 (2026-10-28 사용자: 글은 좋은데 카드 문구 · 제목이 문제 — 큰 결과는 빠지고 일반 설명 카드가 우리 일처럼 읽힘)
test('카드: 자세히 쓰기 글은 글 성격대로 역할을 정하고, 있었던 일 중심 · 큰 소식은 제목에', async () => {
  const { cardCopyPrompt, cardOnePrompt, cardCheckPrompt } = await import('../../src/main/services/openai/prompts');
  const doc: ArticleDoc = { titleCandidates: [], sections: [{ id: 's1', paragraphs: ['운동회 이야기예요.'] }], tags: [], photoSuggestions: [], reviewFlags: [] };
  const p = cardCopyPrompt(doc, '제목', input);
  assert.match(p, /카드1 = 있었던 일 중 가장 큰 소식/);
  assert.match(p, /\[있었던 일 — 카드의 중심\]\n- 보라매공원에서 가을 운동회를 함\n/);
  assert.doesNotMatch(p, /끝까지 5명/); // 확인 안 된 숫자는 카드에도 안 씀
  assert.match(p, /가장 큰 소식은 꼭 어느 카드 title/);
  assert.match(p, /일반 설명만으로 카드 한 장을 채우지 않는다/);
  assert.match(p, /\[주제\] 보라매공원 가을 운동회/);
  assert.match(p, /제목과 답 맞추기/); // 유치원판 카드 규칙은 그대로
  assert.doesNotMatch(p, /관장|도장|품새/);
  assert.match(cardOnePrompt(doc, '제목', 1, { title: 'x', sub: 'y', scene: 'z' }, [], input), /2번 카드\(있었던 일 중 나머지 결과/);
  assert.match(cardCheckPrompt(doc, '제목', [], input), /카드1 = 있었던 일 중 가장 큰 소식/);
  // 이야기가 없는 글은 예전 그대로 (고른 종류의 역할)
  const old = cardCopyPrompt(doc, '제목', { ...input, facts: { ...input.facts, story: '' } });
  assert.doesNotMatch(old, /카드1 = 있었던 일 중 가장 큰 소식/);
  assert.doesNotMatch(old, /카드의 중심/);
});

test('주제와 재료가 다르면: 물어볼 말을 받고, 원장님 · 선생님 답은 사실로 · 비우면 이유를 지어내지 않음', () => {
  const q = briefPrompt({ kind: '성장 이야기', topic: '학습지 대신 놀이로 배우는 이유', story: '바깥놀이에서 낙엽을 모음' });
  assert.match(q, /topicGap: 주제에 이유/);
  assert.match(q, /원장님 · 선생님께/);
  assert.doesNotMatch(q, /관장|태권도|도장|보육|입소/);
  const gap = { ...brief, topicGap: '학습지 대신 놀이로 배우게 하시는 이유를 한두 줄 적어 주시겠어요?' };
  assert.match(articlePrompt(DEMO_PROFILE, { ...input, brief: gap }, null), /\[주제와 재료\] 주제에 담긴 이유 · 주장은 재료에 없으니 지어내지 않는다/);
  const answered = articlePrompt(DEMO_PROFILE, { ...input, brief: { ...gap, topicAnswer: '스스로 해 보며 배우는 힘을 기르려고요' } }, null);
  assert.match(answered, /- 원장님 · 선생님 설명 \(주제에 대해[^\n]*스스로 해 보며/);
  assert.doesNotMatch(answered, /\[주제와 재료\]/);
  assert.equal(ArticleInputSchema.safeParse({ ...input, brief: { ...gap, topicAnswer: '스스로 해 보며' } }).success, true);
});

// 2026-10-28 사용자: 600자는 짧다 → 글감으로 900자 안팎, ② 단계 물음에 답하면 1,200~1,500자
test('재료가 짧으면 물음을 받고, 답은 사실로 · 답이 있으면 목표 분량이 늘어남', async () => {
  const { cardCopyPrompt } = await import('../../src/main/services/openai/prompts');
  assert.match(briefPrompt({ kind: '교육 정보', topic: '가을 운동회', story: '이어달리기' }), /- asks: 재료에 장면/);
  const asked = { ...brief, asks: [{ question: '이어달리기 때 아이들은 바통을 어떻게 건넸나요?', answer: '서로 이름을 불러 주며 건넸어요' }, { question: '운동회에서 기억나는 장면이 있나요?' }] };
  const p = articlePrompt(DEMO_PROFILE, { ...input, brief: asked }, null);
  assert.match(p, /공백 제외 1200~1500자 목표/);
  assert.match(p, /- 서로 이름을 불러 주며 건넸어요 \(물음 "이어달리기 때 아이들은 바통을 어떻게 건넸나요\?"에 원장님 · 선생님이 적은 답\)/);
  assert.doesNotMatch(p, /운동회에서 기억나는 장면/); // 답 없는 물음은 글에 안 감
  const doc: ArticleDoc = { titleCandidates: [], sections: [{ id: 's1', paragraphs: ['가'] }], tags: [], photoSuggestions: [], reviewFlags: [] };
  assert.match(cardCopyPrompt(doc, 't', { ...input, brief: asked }), /서로 이름을 불러 주며 건넸어요/);
  assert.equal(ArticleInputSchema.safeParse({ ...input, brief: asked }).success, true);
});

// 2026-10-28 유치원판 시험: 흐름 2차 점검이 "~해 볼 수 있어요"를 "~해요"로 바꾸자 지어낸 문장 검사가 22곳을 지움 (1,131자 → 623자)
// · 물음에 적은 답을 사실 점검이 "사실에 없다"고 경고
test('이야기 글: 흐름 점검은 일반 설명을 단정문으로 바꾸지 않고, 사실 점검은 물음 답 · 주제 설명을 사실로 봄', async () => {
  const { proofreadPrompt, reviewPrompt } = await import('../../src/main/services/openai/prompts');
  const doc: ArticleDoc = { titleCandidates: [], sections: [{ id: 's1', paragraphs: ['가'] }], tags: [], photoSuggestions: [], reviewFlags: [] };
  const story = proofreadPrompt(doc, input);
  assert.match(story, /우리 아이들이 실제로 한 일 · 느낀 것처럼 바꾸지 않는다/);
  assert.doesNotMatch(story, /담백한 단정문으로/);
  const quick = proofreadPrompt(doc, { ...input, facts: { ...input.facts, story: '' } });
  assert.match(quick, /담백한 단정문으로/); // 한 줄로 쓰기 글은 그대로
  const asked = { ...brief, asks: [{ question: '왕관은 어떻게 했나요?', answer: '동생 반에 선물하고 싶다고 했어요' }], topicAnswer: '스스로 해 보며 배우게 하려고요' };
  const r = reviewPrompt(doc, DEMO_PROFILE, { ...input, brief: asked });
  assert.match(r, /- 동생 반에 선물하고 싶다고 했어요 \(물음 "왕관은 어떻게 했나요\?"에 원장님 · 선생님이 적은 답\)/);
  assert.match(r, /- 원장님 · 선생님 설명: 스스로 해 보며 배우게 하려고요/);
  assert.doesNotMatch(reviewPrompt(doc, DEMO_PROFILE, { ...input, brief: asked, facts: { ...input.facts, story: '' } }), /동생 반에 선물/);
});
