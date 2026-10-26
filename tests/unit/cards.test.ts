// 카드: 한 장 실패해도 다른 장 유지, 문구 수정 시 이미지 API 재호출 없음, 실패 카드만 재시도
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../../src/main/db';
import { createCardService, type Shooter } from '../../src/main/services/card-renderer';
import type { ImageAI } from '../../src/main/services/openai';
import { DEMO_INPUT, DEMO_PROFILE } from '../../src/main/services/openai/demo';
import { ApiError } from '../../src/main/services/errors';
import { buildBlocks } from '../../src/main/services/browser-draft';
import { backgroundPrompt } from '../../src/main/services/openai/image-prompt';

const fakeShooter: Shooter = { async shoot(_h, _w, _hh, out) { fs.writeFileSync(out, 'png'); return { overflow: false, titleLines: 1, subLines: 2, broken: [], fontsOk: true }; } };

function setup(image: ImageAI) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtd-cards-'));
  const db = openDb(':memory:');
  db.saveProfile(DEMO_PROFILE);
  const a = db.createArticle('default', DEMO_INPUT, [], false);
  const v = db.addVersion({ articleId: a.id, title: 't', doc: { titleCandidates: [], sections: [{ id: 's1', paragraphs: ['p'] }], tags: [], photoSuggestions: [], reviewFlags: [] }, counts: { withSpaces: 1, withoutSpaces: 1 }, note: '' }).version;
  const cs = db.createCardSet(v.id, { style: '따뜻한 일러스트', size: '1080x1350', mode: 'ai' }, [0, 1, 2].map((i) => ({ title: `제목${i}`, sub: '보조 문구입니다', scene: 'scene' })));
  const svc = createCardService({ db, image, shooter: fakeShooter, assetsDir: dir, fontDir: dir, profile: () => db.getProfile(), autoRetry: 1, monthlyImageLimit: 50 });
  return { db, cs, svc };
}

test('두 번째 카드만 실패해도 1 · 3번은 유지, 실패한 장만 다시', async () => {
  let calls = 0;
  let failSecond = true;
  const image: ImageAI = { async background() { calls++; if (failSecond && calls === 2) throw new ApiError('permission', '권한 없음', 'OpenAI 이미지'); return Buffer.from('bg'); } };
  const { db, cs, svc } = setup(image);
  const r = await svc.renderSet(cs.id);
  assert.deepEqual(r.cards.map((c) => c.status), ['done', 'failed', 'done']);
  assert.equal(r.status, 'partial');
  assert.equal(calls, 3); // 권한 오류는 자동 재시도 안 함
  failSecond = false;
  const r2 = await svc.renderSet(cs.id, { onlyFailed: true });
  assert.deepEqual(r2.cards.map((c) => c.status), ['done', 'done', 'done']);
  assert.equal(calls, 4); // 실패한 1장만 다시
  void db;
});

test('일시 오류는 정해진 횟수만 자동 재시도', async () => {
  let calls = 0;
  const image: ImageAI = { async background() { calls++; throw new ApiError('server', '서버', 'OpenAI 이미지', true); } };
  const { db, cs, svc } = setup(image);
  const c = await svc.renderOne(cs.cards[0].id);
  assert.equal(c.status, 'failed');
  assert.equal(calls, 2); // 1 + autoRetry 1
  void db;
});

test('문구 수정은 배경을 다시 만들지 않음', async () => {
  let calls = 0;
  const image: ImageAI = { async background() { calls++; return Buffer.from('bg'); } };
  const { db, cs, svc } = setup(image);
  await svc.renderSet(cs.id);
  assert.equal(calls, 3);
  const bg = db.getCard(cs.cards[0].id)!.backgroundPath;
  const c = await svc.updateCopy(cs.cards[0].id, { title: '새 제목', sub: '새 보조 문구입니다', scene: 'scene' });
  assert.equal(calls, 3);
  assert.equal(c.backgroundPath, bg);
  assert.equal(c.copy.title, '새 제목');
});

