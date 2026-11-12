// 네이버 지도 결과 고르기: 이름이 같아도 주소가 다르면 고르지 않음
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasPlaceBasis, pickPlace, placeQueries, placeRank, placeTarget } from '../../src/shared/placeMatch';
import { lookupAddress } from '../../src/main/services/nearby';

const row = (title: string, addr: string) => ({ title, text: `${title}\n태권도장\n${addr}` });
const NAME = '한국체대석사태권도장';
const t = placeTarget('강원 춘천시 석사동 123-4 2층', '강원 춘천시 석사동');

test('주소 읽기: 시 · 구 · 도로명 · 번지 · 동', () => {
  const a = placeTarget('경기도 용인시 처인구 명지로 12 상가 2층 (역북동, 한신아파트)', '');
  assert.equal(a.sido, '경기');
  assert.deepEqual(a.area, ['용인시', '처인구']);
  assert.deepEqual(a.road, { name: '명지로', no: '12' });
  assert.equal(a.dong?.name, '역북동');
  assert.deepEqual(placeTarget('서울 강남구 테헤란로12번길 3', '').road, { name: '테헤란로12번길', no: '3' });
  assert.deepEqual(placeTarget('서울 동작구 신대방동 395-1', '').dong, { name: '신대방동', no: '395-1' });
  assert.equal(placeTarget('서울 동작구 한신아파트 101동 202호', '').dong, undefined); // 아파트 동은 동네가 아님
  assert.equal(placeTarget('경기 용인시처인구 명지로 12', '').area.join(), '용인시,처인구');
});

test('상세 주소가 없으면 지역 칸으로, 둘 다 없으면 대조할 수 없음', () => {
  const r = placeTarget('', '서울 동작구 신대방동');
  assert.deepEqual(r.area, ['동작구']);
  assert.equal(r.dong?.name, '신대방동');
  assert.equal(hasPlaceBasis(r), true);
  assert.equal(hasPlaceBasis(placeTarget('', '')), false);
  assert.deepEqual(placeTarget('명지로 12', '경기 용인시 처인구').area, ['용인시', '처인구']);
});

test('같은 이름이어도 다른 지역이면 고르지 않음 (이번 신고)', () => {
  assert.equal(pickPlace([row(NAME, '서울 송파구 잠실동 10-1')], NAME, t), -1);
  assert.equal(pickPlace([row(NAME, '서울 송파구 잠실동 10-1'), row(NAME, '강원 춘천시 석사동 123-4')], NAME, t), 1);
  assert.equal(pickPlace([row('다른태권도', '서울 송파구 잠실동 10-1')], NAME, t), -1); // 예전에는 맨 위를 넣음
});

test('이름이 조금 달라도 번지까지 같으면 고름 · 같은 건물 다른 가게는 고르지 않음', () => {
  assert.equal(pickPlace([row('한국체대 석사 태권도', '강원 춘천시 석사동 123-4')], NAME, t), 0);
  assert.equal(pickPlace([row('행복미용실', '강원 춘천시 석사동 123-4')], NAME, t), -1);
});

test('번지는 앞자리만 같으면 다른 곳', () => {
  const road = placeTarget('경기 용인시 처인구 명지로 12', '');
  assert.equal(placeRank('경기 용인시 처인구 명지로 12', road), 3);
  assert.equal(placeRank('경기 용인시 처인구 명지로 123', road), 0);
  assert.equal(placeRank('경기 용인시 처인구 명지로 12-5', road), 0);
  assert.equal(placeRank('경기 용인시 처인구 금학로 5', road), 0);
  assert.equal(placeRank('강원 춘천시 석사동 123-40', t), 0);
  assert.equal(placeRank('강원 춘천시 후평동 123-4', t), 0);
});

test('같은 구 이름도 시 · 도가 다르면 다른 곳', () => {
  const j = placeTarget('서울 중구 퇴계로 10', '');
  assert.equal(placeRank('부산 중구 퇴계로 10', j), 0);
  assert.equal(placeRank('서울특별시 중구 퇴계로 10', j), 3);
  assert.equal(placeRank('중구 퇴계로 10', j), 3); // 결과에 시 · 도가 안 나와도
});

