// 노출 원인 분석 (태권 글뚝딱 2.8.0에서 옮김)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnose, josa, keywordCount, keywordInTitle, parsePostDate, statsOf, suggestKeywords, volumeTotal, type DiagnoseInput, type PostStats } from '../../src/shared/diagnose';
import { foreignKeyword, notParentKeyword } from '../../src/shared/keywords';
import { openDb } from '../../src/main/db';

const NOW = '2026-11-11T03:00:00.000Z';
const days = (n: number) => new Date(Date.parse(NOW) - n * 86_400_000).toISOString();
const stats = (p: Partial<PostStats> = {}): PostStats => ({ url: 'https://blog.naver.com/x/1000001', title: '강남 유치원 숲체험', chars: 1500, images: 10, videos: 0, publishedAt: days(10), kwInTitle: 'front', kwCount: 4, kwWords: 4, ...p });
const base = (p: Partial<DiagnoseInput> = {}): DiagnoseInput => ({
  keyword: '강남 유치원', now: NOW,
  check: { keyword: '강남 유치원', blogRank: null, totalRank: null, otherRank: null, otherUrl: null, checkedAt: NOW },
  ours: stats(), publishedAt: days(10), titleRank: 1, volume: { pc: '1000', mobile: '4000', competition: '중간' }, totalBlogs: 6,
  top: [stats({ url: 'a' }), stats({ url: 'b' }), stats({ url: 'c' })], recent30: 6, suggestions: [], ...p,
});
const get = (d: ReturnType<typeof diagnose>, id: string) => d.findings.find((f) => f.id === id);

test('제목 · 본문 검색어: 띄어쓰기 무시, 앞쪽 · 뒤쪽 · 단어만 · 없음', () => {
  assert.equal(keywordInTitle('강남유치원 숲체험 이야기', '강남 유치원'), 'front');
  assert.equal(keywordInTitle('우리 아이 첫 운동회, 강남 유치원', '강남 유치원'), 'back');
  assert.equal(keywordInTitle('강남 사립유치원, 아이들도 이렇게', '강남 유치원'), 'words');
  assert.equal(keywordInTitle('가을 운동회 이야기', '강남 유치원'), null);
  assert.equal(keywordCount('강남 유치원에서는 강남유치원 아이들이… 강남  유치원', '강남 유치원'), 3);
  assert.equal(keywordCount('아무 말', ''), 0);
});

test('발행일: 글 화면 날짜(한국 시간) · "3시간 전" · 못 읽으면 null', () => {
  assert.equal(parsePostDate('2026. 10. 27. 17:30'), '2026-10-27T08:30:00.000Z');
  assert.equal(parsePostDate('2026. 11. 5.'), '2026-11-04T15:00:00.000Z');
  assert.equal(parsePostDate('3시간 전', Date.parse(NOW)), '2026-11-11T00:00:00.000Z');
  assert.equal(parsePostDate('어제'), null);
  assert.equal(parsePostDate(null), null);
});

test('글 숫자: 본문 글자는 띄어쓰기 빼고, 날짜 · 검색어도 같이', () => {
  const s = statsOf({ url: 'u', title: '강남 유치원 소식', text: '강남 유치원 아이들 \n​ 강남유치원', images: 3, videos: 1, date: '2026. 11. 1. 09:00' }, '강남 유치원');
  assert.deepEqual(s, { url: 'u', title: '강남 유치원 소식', chars: 13, images: 3, videos: 1, publishedAt: '2026-11-01T00:00:00.000Z', kwInTitle: 'front', kwCount: 2, kwWords: 2 });
});

test('새 글(3일 안)이면 할 일은 "기다리기"가 먼저이고, 다른 손질은 미룸', () => {
  const d = diagnose(base({ publishedAt: days(1), ours: stats({ kwInTitle: null, kwCount: 0 }) }));
  assert.equal(get(d, 'new')?.status, 'warn');
  assert.match(d.todos[0], /3일이 지나서 다시 확인/);
  assert.equal(d.todos.length, 1);
  assert.equal(get(d, 'title')?.status, 'warn'); // 항목에는 그대로 보여 줌
});

test('누락: 오래된 글인데 제목으로도 안 나오면 경고 + 할 일, 새 글이면 가능성으로만', () => {
  const d = diagnose(base({ titleRank: null }));
  assert.equal(get(d, 'indexed')?.status, 'warn');
  assert.match(d.todos[0], /검색에서 빠진 글/);
  assert.equal(get(diagnose(base({ titleRank: null, publishedAt: days(0.5) })), 'indexed')?.status, 'info');
  assert.equal(get(diagnose(base({ titleRank: 4 })), 'indexed')?.title, '제목 그대로 검색하면 4위로 나와요');
  assert.equal(get(diagnose(base({ titleRank: undefined })), 'indexed')?.status, 'unknown');
});

