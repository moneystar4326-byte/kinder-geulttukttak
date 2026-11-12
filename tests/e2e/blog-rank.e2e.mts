// 노출 순위 화면 시험 (태권 글뚝딱 2.8.0에서 옮김): 바깥 접속 없이 가짜 네이버 화면 · 가짜 RSS 로 확인
// - 태권판 시험은 실제 네이버를 읽지만, 유치원판은 순위 창(숨긴 창 · 보기 창)의 https 를 앱 안에서 가짜 화면으로 돌려주고 RSS 받기도 가짜로 바꿈
//   (이용권 서버도 이 PC 안의 닫힌 주소로). 로그인 · 글쓰기 없음
// - 유치원 블로그 주소로 최근 글을 불러옴 → 앱으로 쓴 글은 앱 검색어, 나머지는 태그 → 순위 확인 → 검색어별 보기 → 원인 분석 → 검색 화면에서 보기
// 실행: node scripts/build.mjs && npx tsx tests/e2e/blog-rank.e2e.mts [결과 폴더]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright-core';
import { openDb } from '../../src/main/db';
import { DEMO_PROFILE } from '../../src/main/services/openai/demo';

const outDir = process.argv[2] ?? fs.mkdtempSync(path.join(os.tmpdir(), 'gtd-rank-out-'));
fs.mkdirSync(outDir, { recursive: true });
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtd-rank-e2e-'));
const blogId = 'sunnykinder';
const keyword = '신대방동 유치원';
const postA = { no: '224400000001', title: '가을 운동회 이야기, 햇님반 아이들의 이어달리기', tags: ['신대방동유치원', '유치원운동회'] };
const postB = { no: '224400000002', title: '숲체험 다녀왔어요', tags: ['유치원숲체험', '보라매유치원'] };
const postC = { no: '224400000003', title: '입학설명회 안내', tags: ['신대방동유치원입학'] };
const at = (h: number) => new Date(Date.now() - h * 3600_000).toUTCString();
const rss = `<?xml version="1.0" encoding="UTF-8"?><rss><channel><title>햇살유치원</title>
${[[postA, 24 * 6], [postB, 24 * 9], [postC, 24 * 12]].map(([p, h]: any) => `<item><tag><![CDATA[${p.tags.join(',')}]]></tag><title><![CDATA[${p.title}]]></title><link>https://blog.naver.com/${blogId}/${p.no}?fromRss=true</link><guid>https://blog.naver.com/${blogId}/${p.no}</guid><pubDate>${at(h)}</pubDate></item>`).join('\n')}
</channel></rss>`;

const seed = openDb(path.join(dataDir, 'app.db'));
seed.setSetting('app', { setupDone: true });
seed.saveProfile({ ...DEMO_PROFILE, id: 'default', name: '햇살유치원', region: '서울 동작구 신대방동', blogUrl: `https://blog.naver.com/${blogId}`, nearbyAreas: [{ kind: '아파트', name: '보라매삼성', distance: 200, source: 'kakao' }, { kind: '유치원', name: '이웃유치원', distance: 100, source: 'kakao' }] } as any);
// 앱으로 쓴 글 하나 (블로그 글 A와 제목이 같음, 머리말만 다름) → 그 글은 앱 검색어로
const a = seed.createArticle('default', { kind: '수업 후기', audience: '유아 (만 3~5세)', region: '', topic: '시험', facts: {}, mainKeyword: keyword, subKeywords: [], tone: '따뜻한 설명형', ending: '', includeProfile: { philosophy: false, classFeatures: false, credentials: false, contact: false, address: false }, withCards: false } as any, [], false);
seed.addVersion({ articleId: a.id, title: `[신대방동 유치원] ${postA.title}`, doc: { titleCandidates: [], sections: [{ id: 's1', paragraphs: ['문단'] }], tags: [], photoSuggestions: [], reviewFlags: [] } as any, counts: { withSpaces: 2, withoutSpaces: 2 }, note: '시험' });
seed.raw.prepare('UPDATE articles SET created_at=? WHERE id=?').run(new Date(Date.now() - 24 * 7 * 3600_000).toISOString(), a.id);
seed.close();

