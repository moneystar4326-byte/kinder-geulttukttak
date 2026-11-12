// 노출 순위 (태권 글뚝딱 2.8.0에서 옮김): 글 주소 · RSS · 순위 · 검색어 · 저장소
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blogIdFrom, changeText, checkFrom, keywordsOf, matchPosts, parseRss, postKeyOf, postKeywords, rankOf, ranksOf, rankText, titleKeyword, titleScore, RANK_KEYWORDS_MAX } from '../../src/shared/rank';
import { openDb } from '../../src/main/db';

test('글 주소: 보통 · 모바일 · PostView 모양을 같은 글로 읽고, 블로그 첫 화면 · 다른 사이트는 거름', () => {
  const k = { blogId: 'sunnykinder', logNo: '224451496312' };
  assert.deepEqual(postKeyOf('https://blog.naver.com/sunnykinder/224451496312'), k);
  assert.deepEqual(postKeyOf('https://m.blog.naver.com/SunnyKinder/224451496312?referrerCode=0'), k);
  assert.deepEqual(postKeyOf('blog.naver.com/sunnykinder/224451496312'), k);
  assert.deepEqual(postKeyOf('https://blog.naver.com/PostView.naver?blogId=sunnykinder&logNo=224451496312&redirect=Dlog'), k);
  assert.deepEqual(postKeyOf('https://blog.naver.com/PostView.nhn?logNo=224451496312&blogId=sunnykinder'), k);
  assert.equal(postKeyOf('https://blog.naver.com/sunnykinder'), null);
  assert.equal(postKeyOf('https://cafe.naver.com/sunnykinder/224451496312'), null);
  assert.equal(postKeyOf(''), null);
});

test('순위: 화면에 처음 나온 자리. 다시 나온 글도 자리를 차지하고, 같은 블로그 다른 글은 따로 알려 줌', () => {
  const u = (id: string, no: string) => `https://blog.naver.com/${id}/${no}`;
  const list = [u('a', '1000001'), u('mine', '2000001'), u('a', '1000001'), u('b', '3000001'), u('mine', '2000002')];
  assert.deepEqual(rankOf(list, { blogId: 'mine', logNo: '2000002' }), { rank: 5, other: { rank: 2, url: u('mine', '2000001') }, seen: 5 });
  assert.equal(rankOf(list, { blogId: 'mine', logNo: '2000001' }).rank, 2);
  const none = rankOf(list, { blogId: 'mine', logNo: '9999999' });
  assert.equal(none.rank, null);
  assert.equal(none.other?.rank, 2);
  assert.equal(rankOf(['https://example.com/x', u('A', '1000001')], { blogId: 'a', logNo: '1000001' }).rank, 1); // 아이디 대소문자 무시, 블로그 글 아닌 링크는 안 셈
});

test('RSS: CDATA 제목 · 날짜 · 주소를 읽고, 글 주소가 아닌 항목은 뺌', () => {
  const xml = `<rss><channel><title>블로그</title>
    <item><tag><![CDATA[보라매유치원, 신대방유치원,보라매유치원,]]></tag><title><![CDATA[[보라매초 근처 유치원] 겨울방학 특강 &amp; 숲체험]]></title><link><![CDATA[https://blog.naver.com/mine/224466159588?fromRss=true&trackingCode=rss]]></link><guid>https://blog.naver.com/mine/224466159588</guid><pubDate>Tue, 10 Nov 2026 18:00:00 +0900</pubDate></item>
    <item><title>공지</title><link>https://blog.naver.com/mine</link><guid>https://blog.naver.com/mine</guid></item>
  </channel></rss>`;
  const r = parseRss(xml);
  assert.equal(r.length, 1);
  assert.equal(r[0].title, '[보라매초 근처 유치원] 겨울방학 특강 & 숲체험');
  assert.equal(r[0].url, 'https://blog.naver.com/mine/224466159588');
  assert.equal(r[0].publishedAt, '2026-11-10T09:00:00.000Z');
  assert.deepEqual(r[0].tags, ['보라매유치원', '신대방유치원']); // 태그: 쉼표로 나누고 같은 것 · 빈 것 뺌
});

