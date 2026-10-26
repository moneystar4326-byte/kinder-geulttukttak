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
import { daycareBackgroundPrompt } from '../../src/main/services/openai/image-prompt';

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

test('배경 그림 지시문: 글자 금지 · 안전한 장면', () => {
  const p = daycareBackgroundPrompt('toddlers stacking blocks', '따뜻한 일러스트', 'top-text');
  assert.match(p, /no text/i);
  assert.match(p, /Everything looks safe/);
});

test('네이버 초안 블록: 도입 → 카드1 → 수업 → 카드2 → … 순서', () => {
  const sections = [{ id: 's1', paragraphs: ['도입'] }, { id: 's2', heading: '수업', paragraphs: ['수업 문단'] }, { id: 's3', heading: '메시지', paragraphs: ['메시지 문단'] }, { id: 's4', heading: '마무리', paragraphs: ['끝'] }];
  const b = buildBlocks(sections, [{ title: 'A', afterSectionId: 's1' }, { title: 'B', afterSectionId: 's2' }, { title: 'C', afterSectionId: 'zzz' }]);
  assert.deepEqual(b.map((x) => x.kind === 'card' ? `카드${x.cardIndex! + 1}` : x.text), ['도입', '카드1', '수업', '수업 문단', '카드2', '메시지', '메시지 문단', '카드3', '마무리', '끝']);
});

// 카드 한 장 문구만 다시 (2026-10-18)
import { cardOnePrompt } from '../../src/main/services/openai/prompts';
import { CardOneSchema } from '../../src/shared/schemas';
test('문구만 다시: 카드 역할 · 그림 장면 · 지금 문구 · 다른 카드 제목을 함께 보냄', () => {
  const doc = { titleCandidates: ['a', 'b', 'c'], sections: [{ id: 's1', paragraphs: ['생일잔치는 10월 30일'] }], tags: [], photoSuggestions: [], reviewFlags: [] };
  const p = cardOnePrompt(doc, '제목', 2, { title: '놀이로 자라는 마음', sub: '설명', scene: 'children clapping' }, ['카드1 제목', '카드2 제목']);
  assert.match(p, /3번 카드\(이 놀이로 아이들이 자라는 점/);
  assert.match(p, /children clapping/);
  assert.match(p, /놀이로 자라는 마음/);
  assert.match(p, /카드1 제목 \/ 카드2 제목/);
  assert.match(p, /\(s1\) : 생일잔치는/);
  assert.equal(CardOneSchema.safeParse({ title: '' , sub: 'x' }).success, false);
});

// 카드 역할은 글 종류에 맞게 (태권 글뚝딱 2026-10-18: 행사 글 카드에 다른 수업 이야기가 끼던 문제)
import { cardCopyPrompt } from '../../src/main/services/openai/prompts';
test('행사 글 카드는 행사 소개 · 활동 · 참여 안내, 주제와 상관없는 어린이집 정보 금지', () => {
  const doc = { titleCandidates: ['a', 'b', 'c'], sections: [{ id: 's1', paragraphs: ['생일잔치'] }], tags: [], photoSuggestions: [], reviewFlags: [] };
  const p = cardCopyPrompt(doc, '10월 생일잔치', '행사 안내');
  assert.match(p, /카드1 = 행사 소개/);
  assert.match(p, /카드2 = 행사에서 하는 활동/);
  assert.doesNotMatch(p, /오늘 한 놀이/);
  assert.match(p, /상관없는 어린이집 정보/);
  assert.match(cardCopyPrompt(doc, 't'), /카드2 = 이 글에 적힌 오늘 한 놀이 · 활동 — 무엇을 어떻게/);
});

test('카드 글은 제목에 대한 답 + 글 속 구체 내용, 글 전체를 보여 줌 (2026-10-27)', async () => {
  const { VAGUE_SUB, cardOnePrompt } = await import('../../src/main/services/openai/prompts');
  const long = '밀가루 반죽을 세 번 나눠 조물조물 만졌어요. '.repeat(20);
  const doc = { titleCandidates: ['a', 'b', 'c'], sections: [{ id: 's1', paragraphs: [long] }], tags: [], photoSuggestions: [], reviewFlags: [] };
  const p = cardCopyPrompt(doc, 't');
  assert.match(p, /첫 문장 = title 에 대한 답/);
  assert.ok(p.includes(long.trim()), '섹션을 300자로 자르지 않음');
  assert.match(cardOnePrompt(doc, 't', 1, { title: 'x', sub: 'y', scene: 'z' }, []), /이 카드는 카드2이다/);
  assert.ok(VAGUE_SUB.test('낯설어도 해보려는 마음을 살펴봐요.'));
  assert.ok(VAGUE_SUB.test('몇 개를 넘었는지 궁금하시지요.'));
  assert.ok(!VAGUE_SUB.test('아니요, 처음엔 낯설어하는 게 당연해요. 오늘은 반죽을 손끝으로 먼저 만졌어요.'));
});
