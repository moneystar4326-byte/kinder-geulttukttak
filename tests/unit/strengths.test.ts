import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeClassFeatures, STRENGTHS, uncheckedMentions } from '../../src/shared/strengths';

test('칸을 모아 보육 특징 한 덩어리로', () => {
  const t = composeClassFeatures({ hours: '기본보육 07:30~16:00', classes: '햇님반 만 1세', promoDay: '매달 마지막 주 금요일 생일잔치', strengths: ['extended', 'meal'], strengthsEtc: '텃밭 가꾸기', otherFacts: '연장보육은 신청한 가정만' });
  assert.match(t, /운영 시간: 기본보육 07:30~16:00/);
  assert.match(t, /정기 행사: 매달 마지막 주 금요일 생일잔치/);
  assert.match(t, /우리 어린이집에서 실제로 하는 것 .*연장보육, 자체 조리 급식, 텃밭 가꾸기/);
  assert.match(t, /연장보육은 신청한 가정만$/);
});

test('체크하지 않은 서비스가 글에 나오면 경고, 체크했거나 운영 사실에 있으면 괜찮음', () => {
  const p = { strengths: ['extended', 'meal'], otherFacts: '' };
  assert.deepEqual(uncheckedMentions('차량 운행으로 편하게 오세요', p), ['어린이집 정보에서 체크하지 않은 "차량 운행" 이야기가 글에 있어요. 실제로 하는 게 아니면 빼고 올려 주세요.']);
  assert.equal(uncheckedMentions('연장보육도 있어요', p).length, 0);
  assert.equal(uncheckedMentions('숲 체험을 다녀왔어요', { ...p, otherFacts: '매주 숲 체험' }).length, 0);
  assert.equal(uncheckedMentions('차량 운행', { otherFacts: '' }).length, 0); // 칸으로 나누기 전 자료는 검사 안 함
  assert.ok(!STRENGTHS.some((s) => /시범단|국기원|줄넘기|품새/.test(s.label))); // 태권도 항목 없음
});