test('제목 맞추기: 머리말 · 띄어쓰기 · 기호가 달라도 같은 글, 조금 고친 제목도 맞춤, 다른 글은 아님', () => {
  assert.equal(titleScore('[보라매 유치원] 겨울방학 숲체험 특강 안내', '겨울방학 숲체험 특강 안내!'), 1);
  assert.ok(titleScore('겨울방학 숲체험 특강 안내', '겨울방학 숲체험 특강 안내드려요') >= 0.8);
  assert.ok(titleScore('겨울방학 숲체험 특강 안내', '가을 운동회 결과 소식') < 0.5);
});

test('글 ↔ 블로그 글 연결: 점수 높은 짝부터, 글 하나에 블로그 글 하나, 쓰기 전에 발행된 글은 안 맞춤, 이미 연결된 주소는 건너뜀', () => {
  const post = (no: string, title: string, at: string) => ({ title, url: `https://blog.naver.com/mine/${no}`, key: { blogId: 'mine', logNo: no }, publishedAt: at, tags: [] as string[] });
  const posts = [
    post('2000003', '겨울방학 숲체험 특강 안내', '2026-11-10T09:00:00.000Z'),
    post('2000002', '겨울방학 숲체험 특강 안내', '2026-10-01T09:00:00.000Z'), // 예전에 같은 제목으로 쓴 글 (글보다 먼저 발행)
    post('2000001', '가을 운동회 결과', '2026-11-09T09:00:00.000Z'),
  ];
  const arts = [
    { id: 'x', titles: ['[보라매] 겨울방학 숲체험 특강 안내'], createdAt: '2026-11-10T01:00:00.000Z' },
    { id: 'y', titles: ['가을 운동회 결과 소식', '가을 운동회 결과'], createdAt: '2026-11-08T01:00:00.000Z' },
    { id: 'z', titles: ['전혀 다른 글'], createdAt: '2026-11-08T01:00:00.000Z' },
  ];
  const m = matchPosts(arts, posts);
  assert.equal(m.get('x')?.url, 'https://blog.naver.com/mine/2000003');
  assert.equal(m.get('y')?.url, 'https://blog.naver.com/mine/2000001');
  assert.equal(m.has('z'), false);
  assert.equal(matchPosts(arts, posts, new Set(['https://blog.naver.com/mine/2000003'])).has('x'), false);
});

test('검색어: 주요 → 보조 → 직접 추가, 띄어쓰기만 다른 것은 하나로, 최대 개수', () => {
  assert.deepEqual(keywordsOf('보라매 유치원', ['보라매유치원', ' 숲체험  특강 ', ''], ['신대방 유치원']), ['보라매 유치원', '숲체험 특강', '신대방 유치원']);
  assert.equal(keywordsOf('a', ['b', 'c'], ['d', 'e', 'f', 'g']).length, RANK_KEYWORDS_MAX);
  assert.deepEqual(keywordsOf(undefined, undefined), []);
});

test('화면 문구: 순위 · 변화', () => {
  assert.equal(rankText(null), '90위 밖');
  assert.equal(rankText(null, 90), '90위 밖');
  assert.equal(rankText(null, 78), '78위까지 봤는데 없음'); // 90개 전에 끝났을 때
  assert.equal(rankText(3), '3위');
  assert.equal(changeText(5, undefined), null); // 처음 확인
  assert.deepEqual(changeText(5, 12), { text: '▲ 7', kind: 'up' });
  assert.deepEqual(changeText(12, 5), { text: '▼ 7', kind: 'down' });
  assert.deepEqual(changeText(5, 5), { text: '그대로', kind: 'same' });
  assert.deepEqual(changeText(5, null), { text: '새로 보임', kind: 'new' });
  assert.deepEqual(changeText(null, 5), { text: '안 보임', kind: 'gone' });
  assert.equal(changeText(null, null), null);
});