test('우리 다른 글이 나오면 알려 주고, 검색어 위치 · 횟수 규칙', () => {
  const d = diagnose(base({ check: { ...base().check, otherRank: 3, otherUrl: 'o' }, ours: stats({ kwInTitle: 'words', kwCount: 12 }) }));
  assert.equal(get(d, 'cannibal')?.status, 'warn');
  assert.equal(get(d, 'title')?.status, 'info'); // 단어만 흩어져 있으면 가능성
  assert.match(get(d, 'body')!.title, /12번이나/);
  assert.equal(get(diagnose(base({ ours: stats({ kwInTitle: null, kwCount: 0, kwWords: 0 }), check: { ...base().check, otherRank: 3, otherUrl: 'o' } })), 'title')?.status, 'warn');
  assert.equal(diagnose(base({ check: { ...base().check, otherRank: 3, otherUrl: 'o' }, ours: stats({ kwInTitle: null, kwCount: 0, kwWords: 0 }) })).todos.length, 3); // 최대 3개
  // 붙인 그대로는 0번이어도 단어별로 충분히 쓰면 괜찮음
  const w = diagnose(base({ ours: stats({ kwCount: 0, kwWords: 4 }) }));
  assert.equal(get(w, 'body')?.status, 'ok');
  assert.match(get(w, 'body')!.title, /단어별로는 4번/);
  assert.equal(get(diagnose(base({ ours: stats({ kwCount: 1, kwWords: 1 }) })), 'body')?.status, 'warn');
  assert.equal(get(diagnose(base({ ours: stats({ kwCount: 4 }) })), 'body')?.status, 'ok');
  assert.equal(get(diagnose(base({ ours: null })), 'title')?.status, 'unknown');
});

test('상위 글 비교: 평균의 70% 아래면 짧음 · 적음', () => {
  const top = [stats({ url: 'a', chars: 2000, images: 12 }), stats({ url: 'b', chars: 1800, images: 10 }), stats({ url: 'c', chars: 2200, images: 14 })];
  const d = diagnose(base({ top, ours: stats({ chars: 900, images: 11 }) }));
  assert.deepEqual(d.avg, { chars: 2000, images: 12 });
  assert.equal(get(d, 'compare')?.title, '상위 글보다 글이 짧아요');
  assert.equal(get(diagnose(base({ top, ours: stats({ chars: 1900, images: 12 }) })), 'compare')?.status, 'ok');
  assert.equal(get(diagnose(base({ top: [] })), 'compare')?.status, 'unknown');
});

test('검색량 · 통합검색 자리 · 블로그 활동', () => {
  assert.equal(get(diagnose(base({ volume: { pc: '3000', mobile: '9000', competition: '높음' } })), 'volume')?.status, 'warn');
  assert.equal(get(diagnose(base({ volume: { pc: '< 10', mobile: '10' } })), 'volume')?.status, 'info');
  assert.equal(get(diagnose(base({ volume: undefined })), 'volume')?.status, 'unknown');
  assert.equal(get(diagnose(base({ volume: null })), 'volume')?.title, '검색광고 자료에 없는 검색어예요');
  assert.match(get(diagnose(base({ totalBlogs: 1 })), 'serp')!.todo!, /플레이스/);
  assert.equal(get(diagnose(base({ check: { ...base().check, totalRank: 2 } })), 'serp'), undefined); // 통합검색에 나오면 안 봄
  assert.equal(get(diagnose(base({ recent30: 1 })), 'active')?.status, 'warn');
  assert.equal(get(diagnose(base({ recent30: 3 })), 'active')?.status, 'info');
  assert.equal(get(diagnose(base({ recent30: null })), 'active')?.status, 'unknown');
  assert.equal(volumeTotal({ pc: '< 10', mobile: '20' }), 25);
});

