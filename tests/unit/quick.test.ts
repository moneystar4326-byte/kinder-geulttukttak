// 한 줄 모드 글 종류 · 마무리 · 행사 일시 (태권 글뚝딱 2026-10-18 규칙, 어린이집 말로)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quickEnding, quickKind, quickWhen } from '../../src/shared/quick';

test('한 줄 메모로 글 종류 정하기', () => {
  assert.equal(quickKind('2026년 10월 30일 금요일 할로윈 파티'), '행사 안내');
  assert.equal(quickKind('다음 주 생일잔치 안내'), '행사 안내');
  assert.equal(quickKind('만 1세 어린이집 적응 기간은 얼마나 걸릴까요?'), '교육 정보');
  assert.equal(quickKind('2027년 3월 입소 상담 안내'), '모집 안내');
  assert.equal(quickKind('신입 원아 모집'), '모집 안내');
  assert.equal(quickKind('생일잔치에서 케이크 촛불을 불었어요'), '수업 후기'); // 이미 지난 행사는 후기
  assert.equal(quickKind('오늘 밀가루 촉감놀이'), '수업 후기');
});

test('행사 · 입소는 어린이집 홍보 대신 인사 · 상담 안내로, 선생님 글은 가정에서 해 볼 것으로 마무리', () => {
  assert.equal(quickEnding('행사 안내'), '마무리 인사만');
  assert.equal(quickEnding('모집 안내'), '입소 상담 안내로 마무리');
  assert.equal(quickEnding('수업 후기'), '어린이집 소개로 마무리');
  assert.equal(quickEnding('수업 후기', true), '가정에서 해 볼 것으로 마무리');
});

test('메모의 날짜 · 기간만 그대로 뽑음', () => {
  assert.equal(quickWhen('2026년 10월 23일 금요일부터 24일 토요일 가족 캠프'), '2026년 10월 23일 금요일부터 24일 토요일');
  assert.equal(quickWhen('10월 30일 금요일 생일잔치'), '10월 30일 금요일');
  assert.equal(quickWhen('다음 주 소풍'), '');
});
