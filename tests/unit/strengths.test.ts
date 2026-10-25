import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeClassFeatures, uncheckedMentions } from '../../src/shared/strengths';

test('칸을 모아 수업 특징 한 덩어리로', () => {
  const t = composeClassFeatures({ hours: '평일 12:00~20:00', classes: '정규반 1~5시부', promoDay: '매달 마지막 주 금요일', strengths: ['kinder', 'pickup'], strengthsEtc: '인성교육', otherFacts: '픽업은 상담 때 안내' });
  assert.match(t, /운영 시간: 평일 12:00~20:00/);
  assert.match(t, /유치부반, 등하원 픽업, 인성교육/);
  assert.match(t, /픽업은 상담 때 안내$/);
});

test('체크하지 않은 서비스가 글에 나오면 경고, 체크했거나 운영 사실에 있으면 괜찮음', () => {
  const p = { strengths: ['kinder', 'pickup'], otherFacts: '' };
  assert.equal(uncheckedMentions('차량 운행으로 편하게 오세요', p).length, 1);
  assert.equal(uncheckedMentions('유치원 버스에서 픽업해 드려요', p).length, 0);
  assert.equal(uncheckedMentions('무료 체험 수업을 신청하세요', { ...p, otherFacts: '1일 체험 수업 가능' }).length, 0);
  assert.equal(uncheckedMentions('차량 운행', { otherFacts: '' }).length, 0); // 칸으로 나누기 전 자료는 검사 안 함
});
