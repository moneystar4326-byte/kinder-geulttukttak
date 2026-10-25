// 생성 파이프라인: 구조화 응답 검증 · 1,500자 미달 보완 횟수 제한 · 버전 덮어쓰기 방지
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../../src/main/db';
import { generateArticle, MAX_EXPAND, reviseArticle } from '../../src/main/article';
import { normalizeDoc, type TextAI } from '../../src/main/services/openai';
import { GeneratedArticleSchema } from '../../src/shared/schemas';
import { DEMO_INPUT, DEMO_PROFILE, demoText } from '../../src/main/services/openai/demo';
import type { ArticleDoc } from '../../src/shared/types';

const ctx = () => ({ signal: new AbortController().signal, step: () => {} });
const shortDoc = (n: number): ArticleDoc => ({
  titleCandidates: ['가', '나', '다'],
  sections: [{ id: 's1', paragraphs: ['짧은 글'.repeat(n)] }, { id: 's2', heading: '둘', paragraphs: ['문단'] }, { id: 's3', heading: '셋', paragraphs: ['문단'] }],
  tags: [], photoSuggestions: [], reviewFlags: [],
});

function fakeAI(over: Partial<TextAI>): TextAI & { calls: Record<string, number> } {
  const calls: Record<string, number> = {};
  const wrap = <K extends keyof TextAI>(k: K, f: TextAI[K]) => ((...a: any[]) => { calls[k] = (calls[k] ?? 0) + 1; return (f as any)(...a); }) as TextAI[K];
  const base: TextAI = { ...demoText, review: async () => [], ...over };
  const out = Object.fromEntries(Object.entries(base).map(([k, f]) => [k, wrap(k as keyof TextAI, f as any)])) as unknown as TextAI;
  return Object.assign(out, { calls });
}

function setup() {
  const db = openDb(':memory:');
  const profile = db.saveProfile(DEMO_PROFILE);
  const art = db.createArticle(profile.id, DEMO_INPUT, [], false);
  return { db, profile, art };
}

test('계속 모자라면 보완은 최대 2회, 완료 대신 추가 재료 요청', async () => {
  const { db, profile, art } = setup();
  const ai = fakeAI({ generate: async () => shortDoc(10), expand: async () => shortDoc(20) });
  const r = await generateArticle({ db, ai, profile }, art.id, ctx());
  assert.equal(ai.calls.expand, MAX_EXPAND);
  assert.equal(r.short, true);
  assert.ok(r.version.doc.reviewFlags.some((f) => f.code === 'need-more-facts'));
});

test('충분하면 보완하지 않음', async () => {
  const { db, profile, art } = setup();
  const ai = fakeAI({});
  const r = await generateArticle({ db, ai, profile }, art.id, ctx());
  assert.equal(ai.calls.expand ?? 0, 0);
  assert.equal(r.short, false);
  assert.equal(db.getArticle(art.id)!.status, 'review');
});

test('필수 재료가 빠지면 생성하지 않음', async () => {
  const { db, profile } = setup();
  const a = db.createArticle(profile.id, { ...DEMO_INPUT, facts: { ...DEMO_INPUT.facts, activities: '' } }, [], false);
  const ai = fakeAI({});
  await assert.rejects(() => generateArticle({ db, ai, profile }, a.id, ctx()), /진행 활동/);
  assert.equal(ai.calls.generate ?? 0, 0);
});

test('행사 안내는 한 줄 메모가 없으면 일시 · 장소 · 대상 · 신청 방법이 있어야 함', async () => {
  const { db, profile } = setup();
  const a = db.createArticle(profile.id, { ...DEMO_INPUT, kind: '행사 안내', facts: { ...DEMO_INPUT.facts, activities: '', event: { when: '', where: '도장', who: '', bring: '', apply: '' } } }, [], false);
  await assert.rejects(() => generateArticle({ db, ai: fakeAI({}), profile }, a.id, ctx()), /행사 일시.*행사 대상.*신청 방법/);
});

