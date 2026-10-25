import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areaTags, autoPrefix, cleanAreaName, nearbyLine, prefixRotation } from '../../src/shared/areas';
import type { NearbyArea } from '../../src/shared/types';

const A = (name: string, kind: string, distance: number): NearbyArea => ({ name, kind, distance, source: 'kakao' });
const areas = [A('대길초', '학교', 309), A('보라매초', '학교', 315), A('대영초', '학교', 991), A('먼초', '학교', 1400), A('보라매공원역', '지하철역', 493), A('신풍역', '지하철역', 579), A('롯데낙천대', '아파트', 154)];

test('제목 머리말: 소재 동은 세 편에 한 번, 나머지는 초등 3곳 · 역 2곳 번갈아 (1km 넘는 곳 제외)', () => {
  assert.deepEqual(prefixRotation('서울 동작구 신대방동', areas), [
    '[신대방동 태권도]', '[대길초 근처 태권도]', '[보라매공원역 근처 태권도]',
    '[신대방동 태권도]', '[보라매초 근처 태권도]', '[신풍역 근처 태권도]',
    '[신대방동 태권도]', '[대영초 근처 태권도]',
  ]);
  assert.equal(autoPrefix('서울 동작구 신대방동', areas, 5), '[신풍역 근처 태권도]');
  assert.equal(autoPrefix('', [], 3), '');
  assert.deepEqual(prefixRotation('서울 동작구 신대방동', []), ['[신대방동 태권도]']);
});

test('강담 실제 목록: 직접 입력한 "보라매"는 "근처"로, 신대방동은 세 편에 한 번 (2026-10-18)', () => {
  const kangdam = [A('대길초', '학교', 309), A('보라매초', '학교', 315), A('신대림초', '학교', 684), A('문창초', '학교', 734), A('보라매공원역', '지하철역', 493), A('신풍역', '지하철역', 579), A('신대방역', '지하철역', 865),
    { name: '보라매', kind: '직접 입력', source: 'manual' as const }, { name: '신대방동', kind: '직접 입력', source: 'manual' as const }];
  const r = prefixRotation('서울 동작구 신대방동', kangdam);
  assert.deepEqual(r, [
    '[신대방동 태권도]', '[보라매 근처 태권도]', '[대길초 근처 태권도]',
    '[신대방동 태권도]', '[보라매공원역 근처 태권도]', '[보라매초 근처 태권도]',
    '[신대방동 태권도]', '[신풍역 근처 태권도]', '[신대림초 근처 태권도]',
  ]);
  assert.ok(!r.includes('[보라매 태권도]')); // 다른 도장 이름처럼 읽히는 꼴은 만들지 않음
  for (let i = 0; i < 30; i += 3) assert.equal(autoPrefix('서울 동작구 신대방동', kangdam, i), '[신대방동 태권도]');
});

test('지역 태그 · AI 주변 사실 (1km 넘는 곳은 뺌)', () => {
  assert.deepEqual(areaTags('서울 동작구 신대방동', areas), ['신대방동태권도', '대길초태권도', '보라매초태권도', '보라매공원역태권도']);
  assert.ok(!nearbyLine(areas).includes('먼초'));
  assert.ok(nearbyLine(areas).includes('롯데낙천대'));
});

test('아파트 이름 앞 동네 이름 떼기', () => {
  assert.equal(cleanAreaName('보라매롯데낙천대', '아파트', ['보라매공원', '보라매', '신대방']), '롯데낙천대');
  assert.equal(cleanAreaName('보라매정은', '아파트', ['보라매']), '보라매정은'); // 너무 짧아지면 그대로
  assert.equal(cleanAreaName('보라매초', '학교', ['보라매']), '보라매초');
});

test('본문에 주변 이름이 없을 때만 위치 한 줄을 붙임', async () => {
  const { locationLine, mentionsNearby } = await import('../../src/shared/areas');
  assert.equal(locationLine('용인대석사강담태권도', '서울 동작구 신대방동', areas), '용인대석사강담태권도는 신대방동, 대길초 · 보라매초 · 보라매공원역 가까이에 있어요.');
  assert.equal(locationLine('강담도장', '서울 동작구 신대방동', areas).startsWith('강담도장은 '), true);
  assert.equal(mentionsNearby('보라매초 근처 도장', areas), true);
  assert.equal(mentionsNearby('신대방동 도장', areas), false);
  assert.equal(locationLine('도장', '서울', []), '');
});
