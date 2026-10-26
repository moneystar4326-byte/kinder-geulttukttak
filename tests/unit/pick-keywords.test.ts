import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hintWords, pickKeywords, regionWords, topicTerms } from '../../src/shared/keywords';
import type { KeywordRow } from '../../src/shared/types';

const row = (keyword: string, pc: string, mobile: string): KeywordRow => ({ keyword, pc, mobile, source: 'naver' });

test('메모에서 주제 낱말 · 지역 이름', () => {
  assert.deepEqual(topicTerms('적응기간 동안 낮잠을 잘 잤어요'), ['적응기간', '낮잠']); // "적응"은 "적응기간"과 겹쳐 뺌
  assert.deepEqual(topicTerms('배변훈련 시작'), ['배변훈련']);
  assert.deepEqual(regionWords('서울 동작구 신대방동'), ['신대방동', '신대방', '동작구', '동작']);
  assert.deepEqual(hintWords('낮잠 시간', '서울 동작구 신대방동'), ['어린이집', '신대방동어린이집', '어린이집낮잠']);
  assert.deepEqual(hintWords('생일잔치 했어요', '서울 동작구 신대방동'), ['어린이집', '신대방동어린이집', '생일잔치', '어린이집생일잔치']);
});

test('주제가 드러나는 키워드를 주요로, 지역 키워드를 보조로, 아이와 상관없는 넓은 말 · 다른 지역은 뺌', () => {
  const rows = [
    row('어린이집', '9000', '40000'),
    row('낮잠', '9000', '20000'), // 넓은 말 (어린이집 · 아이 말이 없음)
    row('어린이집낮잠', '30', '300'),
    row('신대방동어린이집', '40', '200'),
    row('대치동어린이집', '50', '500'),
  ];
  const r = pickKeywords(rows, '낮잠 시간이 길어졌어요', '서울 동작구 신대방동');
  assert.equal(r.main, '어린이집낮잠');
  assert.deepEqual(r.subs, ['신대방동어린이집']);
});

test('주제 낱말이 없으면 어린이집 관련 중 검색량 큰 것', () => {
  const r = pickKeywords([row('어린이집', '9000', '40000'), row('어린이집추천', '310', '2420'), row('아디다스', '9000', '9000')], '오늘 아이들이 즐거웠어요', '서울 동작구 신대방동');
  assert.equal(r.main, '어린이집');
  assert.deepEqual(r.subs, ['어린이집추천']); // 상표처럼 상관없는 큰 검색어(아디다스)는 빠짐
});

test('조회 결과가 비면 빈 값 (주제로 대신)', () => {
  assert.deepEqual(pickKeywords([], '생일잔치', '서울 동작구 신대방동'), { main: '', subs: [] });
});

test('주제 낱말에 맞는 검색어가 하나도 없으면 주제 그대로 (엉뚱한 큰 검색어 X)', () => {
  const r = pickKeywords([row('어린이집', '9000', '40000'), row('무관한말', '9000', '9000')], '배변훈련 시작해요', '서울 동작구 신대방동');
  assert.equal(r.main, '어린이집 배변훈련');
  assert.deepEqual(r.subs, []);
});
