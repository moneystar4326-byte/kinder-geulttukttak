// 한 줄 모드 글 종류 · 마무리 · 행사 일시 (2026-10-18)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quickEnding, quickKind, quickWhen } from '../../src/shared/quick';

test('한 줄 메모로 글 종류 정하기', () => {
  assert.equal(quickKind('2026년 10월 23일 금요일부터 24일 토요일 친구 가족 동생과 함께 1박 2일 합숙'), '행사 안내');
  assert.equal(quickKind('10월 30일 금요일 승급심사 안내'), '행사 안내');
  assert.equal(quickKind('유치부 태권도 몇 살부터 시작하면 좋을까요?'), '교육 정보');
  assert.equal(quickKind('11월 신규 원생 체험 수업 모집'), '모집 안내');
  assert.equal(quickKind('품새 대회 나가서 1학년 친구들이 단체 3등 했어요'), '수업 후기');
  assert.equal(quickKind('오늘 발차기 기본기 수업'), '수업 후기');
  assert.equal(quickKind('신대방동 초등학생 줄넘기반 안내'), '수업 후기');
});

test('행사 · 모집은 도장 홍보 대신 인사 · 상담 안내로 마무리', () => {
  assert.equal(quickEnding('행사 안내'), '마무리 인사만');
  assert.equal(quickEnding('모집 안내'), '상담 안내로 마무리');
  assert.equal(quickEnding('수업 후기'), '도장 소개로 마무리');
});

test('메모의 날짜 · 기간만 그대로 뽑음', () => {
  assert.equal(quickWhen('2026년 10월 23일 금요일부터 24일 토요일 친구 가족 동생과 함께 1박 2일 합숙'), '2026년 10월 23일 금요일부터 24일 토요일 · 1박 2일');
  assert.equal(quickWhen('10월 30일 금요일 승급심사'), '10월 30일 금요일');
  assert.equal(quickWhen('다음 주 합숙'), '');
});
