import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foreignKeyword, hintWords, pickKeywords, regionWords, topicTerms } from '../../src/shared/keywords';
import type { KeywordRow } from '../../src/shared/types';

const row = (keyword: string, pc: string, mobile: string): KeywordRow => ({ keyword, pc, mobile, source: 'naver' });

test('메모에서 주제 낱말 · 지역 이름', () => {
  assert.deepEqual(topicTerms('적응기간 동안 방과후과정도 잘 지냈어요'), ['적응기간', '방과후과정']); // "적응"은 "적응기간"과 겹쳐 뺌
  assert.deepEqual(topicTerms('11월 처음학교로 신청'), ['처음학교로']);
  assert.deepEqual(regionWords('서울 동작구 신대방동'), ['신대방동', '신대방', '동작구', '동작']);
  assert.deepEqual(hintWords('방과후과정 시간', '서울 동작구 신대방동'), ['유치원', '신대방동유치원', '방과후과정']);
  assert.deepEqual(hintWords('생일잔치 했어요', '서울 동작구 신대방동'), ['유치원', '신대방동유치원', '생일잔치', '유치원생일잔치']);
  assert.deepEqual(hintWords('입학설명회 안내', '서울 동작구 신대방동'), ['유치원', '신대방동유치원', '입학설명회', '유치원입학설명회']);
});

test('주제가 드러나는 키워드를 주요로, 지역 키워드를 보조로, 아이와 상관없는 넓은 말 · 다른 지역은 뺌', () => {
  const rows = [
    row('유치원', '9000', '40000'),
    row('방과후과정', '9000', '20000'), // 넓은 말 (유치원 · 아이 말이 없음)
    row('유치원방과후과정', '30', '300'),
    row('신대방동유치원', '40', '200'),
    row('대치동유치원', '50', '500'),
  ];
  const r = pickKeywords(rows, '방과후과정 시간이 길어졌어요', '서울 동작구 신대방동');
  assert.equal(r.main, '유치원방과후과정');
  assert.deepEqual(r.subs, ['신대방동유치원']);
});

test('주제 낱말이 없으면 유치원 관련 중 검색량 큰 것, 둘째 보조는 비움', () => {
  const r = pickKeywords([row('유치원', '9000', '40000'), row('유치원추천', '310', '2420'), row('아디다스', '9000', '9000')], '오늘 아이들이 즐거웠어요', '서울 동작구 신대방동');
  assert.equal(r.main, '유치원');
  assert.deepEqual(r.subs, []); // 주제를 모르면 "유치원○○"를 억지로 붙이지 않음 (상표 아디다스도 당연히 빠짐)
});

test('조회 결과가 비면 빈 값 (주제로 대신)', () => {
  assert.deepEqual(pickKeywords([], '생일잔치', '서울 동작구 신대방동'), { main: '', subs: [] });
});

test('주제 낱말에 맞는 검색어가 하나도 없으면 주제 그대로 (엉뚱한 큰 검색어 X)', () => {
  const r = pickKeywords([row('유치원', '9000', '40000'), row('무관한말', '9000', '9000')], '특성화 활동 소개해요', '서울 동작구 신대방동');
  assert.equal(r.main, '유치원 특성화');
  assert.deepEqual(r.subs, []);
});

// 2026-10-27 어린이집판으로 실제 네이버 조회했을 때 함께 나온 유치원 쪽 키워드 (검색량은 유치원소풍 · 어린이집소풍 · 가정어린이집만 실제 값, 나머지는 시험용)
const ROWS = [
  row('유치원', '5480', '32700'), row('신대방동유치원', '< 10', '< 10'), row('유치원소풍', '20', '90'), row('유치원현장학습', '30', '200'),
  row('어린이집소풍', '40', '320'), row('가정어린이집', '280', '1750'), row('병설유치원', '900', '6000'), row('수지영어유치원', '50', '300'),
  row('유치원매매', '100', '500'), row('봉천동유치원', '30', '150'), row('푸르니유치원', '500', '2000'),
];
const SARIP = { facilityType: '사립(개인)', nearbyAreas: [{ name: '롯데낙천대아파트', kind: '아파트', source: 'manual' as const }] };

