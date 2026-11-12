// 붙여넣기 도우미 (태권 글뚝딱 2.8.0에서 옮김). 유치원판에는 사진 글 · GIF · 영상 · 서명 배너가 없어서 그 시험은 뺐어요
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blocksToHtml, pasteSteps } from '../../src/main/services/paste-helper';
import { buildBlocks } from '../../src/main/services/browser-draft';
import { checklist, remap, tagPos } from '../../src/shared/paste';

const sections = [
  { id: 's1', paragraphs: ['도입 문단'] },
  { id: 's2', heading: '🌱 오늘 한 놀이', paragraphs: ['놀이 문단 하나', '놀이 문단 둘'] },
  { id: 's3', heading: '💡 마무리', paragraphs: ['마무리 문단'] },
];

test('제목 → 서식 → 글 → 그림 → 글 순서로 나누고, 이어진 글은 한 번에 복사', () => {
  const blocks = buildBlocks(sections, [{ title: '카드 하나', afterSectionId: 's1' }], ['신대방동유치원']);
  const r = pasteSteps({ title: '시험 제목', blocks, files: [{ index: 0, file: 'C:/x/card1.png' }] });
  assert.deepEqual(r.steps.map((s) => s.kind), ['title', 'style', 'text', 'media', 'text']);
  assert.equal(r.steps[0].kind === 'title' && r.steps[0].text, '시험 제목');
  const last = r.steps[4];
  assert.ok(last.kind === 'text' && last.text.includes('놀이 문단 하나') && last.text.includes('마무리 문단') && last.text.endsWith('#신대방동유치원'));
  assert.equal(last.label, '🌱 오늘 한 놀이');
  assert.deepEqual(r.files[3], ['C:/x/card1.png']);
});

test('붙어 있는 카드는 한 단계로 묶고, 파일이 없는 자리는 따로 알림', () => {
  const blocks = buildBlocks(sections, [{ title: '첫 카드', afterSectionId: 's3', index: 0 }, { title: '둘째 카드', afterSectionId: 's3', index: 1 }, { title: '셋째 카드', afterSectionId: 's3', index: 2 }]);
  const r = pasteSteps({ title: 't', blocks, files: [{ index: 0, file: 'a.png' }, { index: 2, file: 'c.png' }] });
  const m = r.steps.find((s) => s.kind === 'media');
  assert.ok(m && m.kind === 'media');
  assert.deepEqual(m.items.map((i) => i.label), ['카드 1 · 첫 카드', '카드 3 · 셋째 카드']);
  assert.deepEqual(m.missing, ['카드 2 · 둘째 카드']);
  assert.equal(m.label, '그림 3장');
});

test('그림으로 복사할 수 없는 파일은 파일 위치만', () => {
  const blocks = buildBlocks(sections, [{ title: '카드', afterSectionId: 's1' }]);
  const r = pasteSteps({ title: 't', blocks, files: [{ index: 0, file: 'card.gif' }] });
  const m = r.steps.find((s) => s.kind === 'media');
  assert.ok(m && m.kind === 'media' && m.items[0].image === false);
});

test('지도는 맨 끝, 유치원 이름 · 주소만 복사', () => {
  const r = pasteSteps({ title: 't', blocks: buildBlocks(sections, []), files: [], place: { name: '햇살유치원', address: '서울 동작구 1' } });
  const p = r.steps.at(-1)!;
  assert.ok(p.kind === 'place' && p.name === '햇살유치원' && p.address === '서울 동작구 1' && p.label === '유치원 지도');
});

test('제목 다음에 본문 서식 안내 (자동 입력과 같은 값, 복사할 파일 없음)', () => {
  const r = pasteSteps({ title: 't', blocks: buildBlocks(sections, []), files: [] });
  const s = r.steps[1];
  assert.ok(s.kind === 'style');
  assert.deepEqual(s.picks, ['나눔스퀘어', '16', '가운데 정렬', '180%']);
  assert.deepEqual(r.files[1], []);
});

test('하던 단계 찾기: 지도 단계가 끝에 붙어도 같은 그림 단계로', () => {
  const before = pasteSteps({ title: 't', blocks: buildBlocks(sections, [{ title: '카드 하나', afterSectionId: 's1' }]), files: [{ index: 0, file: 'c.png' }] });
  const pos = tagPos(before, { step: 3, item: 0 });
  assert.equal(pos.kind, 'media');
  const after = pasteSteps({ title: '바뀐 제목', blocks: buildBlocks(sections, [{ title: '카드 하나', afterSectionId: 's1' }]), files: [{ index: 0, file: 'c.png' }], place: { name: '햇살유치원' } });
  assert.equal(after.steps[remap(after, pos).step].kind, 'media');
});