test('월 한도에 닿으면 이미지 요청을 보내지 않음', async () => {
  let calls = 0;
  const image: ImageAI = { async background() { calls++; return Buffer.from('bg'); } };
  const { db, cs } = setup(image);
  const svc = createCardService({ db, image, shooter: fakeShooter, assetsDir: os.tmpdir(), fontDir: '', profile: () => db.getProfile(), autoRetry: 1, monthlyImageLimit: 0 });
  const c = await svc.renderOne(cs.cards[0].id);
  assert.equal(c.status, 'failed');
  assert.match(c.error!, /한도/);
  assert.equal(calls, 0);
});

test('배경 그림 지시문: 글자 금지 · 띠 하나', () => {
  const p = backgroundPrompt('a child bowing', '따뜻한 일러스트', 'top-text');
  assert.match(p, /no text/i);
  assert.match(p, /exactly ONE belt/);
});

test('네이버 초안 블록: 도입 → 카드1 → 수업 → 카드2 → … 순서', () => {
  const sections = [{ id: 's1', paragraphs: ['도입'] }, { id: 's2', heading: '수업', paragraphs: ['수업 문단'] }, { id: 's3', heading: '메시지', paragraphs: ['메시지 문단'] }, { id: 's4', heading: '마무리', paragraphs: ['끝'] }];
  const b = buildBlocks(sections, [{ title: 'A', afterSectionId: 's1' }, { title: 'B', afterSectionId: 's2' }, { title: 'C', afterSectionId: 'zzz' }]);
  assert.deepEqual(b.map((x) => x.kind === 'card' ? `카드${x.cardIndex! + 1}` : x.text), ['도입', '카드1', '수업', '수업 문단', '카드2', '메시지', '메시지 문단', '카드3', '마무리', '끝']);
});

// 띠는 글 주제로 (2026-10-18 사용자: 도복은 사진과 같은 품도복, 띠만 주제에 따라)
import { beltFor, refLead } from '../../src/main/services/openai/image-prompt';
test('글 주제로 띠 고르기', () => {
  assert.equal(beltFor('국기원 승품 심사 준비'), 'poom');
  assert.equal(beltFor('시범단 공연 연습'), 'poom');
  assert.equal(beltFor('유치부 태권도 몇 살부터 시작하면 좋을까요?'), 'white');
  assert.equal(beltFor('첫 수업 낯가림 심한 아이'), 'white');
  assert.equal(beltFor('신대방동 초등학생 줄넘기반 안내'), 'mixed');
  assert.equal(beltFor('태극 1장 아래막기와 몸통지르기'), 'mixed');
  assert.equal(beltFor('10월 승급심사 안내'), 'mixed');
});
test('띠 지시문: 도복 깃은 늘 같고, 띠만 바뀜 · 참고 사진의 띠를 따르지 않게', () => {
  for (const belt of ['white', 'mixed', 'poom'] as const) {
    const p = backgroundPrompt('a child jumping rope', '따뜻한 일러스트', 'split', undefined, belt);
    assert.match(p, /red outer stripe and a black inner stripe/);
    assert.match(p, /exactly ONE/);
  }
  assert.match(backgroundPrompt('x', '따뜻한 일러스트', 'split', undefined, 'white'), /WHITE belt/);
  assert.doesNotMatch(backgroundPrompt('x', '따뜻한 일러스트', 'split', undefined, 'mixed'), /poom belt split/);
  assert.match(refLead(true, false, 'mixed'), /NOT the belt in the photo/);
  assert.match(refLead(true, false, 'poom'), /same red-and-black poom belt/);
});