test('구조화 응답 스키마: 제목이 3개가 아니면 실패', () => {
  const bad = { titleCandidates: ['하나'], sections: [], tags: [], photoSuggestions: [], reviewFlags: [] };
  assert.equal(GeneratedArticleSchema.safeParse(bad).success, false);
  const ok = GeneratedArticleSchema.parse({ titleCandidates: ['a', 'b', 'c'], sections: [{ id: 's1', heading: '', paragraphs: ['x '] }, { id: 's1', heading: 'h', paragraphs: ['y'] }, { id: 's3', heading: 'h', paragraphs: ['z'] }], tags: ['#태그', '태그'], photoSuggestions: [{ afterSectionId: 'nope', caption: 'c' }], reviewFlags: [] });
  const doc = normalizeDoc(ok);
  assert.equal(doc.sections[0].heading, undefined);
  assert.notEqual(doc.sections[0].id, doc.sections[1].id); // id 중복 정리
  assert.deepEqual(doc.tags, ['태그']);
  assert.equal(doc.photoSuggestions.length, 0); // 없는 섹션 가리키는 사진 제안 제거
});

test('AI 수정 결과가 사용자가 그새 저장한 글을 덮어쓰지 않음', async () => {
  const { db, profile, art } = setup();
  const g = await generateArticle({ db, ai: fakeAI({}), profile }, art.id, ctx());
  const base = g.version.id;
  // 사용자가 직접 고쳐 저장 → 현재 버전이 바뀜
  const edited = db.addVersion({ articleId: art.id, title: '사용자 제목', doc: g.version.doc, counts: g.version.counts, note: '직접 편집' }, { makeCurrent: true });
  // 그 전에 요청했던 "더 따뜻하게" 결과가 늦게 도착
  const r = await reviseArticle({ db, ai: fakeAI({}), profile }, art.id, { kind: 'warmer', baseVersionId: base }, ctx());
  assert.equal(r.stale, true);
  assert.equal(r.current, false);
  assert.equal(db.getArticle(art.id)!.currentVersionId, edited.version.id);
  assert.equal(db.listVersions(art.id).length, 3); // AI 결과는 이력에 남음
});

test('이전 버전으로 되돌리기', async () => {
  const { db, profile, art } = setup();
  const g = await generateArticle({ db, ai: fakeAI({}), profile }, art.id, ctx());
  db.addVersion({ articleId: art.id, title: '새 제목', doc: g.version.doc, counts: g.version.counts, note: '직접 편집' });
  db.setCurrentVersion(art.id, g.version.id);
  assert.equal(db.getArticle(art.id)!.currentVersionId, g.version.id);
});

test('제목 머리말은 코드가 붙임', async () => {
  const { db, profile } = setup();
  const a = db.createArticle(profile.id, { ...DEMO_INPUT, titlePrefix: '[보라매초 근처 태권도]' }, [], false);
  const g = await generateArticle({ db, ai: fakeAI({}), profile }, a.id, ctx());
  assert.ok(g.version.title.startsWith('[보라매초 근처 태권도] '));
});

test('재실행 시 돌던 작업은 interrupted', () => {
  const { db, art } = setup();
  db.createJob('article', art.id, '글 생성 중');
  db.setArticleStatus(art.id, 'generating');
  assert.equal(db.recoverInterrupted(), 1);
  assert.equal(db.recentJobs(art.id)[0].state, 'interrupted');
  assert.equal(db.getArticle(art.id)!.status, 'draft');
});