test('좁은 검색어 추천 (유치원판): 원래 단어를 품고, 검색량이 원래의 30% 이하 · 30 이상, 경쟁 높음 · 어린이집 · 영어유치원 · 다른 유치원 이름 제외 · 없으면 동네 + 유치원', () => {
  const rel = [
    { keyword: '강남유치원', pc: '2000', mobile: '8000', competition: '높음' },
    { keyword: '강남사립유치원', pc: '100', mobile: '400', competition: '낮음' },
    { keyword: '강남영어유치원', pc: '200', mobile: '600', competition: '낮음' }, // 유치원이 아닌 학원
    { keyword: '강남유치원추천', pc: '50', mobile: '250', competition: '높음' }, // 경쟁 높음
    { keyword: '역삼유치원', pc: '80', mobile: '120', competition: '중간' },
    { keyword: '강남어린이집', pc: '300', mobile: '900', competition: '낮음' }, // 어린이집
    { keyword: '강남유치원셔틀', pc: '3', mobile: '10', competition: '낮음' }, // 너무 작음
    { keyword: '필라테스', pc: '900', mobile: '900', competition: '낮음' }, // 단어 없음
  ];
  const s = suggestKeywords('강남 유치원', rel, ['역삼동', '보라매초등학교', '지역'], ['강남 유치원'], notParentKeyword);
  assert.deepEqual(s.map((x) => x.keyword), ['강남사립유치원', '역삼유치원', '역삼동 유치원']);
  assert.equal(s[0].volume, '500회');
  // 학교 이름은 붙이지 않음 ("○○초 유치원"은 그 학교 병설유치원), 검색어에 유형이 있으면 그대로
  assert.deepEqual(suggestKeywords('신대방 병설유치원', [], ['보라매역', '', '지역', '보라매초등학교', '동작구', '래미안아파트']).map((x) => x.keyword), ['보라매역 병설유치원', '동작구 병설유치원', '래미안아파트 병설유치원']);
  // 우리 유치원 블로그: 다른 유치원 이름("신대방동햇살유치원")은 빼고 우리 동네 말은 남김
  const own = (k: string) => foreignKeyword(k, '서울 동작구 신대방동', { name: '요요유치원', nearbyAreas: [] } as any);
  const rel2 = [{ keyword: '신대방동유치원', pc: '1000', mobile: '4000', competition: '중간' }, { keyword: '신대방동햇살유치원', pc: '100', mobile: '300', competition: '낮음' }, { keyword: '신대방동유치원입학', pc: '100', mobile: '200', competition: '낮음' }];
  assert.deepEqual(suggestKeywords('신대방동 유치원', rel2, [], [], own).map((x) => x.keyword), ['신대방동유치원입학']);
});

test('유치원판 안내 문구: 태권도 말 없이 학부모님 검색어 · 놀이 이야기로', () => {
  const top = [stats({ url: 'a', chars: 2000, images: 12 }), stats({ url: 'b', chars: 2000, images: 12 }), stats({ url: 'c', chars: 2000, images: 12 })];
  const d = diagnose(base({ top, ours: stats({ chars: 500, images: 2 }), volume: { pc: '3000', mobile: '9000', competition: '높음' } }));
  assert.match(get(d, 'compare')!.todo!, /놀이 · 활동 이야기/);
  assert.match(get(d, 'volume')!.todo!, /학부모님이 실제로 찾는/);
  const all = JSON.stringify(d);
  assert.ok(!/태권|도장|관장|사범|수업/.test(all), all);
});

test('저장소: 원인 분석은 글 주소별 가장 최근 것 · 하루 횟수', () => {
  const db = openDb(':memory:');
  const d1 = diagnose(base()), d2 = { ...diagnose(base({ titleRank: null })), createdAt: '2026-11-11T04:00:00.000Z' };
  db.addDiagnosis('https://blog.naver.com/x/1', d1);
  db.addDiagnosis('https://blog.naver.com/x/1', d2);
  db.addDiagnosis('https://blog.naver.com/x/2', d1);
  assert.equal(db.latestDiagnoses('https://blog.naver.com/x/1')['강남 유치원'].createdAt, d2.createdAt);
  assert.equal(db.countDiagnoses('2026-11-11T00:00:00.000Z'), 3);
  db.close();
});

test('검색어 뒤 조사: "유치원"처럼 받침이 있으면 이 · 을 · 은, 없으면 가 · 를 · 는', () => {
  assert.equal(josa('신대방동 유치원', '이/가'), '이');
  assert.equal(josa('유치원 운동회', '을/를'), '를');
  assert.equal(josa('숲체험', '은/는'), '은');
  const d = diagnose(base({ ours: stats({ kwInTitle: null, kwCount: 0, kwWords: 0 }) }));
  assert.equal(get(d, 'title')?.title, '제목에 "강남 유치원"이 없어요');
  assert.match(get(d, 'body')!.todo!, /^본문에 "강남 유치원"을 자연스럽게/);
});