test('블로그 주소 → 아이디: 첫 화면 · 글 주소 · 모바일 · PostList · 아이디만', () => {
  assert.equal(blogIdFrom('https://blog.naver.com/SunnyKinder'), 'sunnykinder');
  assert.equal(blogIdFrom('blog.naver.com/sunnykinder/'), 'sunnykinder');
  assert.equal(blogIdFrom('https://m.blog.naver.com/sunnykinder?tab=1'), 'sunnykinder');
  assert.equal(blogIdFrom('https://blog.naver.com/sunnykinder/224451496312'), 'sunnykinder');
  assert.equal(blogIdFrom('https://blog.naver.com/PostList.naver?blogId=sunnykinder&categoryNo=0'), 'sunnykinder');
  assert.equal(blogIdFrom('sunnykinder'), 'sunnykinder');
  assert.equal(blogIdFrom('https://cafe.naver.com/sunnykinder'), null);
  assert.equal(blogIdFrom('강남 유치원'), null);
  assert.equal(blogIdFrom(''), null);
});

test('한 번 검색으로 블로그 글 전부의 자리 · 글마다 결과 (없으면 우리 다른 글 가장 높은 것)', () => {
  const u = (id: string, no: string) => `https://blog.naver.com/${id}/${no}`;
  const m = ranksOf([u('a', '1000001'), u('mine', '2000001'), u('a', '1000001'), u('MINE', '2000002'), u('mine', '2000001')], 'mine');
  assert.deepEqual([...m], [[u('mine', '2000001'), 2], [u('mine', '2000002'), 4]]);
  const s = { keyword: 'k', checkedAt: '2026-11-11T00:00:00.000Z', totalBlogs: 8, hits: [{ url: u('mine', '2000001'), blogRank: 2, totalRank: null }, { url: u('mine', '2000002'), blogRank: 4, totalRank: 1 }] };
  assert.deepEqual(checkFrom(s, u('mine', '2000002')), { keyword: 'k', blogRank: 4, totalRank: 1, otherRank: null, otherUrl: null, checkedAt: s.checkedAt, seen: null });
  assert.deepEqual(checkFrom({ ...s, seen: 60 }, u('mine', '2000009')), { keyword: 'k', blogRank: null, totalRank: null, otherRank: 2, otherUrl: u('mine', '2000001'), checkedAt: s.checkedAt, seen: 60 });
});

test('글의 검색어: 직접 → 앱 글 검색어 → 태그 앞 2개 → 제목 첫 마디', () => {
  const post = { title: '[보라매 유치원] 겨울방학 숲체험 특강, 신청 받아요!', tags: ['보라매유치원', '신대방유치원', '숲체험특강'] };
  assert.deepEqual(postKeywords(post, ['내 검색어'], ['앱 검색어']), { keywords: ['내 검색어'], source: 'custom' });
  assert.deepEqual(postKeywords(post, null, ['보라매 유치원', '숲체험']), { keywords: ['보라매 유치원', '숲체험'], source: 'app' });
  assert.deepEqual(postKeywords(post, [], null), { keywords: ['보라매유치원', '신대방유치원'], source: 'tag' });
  assert.deepEqual(postKeywords({ ...post, tags: [] }, null, null), { keywords: ['겨울방학 숲체험 특강'], source: 'title' });
  assert.equal(titleKeyword('송파사립유치원 잠실사립유치원 등원이 기다려지는 곳 햇살유치원 이야기'), '송파사립유치원 잠실사립유치원 등원이');
  assert.equal(titleKeyword('!'), null);
});

