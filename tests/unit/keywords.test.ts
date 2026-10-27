import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { hintOf, normalize, sign, totalOf } from '../../src/main/services/naver-keywords';
import { shortName, prefixOptions } from '../../src/main/services/nearby';
import { fromHttp } from '../../src/main/services/errors';

test('서명 = base64(HMAC-SHA256("ts.GET./keywordstool"))', () => {
  const expect = createHmac('sha256', 'secret').update('1700000000000.GET./keywordstool').digest('base64');
  assert.equal(sign('1700000000000', 'GET', '/keywordstool', 'secret'), expect);
});

test('힌트 키워드: 띄어쓰기 제거 · 최대 5개 · 중복 제거', () => {
  assert.equal(hintOf(['태권도 품새', '태권도품새', 'a', 'b', 'c', 'd', 'e']), '태권도품새,a,b,c,d');
  assert.throws(() => hintOf([' ']));
});

test('작은 검색량 문자열은 원문 그대로, 합계는 정확한 숫자일 때만', () => {
  const rows = normalize({ keywordList: [
    { relKeyword: '태권도', monthlyPcQcCnt: 12000, monthlyMobileQcCnt: 56000, compIdx: '높음' },
    { relKeyword: '태권도 발표', monthlyPcQcCnt: '< 10', monthlyMobileQcCnt: 30, compIdx: '낮음' },
  ] }, '2026-10-18T00:00:00Z');
  assert.equal(rows[1].pc, '< 10');
  assert.equal(rows[1].mobile, '30');
  assert.equal(rows[0].source, 'naver');
  assert.equal(totalOf(rows[0]), 68000);
  assert.equal(totalOf(rows[1]), null);
});

test('API 오류 구분: 인증 · 권한 · 한도 · 속도 · 서버', () => {
  assert.equal(fromHttp('X', 401).code, 'auth');
  assert.equal(fromHttp('X', 403).code, 'permission');
  assert.equal(fromHttp('X', 429, '{"error":{"code":"insufficient_quota"}}').code, 'quota');
  const rate = fromHttp('X', 429, 'rate limit');
  assert.equal(rate.code, 'rate');
  assert.equal(rate.retryable, true);
  assert.equal(fromHttp('X', 401).retryable, false);
  assert.equal(fromHttp('X', 503).code, 'server');
});

test('동네 이름 줄이기 · 제목 머리말', () => {
  assert.equal(shortName('서울보라매초등학교', '학교'), '보라매초');
  assert.equal(shortName('보라매롯데낙천대아파트', '아파트', ['보라매']), '롯데낙천대');
  assert.equal(shortName('정은아파트', '아파트', ['정은']), '정은');
  assert.equal(shortName('보라매역 7호선', '지하철역'), '보라매역');
  // 유치원: 동네 → 아파트 → 직접 적은 이름 → 학교 · 역("근처") 순서
  assert.deepEqual(prefixOptions('서울 동작구 신대방동', [{ name: '보라매초', kind: '학교', source: 'kakao' }, { name: '롯데낙천대', kind: '아파트', source: 'kakao' }, { name: '보라매', kind: '직접 입력', source: 'manual' }]),
    ['[신대방동 유치원]', '[롯데낙천대아파트 유치원]', '[보라매 근처 유치원]', '[보라매초 근처 유치원]']);
});

// 키워드 띄어 쓴 꼴 · 횟수 (2026-10-18 흐름 다듬기)
import { keywordCount, spacedKeyword } from '../../src/shared/validation';
test('검색어는 본문용으로 띄어 씀', () => {
  assert.equal(spacedKeyword('신대방동유치원'), '신대방동 유치원');
  assert.equal(spacedKeyword('신대방동국공립유치원'), '신대방동 국공립유치원');
  assert.equal(spacedKeyword('영아반 적응'), '영아반 적응');
  assert.equal(spacedKeyword('유치원'), '유치원');
  assert.equal(spacedKeyword('물놀이'), '물놀이'); // 한 낱말은 띄우지 않음
});
test('키워드 횟수는 띄어쓰기와 상관없이 셈', () => {
  assert.equal(keywordCount('신대방동유치원과 신대방동 유치원, 신대방동  유치원', '신대방동유치원'), 3);
  assert.equal(keywordCount('영아반(만1세)', '영아반(만1세)'), 1);
  assert.equal(keywordCount('아무것도', ''), 0);
});

test('네이버 거절 이유에 키가 되돌아와도 화면에는 가려서 보여 줌', () => {
  const key = '0100000000aaaaaaaabbbbbbbbccccccccdddddddd';
  const m = fromHttp('네이버 검색광고', 401, JSON.stringify({ title: 'Invalid API-KEY', detail: `API-KEY '${key}' is invalid` })).message;
  assert.ok(!m.includes(key));
  assert.match(m, /0100••••/);
  assert.match(m, /Invalid API-KEY/);
});