test('도로명으로 적었는데 결과는 지번만 나오면: 이름이 같고 한 곳일 때만', () => {
  const road = placeTarget('강원 춘천시 후석로 100', '');
  const here = row(NAME, '강원 춘천시 석사동 123-4');
  assert.equal(pickPlace([here], NAME, road), 0);
  assert.equal(pickPlace([row('한국체대석사태권도', '강원 춘천시 석사동 123-4')], NAME, road), 0); // 태권도장 · 태권도는 같은 이름
  assert.equal(pickPlace([here, row(NAME, '강원 춘천시 퇴계동 5')], NAME, road), -1); // 어느 쪽인지 모름
  assert.equal(pickPlace([row('비슷한태권도', '강원 춘천시 석사동 123-4')], NAME, road), -1);
});

test('도로명 중간에 숫자가 있는 주소 (여의대방로10길)', () => {
  const a = placeTarget('서울 동작구 여의대방로10길 38 상가 2층', '서울 동작구 신대방동');
  assert.deepEqual(a.road, { name: '여의대방로10길', no: '38' });
  assert.equal(placeRank('서울특별시 동작구 여의대방로10길 38 2층', a), 3);
  assert.equal(placeRank('서울 동작구 여의대방로10길 380', a), 0);
  assert.equal(placeRank('서울 동작구 여의대방로 38', a), 0);
  assert.equal(placeRank('서울 강남구 여의대방로10길 38', a), 0);
  assert.equal(placeRank('경기 용인시 수지구 신봉2로 71', a), 0);
  assert.equal(pickPlace([row(NAME, '경기 용인시 수지구 신봉2로 71'), row(NAME, '서울 동작구 여의대방로10길 38')], NAME, a), 1);
});

test('카카오가 알려 준 도로명 · 지번으로 어느 표기든 번지까지 대조', () => {
  const k = placeTarget('서울 동작구 여의대방로10길 38 상가 2층', '서울 동작구 신대방동', { road: '서울 동작구 여의대방로10길 38', jibun: '서울 동작구 신대방동 395-1' });
  assert.equal(placeRank('서울 동작구 여의대방로10길 38', k), 3);
  assert.equal(placeRank('서울 동작구 신대방동 395-1', k), 3);
  assert.equal(placeRank('서울 동작구 신대방동 395-12', k), 0);
  assert.equal(placeRank('서울 동작구 대방동 10', k), 0);
  // 이름이 조금 달라도, 같은 이름이 여러 곳이어도 번지가 맞는 곳을 고름
  assert.equal(pickPlace([row(NAME, '서울 동작구 신대방동 700-1'), row('한국체대 석사 태권도', '서울 동작구 신대방동 395-1')], NAME, k), 1);
  // 도장 정보가 지번이어도 도로명 결과를 대조
  const j = placeTarget('서울 동작구 신대방동 395-1', '', { road: '서울 동작구 여의대방로10길 38', jibun: '서울 동작구 신대방동 395-1' });
  assert.equal(placeRank('서울 동작구 여의대방로10길 38', j), 3);
  assert.equal(placeRank('서울 동작구 여의대방로10길 39', j), 0);
  // 카카오가 못 찾거나 값이 비면 전과 같음
  assert.deepEqual(placeTarget('서울 동작구 여의대방로10길 38', '', {}), placeTarget('서울 동작구 여의대방로10길 38', ''));
});

test('카카오 주소 조회: 층을 떼고 물어보고, 도로명 · 지번을 돌려줌', async () => {
  const real = globalThis.fetch;
  let asked = '';
  globalThis.fetch = (async (u: string) => { asked = decodeURIComponent(String(u)); return new Response(JSON.stringify({ documents: [{ road_address: { address_name: '서울 동작구 여의대방로10길 38' }, address: { address_name: '서울 동작구 신대방동 395-1' } }] })); }) as any;
  try {
    assert.deepEqual(await lookupAddress('k', '서울 동작구 여의대방로10길 38 상가 2층'), { road: '서울 동작구 여의대방로10길 38', jibun: '서울 동작구 신대방동 395-1' });
    assert.ok(asked.endsWith('query=서울 동작구 여의대방로10길 38'));
    globalThis.fetch = (async () => new Response(JSON.stringify({ documents: [] }))) as any;
    assert.equal(await lookupAddress('k', '없는 주소'), null);
  } finally { globalThis.fetch = real; }
});

test('다시 찾을 때는 동네를 붙임', () => {
  assert.deepEqual(placeQueries(NAME, t), [NAME, `${NAME} 석사동`]);
  assert.deepEqual(placeQueries(NAME, placeTarget('경기 용인시 처인구 명지로 12', '')), [NAME, `${NAME} 처인구`]);
});
