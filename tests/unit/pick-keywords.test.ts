import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foreignKeyword, hintWords, pickKeywords, regionWords, topicTerms } from '../../src/shared/keywords';
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

test('주제 낱말이 없으면 어린이집 관련 중 검색량 큰 것, 둘째 보조는 비움', () => {
  const r = pickKeywords([row('어린이집', '9000', '40000'), row('어린이집추천', '310', '2420'), row('아디다스', '9000', '9000')], '오늘 아이들이 즐거웠어요', '서울 동작구 신대방동');
  assert.equal(r.main, '어린이집');
  assert.deepEqual(r.subs, []); // 주제를 모르면 "어린이집○○"를 억지로 붙이지 않음 (상표 아디다스도 당연히 빠짐)
});

test('조회 결과가 비면 빈 값 (주제로 대신)', () => {
  assert.deepEqual(pickKeywords([], '생일잔치', '서울 동작구 신대방동'), { main: '', subs: [] });
});

test('주제 낱말에 맞는 검색어가 하나도 없으면 주제 그대로 (엉뚱한 큰 검색어 X)', () => {
  const r = pickKeywords([row('어린이집', '9000', '40000'), row('무관한말', '9000', '9000')], '배변훈련 시작해요', '서울 동작구 신대방동');
  assert.equal(r.main, '어린이집 배변훈련');
  assert.deepEqual(r.subs, []);
});

// 2026-10-27 실제 네이버 응답 (요요유치원 · 민간 · 신대방동): "가정어린이집" · "유치원소풍"이 보조로 골라짐 → 사실과 다른 키워드
const REAL = [row('어린이집', '5480', '32700'), row('신대방동어린이집', '< 10', '< 10'), row('어린이집소풍', '40', '320'), row('유치원소풍', '20', '90'), row('가정어린이집', '280', '1750')];
// 시험용으로 더한 것 (다른 유형 · 다른 동네 · 다른 어린이집 이름)
const SOP = [...REAL, row('국공립어린이집', '1200', '8000'), row('봉천동어린이집', '30', '150'), row('푸르니어린이집', '500', '2000')];
const MINGAN = { facilityType: '민간', nearbyAreas: [{ name: '롯데낙천대아파트', kind: '아파트', source: 'manual' as const }] };

test('다른 시설 유형 · 유치원 키워드는 빼고, 우리 유형은 둠', () => {
  // 실제 응답: 전에는 보조가 "신대방동어린이집, 유치원소풍" → 이제 유치원소풍 빠짐
  assert.deepEqual(pickKeywords(REAL, '장미반 아이들과 보라매공원으로 소풍갔어요', '서울 동작구 신대방동', MINGAN), { main: '어린이집소풍', subs: ['신대방동어린이집'] });
  // 실제 응답 (낙엽 놀이): 전에는 보조에 "가정어린이집" → 이제 빠짐
  const leaf = pickKeywords(REAL, '햇님반 친구들이랑 가을 낙엽 밟기 놀이를 했어요', '서울 동작구 신대방동', MINGAN);
  assert.deepEqual([leaf.main, ...leaf.subs], ['어린이집', '신대방동어린이집']);
  const all = pickKeywords(SOP, '오늘 아이들이 즐거웠어요', '서울 동작구 신대방동', MINGAN);
  for (const k of [all.main, ...all.subs]) assert.doesNotMatch(k, /가정|국공립|유치원|봉천동|푸르니/);
  // 우리 유형 + 우리 동네는 괜찮음
  assert.ok(pickKeywords([row('신대방동민간어린이집', '30', '200')], '오늘', '서울 동작구 신대방동', MINGAN).main === '신대방동민간어린이집');
  // 가정어린이집이면 "가정어린이집"은 남음
  assert.equal(pickKeywords([row('가정어린이집', '280', '1750'), row('민간어린이집', '100', '900')], '오늘', '서울 동작구 신대방동', { facilityType: '가정' }).main, '가정어린이집');
});

test('다른 동네 · 다른 어린이집 이름은 빼고, 우리 동네 · 주변 아파트는 둠', () => {
  const rows = [row('봉천동어린이집', '300', '1500'), row('푸르니어린이집', '900', '5000'), row('신대방어린이집', '20', '100'), row('롯데낙천대어린이집', '10', '40'), row('어린이집추천', '310', '2420')];
  const r = pickKeywords(rows, '오늘', '서울 동작구 신대방동', MINGAN);
  assert.equal(r.main, '어린이집추천');
  assert.deepEqual(r.subs, ['신대방어린이집']);
  // 주변 아파트 이름도 우리 동네로 봄
  assert.deepEqual(pickKeywords([row('어린이집', '9000', '40000'), row('롯데낙천대어린이집', '10', '40')], '오늘', '서울 동작구 신대방동', MINGAN).subs, ['롯데낙천대어린이집']);
  const kept = pickKeywords([row('롯데낙천대아파트어린이집', '10', '40')], '오늘', '서울 동작구 신대방동', MINGAN);
  assert.equal(kept.main, '롯데낙천대아파트어린이집');
});

test('유형을 모르면 유형 낱말이 든 키워드는 모두 뺌', () => {
  const r = pickKeywords([row('가정어린이집', '280', '1750'), row('국공립어린이집', '1200', '8000'), row('어린이집', '5480', '32700')], '오늘', '서울 동작구 신대방동');
  assert.equal(r.main, '어린이집');
  assert.deepEqual(r.subs, []);
});

test('"어린이집" 뒤에 오는 말은 유형 낱말이 있어도 괜찮음 (가정통신문)', () => {
  assert.equal(foreignKeyword('어린이집가정통신문', '서울 동작구 신대방동', MINGAN), false);
  assert.equal(foreignKeyword('신대방동가정어린이집', '서울 동작구 신대방동', MINGAN), true);
  assert.equal(foreignKeyword('어린이집 소풍', '서울 동작구 신대방동', MINGAN), false);
});

test('원장 · 창업자 쪽 검색어(매매 · 임대 · 채용)는 뺌 — 2026-10-27 실제 조회', () => {
  for (const k of ['어린이집매매', '관리동어린이집임대', '어린이집교사채용', '어린이집창업']) assert.equal(foreignKeyword(k, '서울 동작구 신대방동', MINGAN), true, k);
  const r = pickKeywords([row('어린이집', '5480', '32700'), row('어린이집매매', '270', '920'), row('신대방동어린이집', '< 10', '< 10')], '낙엽 놀이', '서울 동작구 신대방동', MINGAN);
  assert.deepEqual([r.main, ...r.subs], ['어린이집', '신대방동어린이집']);
});