const { ELECTRON_RUN_AS_NODE: _a, GTD_DATA_DIR: _b, ...env } = process.env;
const app = await electron.launch({ args: ['.'], env: { ...env, GTD_DATA_DIR: dataDir, GTD_SERVER: 'http://127.0.0.1:9', GTD_LICENSE_OFF: '1' } as any });
try {
  // tsx 가 함수 이름을 남기려고 넣는 __name 을 앱 쪽에도 둠 (아래 evaluate 안의 함수들)
  await app.evaluate('globalThis.__name = (f) => f' as any);
  // 가짜 네이버: 순위 창 두 세션의 https 를 모두 여기서 답함 (모르는 주소는 404, 바깥으로 나가지 않음) · RSS 는 fetch 를 바꿔 답함
  const seen = await app.evaluate(({ session }, o) => {
    const log: string[] = [];
    (globalThis as any).__rankLog = log;
    const html = (body: string) => new Response(`<!doctype html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    const ours = (no: string) => `https://blog.naver.com/${o.blogId}/${no}`;
    // 블로그 탭 90자리: A 는 15위, C 는 40위, 나머지는 다른 블로그
    const blogTab = () => Array.from({ length: 90 }, (_, i) => (i + 1 === 15 ? ours(o.a) : i + 1 === 40 ? ours(o.c) : `https://blog.naver.com/other${i + 1}/${3000000 + i}`));
    const handler = (req: Request) => {
      const u = new URL(req.url);
      log.push(u.host + u.pathname);
      if (u.host === 'search.naver.com') {
        const q = u.searchParams.get('query') ?? '';
        if (u.searchParams.get('ssc') === 'tab.blog.all') return html(blogTab().map((x, i) => `<div class="item" data-url="${x}"><a href="${x}">${q} 글 ${i + 1}</a></div>`).join(''));
        return html(`<div id="main_pack">${[1, 2, 3, 4, 5].map((i) => `<a href="https://blog.naver.com/other${i}/${3000000 + i - 1}">통합 ${i}</a>`).join('')}</div>`);
      }
      if (u.host === 'blog.naver.com' && /^\/PostView/.test(u.pathname)) {
        const id = u.searchParams.get('blogId'), no = u.searchParams.get('logNo');
        const mine = id === o.blogId;
        const title = mine ? o.titleA : `${o.keyword} 이야기 ${no}`;
        const text = mine ? `${o.keyword} 아이들이 운동회를 했어요.` : `${o.keyword} 소식이에요. `.repeat(4) + '놀이 이야기 '.repeat(200);
        const imgs = '<div class="se-module-image"><img></div>'.repeat(mine ? 2 : 10);
        return html(`<div class="se-title-text">${title}</div><span class="se_publishDate">2026. 11. 1. 09:00</span><div class="se-main-container">${text}${imgs}</div>`);
      }
      return new Response('', { status: 404 });
    };
    for (const p of ['gtd-rank', 'gtd-rank-view']) session.fromPartition(p).protocol.handle('https', handler);
    const real = globalThis.fetch;
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = String(input?.url ?? input);
      log.push('fetch ' + url.replace(/^https?:\/\//, '').split('?')[0]);
      if (url.startsWith(`https://rss.blog.naver.com/${o.blogId}.xml`)) return new Response(o.rss, { headers: { 'content-type': 'application/xml' } });
      if (/^http:\/\/127\.0\.0\.1:9\b/.test(url)) return real(input, init); // 닫힌 주소: 곧바로 실패
      throw new TypeError('시험: 바깥 접속 막음 ' + url.slice(0, 60));
    }) as typeof fetch;
    return 'ok';
  }, { blogId, a: postA.no, c: postC.no, titleA: postA.title, keyword, rss });
  assert.equal(seen, 'ok');

  const page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e.stack).slice(0, 600)));
  const shot = (n: string) => page.screenshot({ path: path.join(outDir, n), fullPage: true });
  await page.waitForSelector('.side');
  await page.click('button.nav:has-text("노출 순위")');

  // 1) 유치원 블로그 주소가 들어가 있고, 최근 글이 모두 불러와짐
  const rows = page.locator('[data-testid="rank-row"]');
  await rows.first().waitFor().catch(async (e) => { await shot('fail.png'); console.log('화면 오류', errors); throw e; });
  assert.equal(await page.locator('[data-testid="rank-blog"]').inputValue(), blogId);
  assert.ok(await page.locator('text=(유치원 블로그)').count());
  assert.equal(await rows.count(), 3);
  const mine = rows.filter({ hasText: postA.title });
  assert.ok(await mine.locator('text=앱으로 쓴 글의 검색어').count(), '앱으로 쓴 글은 앱 검색어');
  assert.ok(await rows.filter({ hasText: postB.title }).locator('text=글 태그에서 고른 검색어').count(), '나머지는 태그');
  await shot('rank-loaded.png');

  // 2) 앱으로 쓴 글 순위 확인 (검색 1번) → 같은 검색어의 우리 다른 글(C)도 같이 기록됨
  await mine.locator('button:has-text("이 글 순위 확인")').click();
  await page.locator('.note.ok:has-text("이 글의 순위를 확인했어요")').waitFor({ timeout: 60_000 }).catch(async (e) => { await shot('check-fail.png'); console.log(await page.locator('.note').allInnerTexts()); throw e; });
  const cells = mine.locator('tbody tr').first().locator('td');
  assert.match(await cells.nth(2).innerText(), /15위/);
  assert.match(await cells.nth(3).innerText(), /첫 화면에 없음/);
  assert.ok(await page.locator('text=/오늘 순위 1\\/40/').count());
  await page.click('[data-testid="rank-view-keywords"]');
  const kwRow = page.locator('[data-testid="rank-keywords"] tbody tr', { hasText: keyword });
  const kwText = (await kwRow.innerText()).replace(/\s+/g, ' ');
  console.log('검색어별:', kwText);
  assert.match(kwText, /15위.*가을 운동회/);
  assert.match(kwText, /40위.*입학설명회/);
  await shot('rank-keywords.png');
  await page.click('button:has-text("글별로 보기")');

  // 3) 원인 분석 (10위 밖이라 [왜 안 나올까?])
  const why = mine.locator('[data-testid="rank-why"]').first();
  await why.click();
  const box = mine.locator('[data-testid="rank-diagnosis"]');
  await box.waitFor({ timeout: 120_000 }).catch(async (e) => { await shot('diag-fail.png'); console.log(await page.locator('.note').allInnerTexts()); throw e; });
  const diag = await box.innerText();
  console.log('원인 분석:\n' + diag.split('\n').slice(0, 16).join('\n'));
  assert.match(diag, /제목 그대로 검색하면 15위로 나와요/);
  assert.match(diag, /상위 글보다 글이 짧고 사진이 적어요/);
  assert.match(diag, /놀이 · 활동 이야기/);
  assert.match(diag, /보라매삼성아파트 유치원/); // 동네 + 유치원 추천 (주변 다른 유치원 이름은 안 붙임)
  assert.doesNotMatch(diag, /이웃유치원/);
  assert.ok(await page.locator('text=/원인 분석 1\\/10/').count());
  await box.screenshot({ path: path.join(outDir, 'rank-diagnosis.png') });

  // 4) 순위 숫자 → 네이버 검색 화면(가짜)에서 그 글 자리 표시, 표시 줄은 유치원 글뚝딱 이름
  await mine.locator('[data-testid="rank-show"]').first().click();
  let bar = '';
  for (let i = 0; i < 40 && !bar.includes('주황색'); i++) {
    await page.waitForTimeout(250);
    bar = await app.evaluate(async ({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((x) => x.getTitle().startsWith('네이버 검색에서 보기'));
      return w ? String(await w.webContents.executeJavaScript('document.getElementById("gtd-rank-bar")?.textContent || ""')) : '';
    });
  }
  console.log('검색 화면 표시:', bar);
  assert.match(bar, /^유치원 글뚝딱 · "신대방동 유치원" 블로그 탭 15위 — 주황색 테두리가 그 글이에요/);

  // 5) 유치원 말만, 바깥 접속 없음
  const all = await page.locator('.main').innerText();
  assert.ok(!/도장|관장|사범|태권/.test(all), '유치원 말만');
  const log = await app.evaluate(() => (globalThis as any).__rankLog as string[]);
  console.log('가짜로 답한 요청:', log.length, [...new Set(log)].slice(0, 8).join(' | '));
  assert.ok(log.some((x) => x.startsWith('fetch rss.blog.naver.com')));
  assert.deepEqual(errors, []);
  console.log('노출 순위 화면 시험 통과 · 화면:', outDir, '· 자료:', dataDir);
} finally {
  await app.close();
}