test('AI 작업이 도는 동안의 직접 편집은 새 버전으로 (AI가 base로 잡은 버전을 덮어쓰지 않음)', async () => {
  const { db, profile, art } = setup();
  const g = await generateArticle({ db, ai: fakeAI({}), profile }, art.id, ctx());
  const e1 = db.saveUserEdit(art.id, '편집1', g.version.doc, g.version.counts);
  const job = db.createJob('revise', art.id, '고치는 중'); // AI 작업 시작 (base = e1)
  const e2 = db.saveUserEdit(art.id, '편집2', g.version.doc, g.version.counts);
  assert.notEqual(e2.id, e1.id);
  assert.equal(db.getVersion(e1.id)!.title, '편집1'); // base 버전은 그대로
  db.updateJob(job.id, { state: 'succeeded' });
  const e3 = db.saveUserEdit(art.id, '편집3', g.version.doc, g.version.counts);
  assert.equal(e3.id, e2.id); // 작업이 끝나면 다시 한 버전에 이어서 저장
});

test('사실 점검 중에 멈추면 저장하지 않음', async () => {
  const { db, profile, art } = setup();
  const ac = new AbortController();
  const ai = fakeAI({ review: async () => { ac.abort(); throw Object.assign(new Error('멈춤'), { name: 'AbortError' }); } });
  await assert.rejects(() => generateArticle({ db, ai, profile }, art.id, { signal: ac.signal, step: () => {} }));
  assert.equal(db.listVersions(art.id).length, 0);
});

// 흐름 다듬기 (2026-10-18)
test('흐름 다듬기는 한 번, 다듬은 본문을 저장하고 제목 후보 · 태그는 유지', async () => {
  const { db, profile, art } = setup();
  const ai = fakeAI({
    polish: async (d) => ({ ...d, titleCandidates: ['바뀐', '제목', '들'], sections: d.sections.map((s, i) => (i === 0 ? { ...s, paragraphs: ['다듬은 첫 문단 ' + s.paragraphs.join(' ')] } : s)) }),
  });
  const r = await generateArticle({ db, ai, profile }, art.id, ctx());
  assert.equal(ai.calls.polish, 1);
  assert.ok(r.version.doc.sections[0].paragraphs[0].startsWith('다듬은 첫 문단'));
  assert.notDeepEqual(r.version.doc.titleCandidates, ['바뀐', '제목', '들']);
});

test('다듬기가 실패하거나 분량 · 섹션을 줄이면 다듬기 전 글을 씀', async () => {
  for (const polish of [async () => { throw new Error('형식 오류'); }, async (d: ArticleDoc) => ({ ...d, sections: d.sections.slice(0, 1) })] as TextAI['polish'][]) {
    const { db, profile, art } = setup();
    const r = await generateArticle({ db, ai: fakeAI({ polish }), profile }, art.id, ctx());
    assert.ok(r.version.doc.sections.length > 1);
    assert.equal(r.short, false);
  }
});

test('다듬기 중에 멈추면 저장하지 않음', async () => {
  const { db, profile, art } = setup();
  const ac = new AbortController();
  const ai = fakeAI({ polish: async () => { ac.abort(); throw Object.assign(new Error('멈춤'), { name: 'AbortError' }); } });
  await assert.rejects(() => generateArticle({ db, ai, profile }, art.id, { signal: ac.signal, step: () => {} }));
  assert.equal(db.listVersions(art.id).length, 0);
});

test('행사 안내는 1,000자면 보완하지 않고, 짧다는 점검도 없음', async () => {
  const { db, profile } = setup();
  const a = db.createArticle(profile.id, { ...DEMO_INPUT, kind: '행사 안내' }, [], false);
  const doc1100: ArticleDoc = { titleCandidates: ['가', '나', '다'], sections: [{ id: 's1', paragraphs: ['가'.repeat(600)] }, { id: 's2', heading: '둘', paragraphs: ['나'.repeat(500)] }], tags: [], photoSuggestions: [], reviewFlags: [] };
  const ai = fakeAI({ generate: async () => doc1100, polish: async (d) => d });
  const r = await generateArticle({ db, ai, profile }, a.id, ctx());
  assert.equal(ai.calls.expand ?? 0, 0);
  assert.equal(r.short, false);
  assert.ok(!r.version.doc.reviewFlags.some((f) => f.code === 'too-short' || f.code === 'need-more-facts'));
});