test('하던 단계 찾기: 같은 이름이 여럿이면 원래 번호에 가까운 것, 끝났으면 끝 그대로, 이름이 없으면 번호를 목록 안으로', () => {
  const m = (label: string) => ({ kind: 'media' as const, label, items: [{ label: 'a', image: true }, { label: 'b', image: true }], missing: [] });
  const plan = { steps: [{ kind: 'title' as const, label: '제목', text: 't' }, m('그림 2장'), { kind: 'text' as const, label: 'x', text: 'x', html: '', heads: [] }, m('그림 2장')] };
  assert.deepEqual(remap(plan, { step: 3, item: 1, kind: 'media', label: '그림 2장' }), { step: 3, item: 1 });
  assert.deepEqual(remap(plan, { step: 9, item: 0, kind: 'done' }), { step: 4, item: 0 });
  assert.deepEqual(remap(plan, { step: 9, item: 0 }), { step: 4, item: 0 });
  assert.deepEqual(remap(plan, { step: 2, item: 0, kind: 'text', label: '없는 글' }), { step: 2, item: 0 });
});

test('소제목 꾸며서 복사: 글자 · 줄 나눔은 글자만 복사와 같고, 소제목 줄만 굵게 · 24', () => {
  const blocks = buildBlocks([{ id: 's1', heading: '🌱 <놀이> & 이야기', paragraphs: ['첫 문단'] }], [], ['신대방동유치원']);
  const r = pasteSteps({ title: 't', blocks, files: [] });
  const s = r.steps[2];
  assert.ok(s.kind === 'text');
  assert.deepEqual(s.heads, ['🌱 <놀이> & 이야기']);
  assert.equal(s.html, blocksToHtml(blocks));
  const htmlLines = [...s.html.matchAll(/<p[^>]*>(.*?)<\/p>/g)].map((x) => x[1].replace(/<br>/g, '').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  assert.deepEqual(htmlLines, s.text.split('\n'));
  assert.ok(s.html.includes('<b><span style="font-size:24px">🌱 &lt;놀이&gt; &amp; 이야기</span></b>'));
  assert.ok(!s.html.includes('<b><span style="font-size:24px">첫 문단'), '문단은 굵게 하지 않음');
});

test('끝 점검표: 소제목 · 그림 · 지도가 있을 때만 그 줄이 나옴', () => {
  const full = pasteSteps({ title: 't', blocks: buildBlocks(sections, [{ title: '카드 하나', afterSectionId: 's1' }]), files: [{ index: 0, file: 'c.png' }], place: { name: '햇살유치원' } });
  const c = checklist(full.steps);
  assert.deepEqual(c.map((x) => x.key), ['title', 'text', 'heads', 'imgs', 'place']);
  assert.ok(c[2].label.includes('소제목 2개') && c[2].label.includes('🌱 오늘 한 놀이') && c[2].label.includes('💡 마무리'));
  assert.ok(c[3].label.includes('그림 1장'));
  assert.ok(c[4].label.includes('유치원 지도') && !/도장|태권/.test(c[4].label));
  const bare = checklist(pasteSteps({ title: 't', blocks: buildBlocks([{ id: 's1', paragraphs: ['a'] }], []), files: [] }).steps);
  assert.deepEqual(bare.map((x) => x.key), ['title', 'text']);
});

test('두 줄로 나뉜 소제목은 점검표에서 한 개로, 붙이는 글에서는 두 줄 다 굵게', () => {
  const blocks = [{ kind: 'heading' as const, text: '🌱 한 가지씩\n이어 가는 놀이' }, { kind: 'paragraph' as const, text: '문단' }];
  const s = pasteSteps({ title: 't', blocks, files: [] }).steps[2];
  assert.ok(s.kind === 'text');
  assert.deepEqual(s.heads, ['🌱 한 가지씩 이어 가는 놀이']);
  assert.equal([...s.html.matchAll(/<b><span style="font-size:24px">/g)].length, 2);
});

test('글쓴이 줄은 본문 끝 글에 그대로 들어감 (따로 단계 없음)', () => {
  const blocks = buildBlocks([{ id: 's1', paragraphs: ['도입'] }, { id: 's2', heading: '마무리', paragraphs: ['끝인사예요.', '햇님반 담임 선생님 드림'] }], []);
  const r = pasteSteps({ title: 't', blocks, files: [] });
  const last = r.steps.at(-1)!;
  assert.ok(last.kind === 'text' && last.text.includes('햇님반 담임 선생님 드림'));
});