test('어린이집 · 영어유치원 · 다른 유형 · 매매 키워드는 빼고, 유치원 키워드로 고름', () => {
  // 소풍 메모: 어린이집판에서는 "어린이집소풍"이 주요였음 → 유치원판은 "유치원소풍"
  assert.deepEqual(pickKeywords(ROWS, '장미반 아이들과 보라매공원으로 소풍갔어요', '서울 동작구 신대방동', SARIP), { main: '유치원소풍', subs: ['신대방동유치원'] });
  const all = pickKeywords(ROWS, '오늘 아이들이 즐거웠어요', '서울 동작구 신대방동', SARIP);
  for (const k of [all.main, ...all.subs]) assert.doesNotMatch(k, /어린이집|병설|영어|매매|봉천동|푸르니/);
  // 우리 유형 + 우리 동네는 괜찮음
  assert.equal(pickKeywords([row('신대방동사립유치원', '30', '200')], '오늘', '서울 동작구 신대방동', SARIP).main, '신대방동사립유치원');
  // 병설유치원이면 "병설유치원"은 남고 "사립유치원"은 빠짐
  const bs = { facilityType: '국공립(병설)' };
  assert.equal(foreignKeyword('병설유치원', '서울 동작구 신대방동', bs), false);
  assert.equal(foreignKeyword('공립유치원', '서울 동작구 신대방동', bs), false);
  assert.equal(foreignKeyword('사립유치원', '서울 동작구 신대방동', bs), true);
  assert.equal(foreignKeyword('단설유치원', '서울 동작구 신대방동', bs), true);
});

test('다른 동네 · 다른 유치원 이름은 빼고, 우리 동네 · 주변 아파트는 둠', () => {
  const rows = [row('봉천동유치원', '300', '1500'), row('푸르니유치원', '900', '5000'), row('신대방유치원', '20', '100'), row('롯데낙천대유치원', '10', '40'), row('유치원추천', '310', '2420')];
  const r = pickKeywords(rows, '오늘', '서울 동작구 신대방동', SARIP);
  assert.equal(r.main, '유치원추천');
  assert.deepEqual(r.subs, ['신대방유치원']);
  // 주변 아파트 이름도 우리 동네로 봄
  assert.deepEqual(pickKeywords([row('유치원', '9000', '40000'), row('롯데낙천대유치원', '10', '40')], '오늘', '서울 동작구 신대방동', SARIP).subs, ['롯데낙천대유치원']);
  assert.equal(pickKeywords([row('롯데낙천대아파트유치원', '10', '40')], '오늘', '서울 동작구 신대방동', SARIP).main, '롯데낙천대아파트유치원');
});

test('유형을 모르면 유형 낱말이 앞에 붙은 키워드는 모두 뺌', () => {
  const r = pickKeywords([row('병설유치원', '900', '6000'), row('사립유치원', '1200', '8000'), row('유치원', '5480', '32700')], '오늘', '서울 동작구 신대방동');
  assert.equal(r.main, '유치원');
  assert.deepEqual(r.subs, []);
});

test('"유치원" 뒤에 오는 말은 보지 않음 (유치원가정통신문), 앞에 붙은 다른 유형 · 이름은 뺌', () => {
  assert.equal(foreignKeyword('유치원가정통신문', '서울 동작구 신대방동', SARIP), false);
  assert.equal(foreignKeyword('신대방동병설유치원', '서울 동작구 신대방동', SARIP), true);
  assert.equal(foreignKeyword('유치원 소풍', '서울 동작구 신대방동', SARIP), false);
  assert.equal(foreignKeyword('영어유치원', '서울 동작구 신대방동', SARIP), true); // 법적으로 유치원이 아닌 유아 대상 학원
  assert.equal(foreignKeyword('어린이집소풍', '서울 동작구 신대방동', SARIP), true);
});

test('원장 · 창업자 쪽 검색어(매매 · 임대 · 채용)는 뺌', () => {
  for (const k of ['유치원매매', '관리동유치원임대', '유치원교사채용', '유치원창업']) assert.equal(foreignKeyword(k, '서울 동작구 신대방동', SARIP), true, k);
  const r = pickKeywords([row('유치원', '5480', '32700'), row('유치원매매', '270', '920'), row('신대방동유치원', '< 10', '< 10')], '낙엽 놀이', '서울 동작구 신대방동', SARIP);
  assert.deepEqual([r.main, ...r.subs], ['유치원', '신대방동유치원']);
});
