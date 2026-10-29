import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areaTags, autoPrefix, cleanAreaName, locationLine, mentionsNearby, nearbyLine, prefixRotation } from '../../src/shared/areas';
import type { NearbyArea } from '../../src/shared/types';

const A = (name: string, kind: string, distance: number): NearbyArea => ({ name, kind, distance, source: 'kakao' });
const areas = [A('대길초', '학교', 309), A('보라매초', '학교', 315), A('먼초', '학교', 1400), A('보라매공원역', '지하철역', 493),
  A('롯데낙천대', '아파트', 154), A('보라매삼성', '아파트', 320), A('신대방현대', '아파트', 450), A('대림아이파크', '아파트', 480), A('다섯째단지', '아파트', 490), A('먼아파트', '아파트', 700)];

test('제목 머리말: 가까운 아파트 4곳(500m 안)을 돌리고 소재 동은 세 편에 한 번, 학교 · 역은 돌리지 않음', () => {
  assert.deepEqual(prefixRotation('서울 동작구 신대방동', areas), [
    '[신대방동 유치원]', '[롯데낙천대아파트 유치원]', '[보라매삼성아파트 유치원]',
    '[신대방동 유치원]', '[신대방현대아파트 유치원]', '[대림아이파크아파트 유치원]',
  ]);
  assert.equal(autoPrefix('서울 동작구 신대방동', areas, 4), '[신대방현대아파트 유치원]');
  assert.equal(autoPrefix('', [], 3), '');
  assert.deepEqual(prefixRotation('서울 동작구 신대방동', []), ['[신대방동 유치원]']);
});

test('직접 적은 이름: 아파트 · 단지로 끝나면 그대로, 아니면 "근처" (다른 유치원 이름처럼 읽히지 않게)', () => {
  const manual = [A('롯데낙천대', '아파트', 154), { name: '보라매', kind: '직접 입력', source: 'manual' as const }, { name: '한빛단지', kind: '직접 입력', source: 'manual' as const }, { name: '신대방동', kind: '직접 입력', source: 'manual' as const }];
  const r = prefixRotation('서울 동작구 신대방동', manual);
  assert.deepEqual(r, ['[신대방동 유치원]', '[롯데낙천대아파트 유치원]', '[보라매 근처 유치원]', '[신대방동 유치원]', '[한빛단지 유치원]']);
  assert.ok(!r.includes('[보라매 유치원]'));
  // 돌아가며 붙여도 연달아 세 편 안에 소재 동 이름이 꼭 한 번은 들어감
  for (let i = 0; i < 30; i++) assert.ok([i, i + 1, i + 2].some((t) => autoPrefix('서울 동작구 신대방동', manual, t) === '[신대방동 유치원]'), `${i}번째부터 세 편`);
});

test('지역 태그 · AI 주변 사실 (멀리 있는 곳은 뺌)', () => {
  assert.deepEqual(areaTags('서울 동작구 신대방동', areas), ['신대방동유치원', '롯데낙천대아파트유치원', '보라매삼성아파트유치원']);
  assert.equal(nearbyLine(areas), '롯데낙천대아파트, 보라매삼성아파트, 신대방현대아파트, 대길초, 보라매초, 보라매공원역');
  assert.ok(!nearbyLine(areas).includes('먼'));
});

test('아파트 이름 앞 동네 이름 떼기', () => {
  assert.equal(cleanAreaName('보라매롯데낙천대', '아파트', ['보라매공원', '보라매', '신대방']), '롯데낙천대');
  assert.equal(cleanAreaName('보라매정은', '아파트', ['보라매']), '보라매정은'); // 너무 짧아지면 그대로
  assert.equal(cleanAreaName('보라매초', '학교', ['보라매']), '보라매초');
});

test('본문에 주변 이름이 없을 때만 위치 한 줄을 붙임 (받침 따라 은/는)', () => {
  assert.equal(locationLine('새싹예시유치원', '서울 동작구 신대방동', areas), '새싹예시유치원은 신대방동, 롯데낙천대아파트 · 보라매삼성아파트 · 대길초 가까이에 있어요.');
  assert.ok(locationLine('하늘유치원', '서울 동작구 신대방동', areas).startsWith('하늘유치원은 '));
  assert.ok(locationLine('새싹나라', '서울 동작구 신대방동', areas).startsWith('새싹나라는 '));
  assert.equal(mentionsNearby('롯데낙천대 옆 유치원', areas), true);
  assert.equal(mentionsNearby('보라매초 근처 유치원', areas), true);
  assert.equal(mentionsNearby('신대방동 유치원', areas), false);
  assert.equal(locationLine('유치원', '서울', []), '');
});

// 2026-10-29 유치원 정보 점검: 직접 적은 "보라매초"(종류 '학교')도 제목 앞 이름에 들어감
test('직접 적은 학교 이름도 돌아가며 붙음', () => {
  const r = prefixRotation('서울 동작구 신대방동', [{ name: '보라매초', kind: '학교', source: 'manual' }]);
  assert.deepEqual(r, ['[신대방동 유치원]', '[보라매초 근처 유치원]']);
});
