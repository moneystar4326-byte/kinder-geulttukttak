// 글이 어색해지던 것 고침 (2026-11-02): 줄 끊는 자리 · 재료가 적을 때 분량 · 몰린 말 세기 · 만들기 전 물음
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortLines } from '../../src/shared/format';
import { materialChars, minCharsForInput, targetRangeForInput, thinMaterial } from '../../src/shared/count';
import { overusedLine, overusedWords, styleIssues } from '../../src/shared/overused';
import { needsMoreMemo } from '../../src/shared/quickInput';
import { articlePrompt, polishPrompt } from '../../src/main/services/openai/prompts';
import { acceptWarm, applyVerifyFixes } from '../../src/main/article';
import { parsePlainDoc } from '../../src/shared/plainDoc';
import { DEMO_INPUT, DEMO_PROFILE } from '../../src/main/services/openai/demo';

const noBad = (t: string) => {
  for (const line of t.split('\n')) {
    assert.doesNotMatch(line, /(^|\s)(한|이어)$/, line);
    assert.doesNotMatch(line, /^(가지|가기|아니라)(\s|$)/, line);
  }
};

test('말 묶음 사이에서 줄을 끊지 않음', () => {
  noBad(shortLines('참여하는 모습이 서로 다르더라도 한 가지 기준으로 비교하지 않으려 해요.'));
  noBad(shortLines('그럴 때 규칙은 놀이를 이어 가기 위한 약속이 돼요.'));
  noBad(shortLines('여럿이 먹는 자리에서는 음식뿐 아니라 공간도 함께 나눠요.'));
});

test('끊어도 글자는 그대로', () => {
  const s = '가정에서도 추석 행사에서 무엇이 기억에 남는지 한 번 물어봐 주세요.';
  assert.equal(shortLines(s).replace(/\n/g, ' '), s);
});

const input = (activities: string, kind = '수업 후기', story = '') => ({ kind, facts: { activities, story, scenes: '', event: { when: '' } } });

test('재료 길이와 상관없이 최소 500자, 목표 700~1,000자', () => {
  assert.equal(minCharsForInput(input('한복 입고 전통놀이 했어요')), 500);
  assert.deepEqual(targetRangeForInput(input('한복 입고 전통놀이 했어요')), [700, 1000]);
  assert.equal(minCharsForInput(input('가'.repeat(150))), 500);
  assert.equal(minCharsForInput(input('가'.repeat(300))), 500);
});

test('교육 정보 · 이야기 글은 재료 길이로 줄이지 않음', () => {
  assert.equal(thinMaterial(input('몇 살부터 시작하나요', '교육 정보')), false);
  assert.equal(minCharsForInput(input('몇 살부터 시작하나요', '교육 정보')), 1500);
  assert.equal(thinMaterial(input('', '수업 후기', '이야기')), false);
});

test('중첩된 칸도 재료로 셈', () => {
  assert.equal(materialChars({ facts: { activities: '가 나', event: { when: '다' } } as any }), 3);
});

const docOf = (t: string) => ({ sections: [{ id: 's1', paragraphs: [t] }] });

test('몰린 말을 세어 지시에 넣음', () => {
  const doc = docOf('살펴봐요. 살펴요. 살피고. 살펴봐요. 살펴봐요.');
  assert.deepEqual(overusedWords(doc), [{ word: '살펴 · 살피', count: 5 }]);
  assert.match(overusedLine(doc), /"살펴 · 살피" 5번/);
  assert.equal(overusedLine(docOf('살펴봐요. 지켜봐요.')), '');
  const p = polishPrompt({ titleCandidates: ['t'], tags: [], photoSuggestions: [], reviewFlags: [], ...doc } as any, { topic: 't', mainKeyword: 'k', subKeywords: [], kind: '수업 후기', facts: { activities: 'x' } } as any);
  assert.match(p, /꼭 줄일 말/);
});

