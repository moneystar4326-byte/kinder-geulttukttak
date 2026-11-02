// 글이 어색해지던 것 고침 (2026-11-02): 줄 끊는 자리 · 재료가 적을 때 분량 · 몰린 말 세기 · 만들기 전 물음
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortLines } from '../../src/shared/format';
import { materialChars, minCharsForInput, targetRangeForInput, thinMaterial } from '../../src/shared/count';
import { overusedLine, overusedWords } from '../../src/shared/overused';
import { needsMoreMemo } from '../../src/shared/quickInput';
import { polishPrompt } from '../../src/main/services/openai/prompts';

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

test('재료가 적으면 글도 짧게, 많으면 그대로', () => {
  assert.equal(minCharsForInput(input('한복 입고 전통놀이 했어요')), 800);
  assert.deepEqual(targetRangeForInput(input('한복 입고 전통놀이 했어요')), [900, 1200]);
  assert.equal(minCharsForInput(input('가'.repeat(150))), 1000);
  assert.equal(minCharsForInput(input('가'.repeat(300))), 1500);
  assert.equal(minCharsForInput(input('가'.repeat(300), '행사 안내')), 1000);
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
  assert.equal(needsMoreMemo('가'.repeat(120)), false);
  assert.equal(needsMoreMemo(''), false);
});
