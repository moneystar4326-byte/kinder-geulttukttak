import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bodyText, countChars, countDoc, MIN_CHARS } from '../../src/shared/count';
import { demoText } from '../../src/main/services/openai/demo';
import { DEMO_INPUT, DEMO_PROFILE } from '../../src/main/services/openai/demo';

test('한글 · 공백 · 줄바꿈', () => {
  assert.deepEqual(countChars('태권도 품새'), { withSpaces: 6, withoutSpaces: 5 });
  assert.deepEqual(countChars('가\n나\r\n다'), { withSpaces: 3, withoutSpaces: 3 });
  assert.deepEqual(countChars('가  나　다\t라'), { withSpaces: 8, withoutSpaces: 4 });
});

test('이모지 · 조합 문자는 한 글자', () => {
  assert.equal(countChars('👍🏽').withoutSpaces, 1);
  assert.equal(countChars('👨‍👩‍👧').withoutSpaces, 1);
  assert.equal(countChars('🥋품새').withoutSpaces, 3);
  // 자모로 나뉜 한글(NFD)도 NFC 로 합쳐서 셈
  assert.equal(countChars('한글'.normalize('NFD')).withoutSpaces, 2);
});

test('폭 없는 문자는 세지 않음', () => {
  assert.equal(countChars('가​나﻿').withSpaces, 2);
});

test('제목 후보 · 태그 · 사진 안내는 본문 계수에서 제외', () => {
  const doc = {
    titleCandidates: ['아주 긴 제목 후보 하나', '둘', '셋'],
    sections: [{ id: 's1', heading: '소제목', paragraphs: ['본문 문단'] }],
    tags: ['태그하나', '태그둘'],
    photoSuggestions: [{ afterSectionId: 's1', caption: '사진 설명' }],
    reviewFlags: [],
  };
  assert.equal(bodyText(doc), '소제목\n본문 문단');
  assert.equal(countDoc(doc).withoutSpaces, 7);
});

test('데모 샘플 글은 공백 제외 1,500자 이상', async () => {
  const doc = await demoText.generate(DEMO_PROFILE, DEMO_INPUT, null);
  const n = countDoc(doc).withoutSpaces;
  assert.ok(n >= MIN_CHARS, `데모 글 ${n}자`);
  assert.equal(doc.titleCandidates.length, 3);
});

// 행사 · 모집 안내는 최소 1,000자 (2026-10-18)
import { minCharsFor, targetRangeFor } from '../../src/shared/count';
test('글 종류별 최소 분량', () => {
  assert.equal(minCharsFor('행사 안내'), 1000);
  assert.equal(minCharsFor('모집 안내'), 1000);
  assert.equal(minCharsFor('수업 후기'), 1500);
  assert.equal(minCharsFor(undefined), 1500);
  assert.deepEqual(targetRangeFor('행사 안내'), [1200, 1600]);
});