test('짧은 메모는 만들기 전에 물음, 교육 정보 · 긴 메모는 묻지 않음', () => {
  assert.equal(needsMoreMemo('한복 입고 전통놀이 하고 뷔페 먹었어요'), true);
  assert.equal(needsMoreMemo('몇 살부터 시작하면 좋을까요?'), false);
  assert.equal(needsMoreMemo('가'.repeat(120)), true);
  assert.equal(needsMoreMemo('가'.repeat(400)), false);
  assert.equal(needsMoreMemo(''), false);
});

test('줄글을 소제목으로 나누고 문장은 그대로', () => {
  const t = '도입 문장이에요.\n\n## 첫 소제목\n첫 문단이에요.\n\n둘째 문단이에요.\n\n## **둘째 소제목**\n마지막 문단이에요.';
  assert.deepEqual(parsePlainDoc(t), [
    { id: 's1', heading: '', paragraphs: ['도입 문장이에요.'] },
    { id: 's2', heading: '첫 소제목', paragraphs: ['첫 문단이에요.', '둘째 문단이에요.'] },
    { id: 's3', heading: '둘째 소제목', paragraphs: ['마지막 문단이에요.'] },
  ]);
});

test('글 지시에 말투 예시, 평소 글은 있을 때만', () => {
  const p = articlePrompt(DEMO_PROFILE, DEMO_INPUT, null);
  assert.match(p, /\[글의 목소리\]/);
  assert.match(p, /고무장갑은 왜 자꾸 벗겨졌을까요/);
  assert.doesNotMatch(p, /이 유치원의 평소 글/);
  assert.match(articlePrompt({ ...DEMO_PROFILE, voiceSamples: '오늘도 아이들과 즐거웠어요.' }, DEMO_INPUT, null), /이 유치원의 평소 글[\s\S]*오늘도 아이들과 즐거웠어요/);
});

test('문장을 지우고 이모지만 남은 문단은 뺌', () => {
  const doc = { titleCandidates: ['t'], tags: [], photoSuggestions: [], reviewFlags: [], sections: [{ id: 's1', heading: '', paragraphs: ['지어낸 문장이에요. 🌱', '남는 문장이에요.'] }] };
  assert.deepEqual(applyVerifyFixes(doc, [{ sentence: '지어낸 문장이에요.', type: '지어냄', fix: '' }]).sections[0].paragraphs, ['남는 문장이에요.']);
});

const base = { titleCandidates: ['t'], tags: [], photoSuggestions: [], reviewFlags: [], sections: [{ id: 's1', heading: '', paragraphs: ['챈트 2곡과 동요 2곡을 불렀어요. 신대방동 유치원 이야기예요.'] }, { id: 's2', heading: '소제목', paragraphs: ['발표를 했어요.'] }] };
const sec = (a: string, h = '바뀐 소제목') => [{ id: 's1', heading: '', paragraphs: [a] }, { id: 's2', heading: h, paragraphs: ['발표를 하고 상장도 봤어요.'] }];

test('호흡 다듬기: 소제목은 그대로, 조건이 맞으면 씀', () => {
  const ok = acceptWarm(base, sec('챈트 2곡과 동요 2곡을 함께 불렀어요. 신대방동 유치원 이야기예요.'), ['신대방동유치원']);
  assert.equal(ok?.sections[1].heading, '소제목');
  assert.match(ok!.sections[0].paragraphs[0], /함께 불렀어요/);
});

test('호흡 다듬기: 숫자가 바뀌거나 검색어 · 분량 · 소제목 수가 줄면 버림', () => {
  assert.equal(acceptWarm(base, sec('챈트 3곡과 동요 2곡을 함께 불렀어요. 신대방동 유치원 이야기예요.')), null);
  assert.equal(acceptWarm(base, sec('챈트와 동요를 함께 불렀어요. 신대방동 유치원 이야기예요.')), null);
  assert.equal(acceptWarm(base, sec('챈트 2곡과 동요 2곡을 함께 불렀어요. 저희 유치원 이야기예요.'), ['신대방동유치원']), null);
  assert.equal(acceptWarm(base, sec('챈트 2곡과 동요 2곡을 함께 불렀어요.'), [], '신대방동 유치원 챈트 동요 이야기 발표'), null);
  assert.equal(acceptWarm(base, [sec('챈트 2곡과 동요 2곡을 불렀어요. 신대방동 유치원 이야기예요.')[0]]), null);
});

