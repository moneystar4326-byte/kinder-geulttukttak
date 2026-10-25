import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hintWords, pickKeywords, regionWords, topicTerms } from '../../src/shared/keywords';
import type { KeywordRow } from '../../src/shared/types';

const row = (keyword: string, pc: string, mobile: string): KeywordRow => ({ keyword, pc, mobile, source: 'naver' });

test('메모에서 주제 낱말 · 지역 이름', () => {
  assert.deepEqual(topicTerms('10월 30일 금요일 승급심사가 있습니다'), ['승급심사']);
  assert.deepEqual(topicTerms('품새 대회 나가서 1학년 친구들이 3등'), ['품새', '대회']);
  assert.deepEqual(regionWords('서울 동작구 신대방동'), ['신대방동', '신대방', '동작구', '동작']);
  assert.deepEqual(hintWords('품새 대회 3등', '서울 동작구 신대방동'), ['태권도', '신대방동태권도', '태권도품새', '태권도대회']);
});

test('주제가 드러나는 키워드를 주요로, 지역 키워드를 보조로, 상표 · 다른 지역은 뺌', () => {
  const rows = [
    row('태권도', '4780', '28100'),
    row('아디다스컴뱃스포츠', '360', '2490'),
    row('태권도품새', '320', '1900'),
    row('품새대회', '90', '800'),
    row('신대방동태권도', '< 10', '40'),
    row('대치동태권도', '30', '300'),
  ];
  const r = pickKeywords(rows, '품새 대회 나가서 1학년 친구들이 3등', '서울 동작구 신대방동');
  assert.equal(r.main, '태권도품새');
  assert.ok(r.subs.includes('신대방동태권도'));
  assert.ok(r.subs.length <= 2);
  assert.ok(!r.subs.includes('아디다스컴뱃스포츠'));
});

test('주제 낱말이 없으면 태권도 관련 중 검색량 큰 것', () => {
  const r = pickKeywords([row('태권도', '4780', '28100'), row('태권도장', '310', '2420'), row('아디다스', '9000', '9000')], '오늘 아이들이 즐거웠어요', '서울 동작구 신대방동');
  assert.equal(r.main, '태권도');
  assert.deepEqual(r.subs, ['태권도장']);
});

test('조회 결과가 비면 빈 값 (주제로 대신)', () => {
  assert.deepEqual(pickKeywords([], '승급심사', '서울 동작구 신대방동'), { main: '', subs: [] });
});

// 2026-10-18 실사용: "1박 2일 합숙" 글에 "태권도품새"가 보조로 붙음
test('행사 메모는 행사 검색어로, 주제와 상관없는 큰 검색어는 붙이지 않음', () => {
  const memo = '2026년 10월 23일 금요일부터 24일 토요일 친구 가족 동생과 함께 1박 2일 합숙 레크레이션도하고 댄스대결 피자 치킨';
  assert.deepEqual(topicTerms(memo), ['합숙', '1박2일', '레크레이션']);
  assert.deepEqual(hintWords(memo, '서울 동작구 신대방동'), ['태권도', '신대방동태권도', '태권도합숙', '1박2일', '레크레이션']);
  const rows = [row('태권도', '4680', '27900'), row('태권도품새', '1160', '6430'), row('신대방동태권도', '< 10', '< 10'), row('태권도합숙', '< 10', '30'), row('1박2일', '9000', '50000')];
  const r = pickKeywords(rows, memo, '서울 동작구 신대방동');
  assert.ok(!r.subs.includes('태권도품새'));
  assert.ok(r.main !== '태권도품새');
  assert.equal(r.main, '태권도합숙'); // 예능 "1박2일"(검색량 큼)이 아니라
  assert.ok(!r.subs.includes('1박2일'));
});
test('주제 낱말에 맞는 검색어가 하나도 없으면 주제 그대로 (엉뚱한 큰 검색어 X)', () => {
  const r = pickKeywords([row('태권도', '4680', '27900'), row('태권도품새', '1160', '6430')], '이번 주 합숙 안내', '서울 동작구 신대방동');
  assert.equal(r.main, '태권도 합숙');
  assert.ok(!r.subs.includes('태권도품새'));
});