// 장면 정리 (2026-10-18 실사용: "띠를 두 손에 든 아이" → 허리 띠 + 손 띠 두 개)
import { safeScene } from '../../src/main/services/openai/image-prompt';
test('장면에서 손에 든 띠 · 얼굴 없음을 뺌', () => {
  const held = safeScene('A warm faceless illustration of a child in a white taekwondo uniform looking thoughtfully at a belt held in both hands, with no text, signs, or numbers visible.');
  assert.doesNotMatch(held, /held|faceless/i);
  assert.match(held, /belt tied at the waist/);
  assert.doesNotMatch(safeScene('A gentle faceless illustration of a parent and child preparing a white taekwondo uniform and belt together'), /preparing|faceless/i);
  const ok = 'A faceless illustration of children jumping rope in a bright dojang while an instructor watches';
  assert.equal(safeScene(ok), 'An illustration of children jumping rope in a bright dojang while an instructor watches');
  assert.match(backgroundPrompt('x', '따뜻한 일러스트', 'split'), /nobody holds, folds/);
});

// 카드 한 장 문구만 다시 (2026-10-18)
import { cardOnePrompt } from '../../src/main/services/openai/prompts';
import { CardOneSchema } from '../../src/shared/schemas';
test('문구만 다시: 카드 역할 · 그림 장면 · 지금 문구 · 다른 카드 제목을 함께 보냄', () => {
  const doc = { titleCandidates: ['a', 'b', 'c'], sections: [{ id: 's1', paragraphs: ['승급심사는 10월 30일'] }], tags: [], photoSuggestions: [], reviewFlags: [] };
  const p = cardOnePrompt(doc, '제목', 2, { title: '띠 색보다 배움', sub: '설명', scene: 'children bowing' }, ['카드1 제목', '카드2 제목']);
  assert.match(p, /3번 카드\(이 글의 교육 메시지/);
  assert.match(p, /children bowing/);
  assert.match(p, /띠 색보다 배움/);
  assert.match(p, /카드1 제목 \/ 카드2 제목/);
  assert.match(p, /\(s1\) : 승급심사는/);
  assert.equal(CardOneSchema.safeParse({ title: '' , sub: 'x' }).success, false);
});

// 카드 역할은 글 종류에 맞게 (2026-10-18: 합숙 글 카드 2가 줄넘기)
import { cardCopyPrompt } from '../../src/main/services/openai/prompts';
test('행사 글 카드는 행사 소개 · 활동 · 참여 안내, 주제와 상관없는 도장 정보 금지', () => {
  const doc = { titleCandidates: ['a', 'b', 'c'], sections: [{ id: 's1', paragraphs: ['합숙'] }], tags: [], photoSuggestions: [], reviewFlags: [] };
  const p = cardCopyPrompt(doc, '1박 2일 합숙', '행사 안내');
  assert.match(p, /카드1 = 행사 소개/);
  assert.match(p, /카드2 = 행사에서 하는 활동/);
  assert.doesNotMatch(p, /실제 수업 장면/);
  assert.match(p, /상관없는 도장 정보/);
  assert.match(cardCopyPrompt(doc, 't'), /카드2 = 이 글에 적힌 실제 수업 — 무엇을 어떻게/);
});

test('카드 글은 제목에 대한 답 + 글 속 구체 내용, 글 전체를 보여 줌 (2026-10-27)', async () => {
  const { VAGUE_SUB, cardOnePrompt } = await import('../../src/main/services/openai/prompts');
  const long = '앞굽이 서기를 세 번 나눠 따라 했어요. '.repeat(20);
  const doc = { titleCandidates: ['a', 'b', 'c'], sections: [{ id: 's1', paragraphs: [long] }], tags: [], photoSuggestions: [], reviewFlags: [] };
  const p = cardCopyPrompt(doc, 't');
  assert.match(p, /첫 문장 = title 에 대한 답/);
  assert.ok(p.includes(long.trim()), '섹션을 300자로 자르지 않음');
  assert.match(cardOnePrompt(doc, 't', 1, { title: 'x', sub: 'y', scene: 'z' }, []), /이 카드는 카드2이다/);
  assert.ok(VAGUE_SUB.test('낯설어도 해보려는 마음을 살펴봐요.'));
  assert.ok(VAGUE_SUB.test('몇 개를 넘었는지 궁금하시지요.'));
  assert.ok(!VAGUE_SUB.test('아니요, 처음엔 서툰 게 당연해요. 오늘은 앞굽이를 세 번 나눠 익혔어요.'));
});