test('저장소: 블로그 글(직접 정한 검색어는 RSS로 새로 받아도 그대로) · 검색 기록 · 원인 분석', () => {
  const db = openDb(':memory:');
  const u1 = 'https://blog.naver.com/mine/2000001', u2 = 'https://blog.naver.com/mine/2000002';
  db.saveBlogPosts('mine', [{ url: u1, title: '옛 제목', publishedAt: '2026-11-01T00:00:00.000Z', tags: ['a'] }, { url: u2, title: '둘째', publishedAt: '2026-11-05T00:00:00.000Z', tags: [] }]);
  db.setPostKeywords(u1, ['보라매 유치원']);
  db.saveBlogPosts('mine', [{ url: u1, title: '새 제목', publishedAt: '2026-11-01T00:00:00.000Z', tags: ['b'] }]);
  assert.deepEqual(db.getBlogPost(u1), { url: u1, blogId: 'mine', title: '새 제목', publishedAt: '2026-11-01T00:00:00.000Z', tags: ['b'], keywords: ['보라매 유치원'] });
  assert.deepEqual(db.listBlogPosts('mine').map((x) => x.url), [u1]); // 가장 최근에 받은 목록만 (u2 는 RSS 에서 빠짐)
  db.saveBlogPosts('mine', [{ url: u1, title: '새 제목', publishedAt: '2026-11-01T00:00:00.000Z', tags: ['b'] }, { url: u2, title: '둘째', publishedAt: '2026-11-05T00:00:00.000Z', tags: [] }]);
  assert.deepEqual(db.listBlogPosts('mine').map((x) => x.url), [u2, u1]); // 최근 글 먼저
  db.setPostKeywords(u1, null);
  assert.equal(db.getBlogPost(u1)!.keywords, null);
  db.addRankSearch('mine', '보라매 유치원', [{ url: u1, blogRank: 12, totalRank: null }], 6);
  db.addRankSearch('mine', '보라매 유치원', [{ url: u1, blogRank: 5, totalRank: 2 }], 7, 78);
  db.raw.prepare("INSERT INTO rank_searches (blog_id,keyword,hits_json,total_blogs,checked_at) VALUES ('mine','옛 모양','[]',NULL,?)").run(new Date().toISOString()); // 예전 모양도 읽음
  db.addRankSearch('other', '보라매 유치원', [], 7);
  assert.deepEqual(db.rankSearches('mine').map((x) => [x.hits[0]?.blogRank ?? null, x.seen]), [[12, null], [5, 78], [null, null]]);
  assert.equal(db.countRankSearches(new Date(Date.now() - 60_000).toISOString()), 4);
  db.close();
});

test('월간 검색량: 숫자면 더하고 쉼표, "< 10" 이 섞이면 원문대로, 없으면 null', async () => {
  const { volumeText, volumeId } = await import('../../src/shared/rank');
  assert.deepEqual(volumeText({ pc: '1200', mobile: '5600' }), { total: '6,800', detail: 'PC 1,200 · 모바일 5,600' });
  assert.deepEqual(volumeText({ pc: '< 10', mobile: '30' }), { total: '30', detail: 'PC < 10 · 모바일 30' });
  assert.equal(volumeText(null), null);
  assert.equal(volumeText({}), null);
  assert.equal(volumeId(' 강남  유치원 '), '강남유치원');
});

test('자료 버전 5: 버전 4 자료를 열면 올리기 전 복사본(.before-v4)을 남기고 노출 순위 표가 생김', async () => {
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  const { SCHEMA_VERSION } = await import('../../src/main/db');
  assert.equal(SCHEMA_VERSION, 5);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtd-rank-db-'));
  const file = path.join(dir, 'app.db');
  try {
    const old = openDb(file);
    old.raw.exec('DROP TABLE blog_posts; DROP TABLE rank_searches; DROP TABLE post_diagnoses; PRAGMA user_version = 4;');
    old.close();
    const db = openDb(file);
    assert.ok(fs.existsSync(file + '.before-v4'));
    assert.equal(Number((db.raw.prepare('PRAGMA user_version').get() as any).user_version), 5);
    db.saveBlogPosts('mine', [{ url: 'https://blog.naver.com/mine/2000001', title: '가을 운동회', publishedAt: null, tags: [] }]);
    assert.equal(db.listBlogPosts('mine').length, 1);
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('동네 이름 추천에 붙일 이름: 소재 동 + 가까운 아파트 + 직접 적은 아파트 · 단지 (학교 · 다른 유치원은 뺌)', async () => {
  const { searchPlaces } = await import('../../src/shared/areas');
  const areas = [
    { kind: '아파트', name: '보라매삼성', distance: 200, source: 'kakao' },
    { kind: '아파트', name: '먼아파트', distance: 900, source: 'kakao' }, // 500m 밖
    { kind: '학교', name: '보라매초등학교', distance: 300, source: 'kakao' },
    { kind: '유치원', name: '햇살유치원', distance: 100, source: 'kakao' },
    { kind: '아파트', name: '신대방현대아파트', source: 'manual' },
    { kind: '학교', name: '보라매초', source: 'manual' },
  ] as any;
  assert.deepEqual(searchPlaces('서울 동작구 신대방동', areas), ['신대방동', '신대방현대아파트', '보라매삼성아파트']);
});