const para = (t: string) => ({ sections: [{ id: 's1', heading: '', paragraphs: [t] }] });

test('말투 점검: 질문 수와 "~했어요" 연속을 셈', () => {
  assert.deepEqual(styleIssues(para('왜 그랬을까요? 손이 작았거든요. 어땠을까요? 웃었답니다.')), []);
  assert.match(styleIssues(para('왜 그랬을까요? 손이 작았거든요.'))[0], /질문이 1개/);
  assert.match(styleIssues(para('가요? 나요? 다요? 라요?'))[0], /질문이 4개/);
  assert.ok(styleIssues(para('왜일까요? 어땠을까요? 먹었어요. 놀았어요. 했어요. 달렸어요.')).length === 0);
  assert.match(styleIssues(para('왜일까요? 어땠을까요? 공을 했어요. 춤을 했어요. 노래를 했어요.')).join(), /3번 이어져요/);
  assert.equal(styleIssues(para('설명 글이에요.'), '교육 정보').length, 0);
});

test('호흡 다듬기: 문제가 남으면 지적을 넣어 한 번만 더', async () => {
  const { warmDoc } = await import('../../src/main/article');
  const notes: (string | undefined)[] = [];
  const doc = { titleCandidates: ['t'], tags: [], photoSuggestions: [], reviewFlags: [], sections: [{ id: 's1', heading: '', paragraphs: ['놀이를 했어요.'] }] };
  const ai: any = { warm: async (_d: unknown, _p: unknown, _i: unknown, _o: unknown, note?: string) => (notes.push(note), [{ id: 's1', heading: '', paragraphs: ['놀이를 즐겼어요.'] }]) };
  await warmDoc(ai, doc as any, DEMO_PROFILE, { ...DEMO_INPUT, mainKeyword: '', subKeywords: [] }, {}, new AbortController().signal);
  assert.equal(notes.length, 2);
  assert.equal(notes[0], undefined);
  assert.match(notes[1]!, /질문이 0개/);
});

test('메모가 짧고 답이 없으면 글을 만들지 않음, 답 하나나 긴 메모면 만듦', async () => {
  const { thinMemoBlocked } = await import('../../src/shared/quickInput');
  assert.equal(thinMemoBlocked('가을 소풍으로 보라매공원에 다녀왔어요', ['', ' ']), true);
  assert.equal(thinMemoBlocked('가을 소풍으로 보라매공원에 다녀왔어요', ['', '낙엽을 주웠어요']), false);
  assert.equal(thinMemoBlocked('가'.repeat(120), []), false);
});

test('예고 · 정리 · 뜻풀이 문장을 찾아 다듬기에 넘김 (2026-11-16 사용자: 사진 글 흐름이 어색함)', async () => {
  const { styleIssues } = await import('../../src/shared/overused');
  const doc = (t: string) => ({ sections: [{ id: 's1', heading: '', paragraphs: [t] }] });
  for (const bad of ['학부모님께 작은 일상을 전해 드려요.', '사진과 함께 오늘의 이야기를 만나 보셨나요?', '오늘은 줄넘기 이야기를 함께 나눠요.', '놀이할 때 쓴 물건을 제자리에 돌려놓는 일이에요.', '직접 정리해 보는 것도 일상에서 해 보는 경험이에요.', '하원은 하루의 생활에서 가정으로 자리를 옮기는 때예요.'])
    assert.ok(styleIssues(doc(bad), '수업 후기', 0).some((x) => x.startsWith('정리만 하는 문장')), bad);
  assert.ok(!styleIssues(doc('줄넘기를 다 하고 나서는 스스로 줄을 감았어요.'), '수업 후기', 0).some((x) => x.startsWith('정리만 하는 문장')));
});
