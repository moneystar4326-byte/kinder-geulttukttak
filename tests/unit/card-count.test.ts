// 카드뉴스 장수 고르기 (태권 글뚝딱 2.4.0에서 옮김: 설정에서 1 · 2 · 3장, 그림 비용 아끼기)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cardCountOf, cardNo, cardSlots, defaultCardCount, resolveCardCount, roleAt } from '../../src/shared/cardRoles';
import { cardCopySchema } from '../../src/shared/schemas';
import { cardCheckPrompt, cardCopyPrompt, cardOnePrompt } from '../../src/main/services/openai/prompts';
import { buildQuickInput } from '../../src/shared/quickInput';
import { demoText } from '../../src/main/services/openai/demo';
import { openDb } from '../../src/main/db';
import { loadSettings, saveSettings } from '../../src/main/settings';
import type { ArticleDoc } from '../../src/shared/types';

const doc: ArticleDoc = { titleCandidates: ['a', 'b', 'c'], sections: [{ id: 's1', paragraphs: ['도입'] }, { id: 's2', heading: '놀이', paragraphs: ['본문'] }], tags: [], photoSuggestions: [], reviewFlags: [] };

test('기본 장수: 글 종류에 맞게면 행사 · 모집 1장, 나머지 3장 · 설정에서 고르면 그대로', () => {
  assert.equal(defaultCardCount('행사 안내'), 1);
  assert.equal(defaultCardCount('모집 안내'), 1);
  assert.equal(defaultCardCount('수업 후기'), 3);
  assert.equal(resolveCardCount('auto', '모집 안내'), 1);
  assert.equal(resolveCardCount(2, '모집 안내'), 2);
  assert.equal(resolveCardCount(undefined, '교육 정보'), 3);
});

test('예전 글은 장수가 없어도 카드를 골랐으면 3장, 안 골랐으면 0장', () => {
  assert.equal(cardCountOf({ withCards: true }), 3);
  assert.equal(cardCountOf({ withCards: false }), 0);
  assert.equal(cardCountOf({ withCards: true, cardCount: 1 }), 1);
});

test('자리: 1장 [0] · 2장 [첫, 끝] · 3장 [셋] — 보여 주는 번호는 묶음 안 순서', () => {
  assert.deepEqual(cardSlots(1), [0]);
  assert.deepEqual(cardSlots(2), [0, 2]);
  assert.deepEqual(cardSlots(3), [0, 1, 2]);
  assert.equal(cardNo([0, 2], 2), 2, '2장 묶음의 마지막 카드는 "카드 2"');
});

test('1장이면 요약 카드 역할, 2장이면 첫 · 마지막 역할 (유치원 말)', () => {
  assert.equal(roleAt('수업 후기', undefined, 1, 0).label, '오늘 놀이 한 장');
  assert.equal(roleAt('행사 안내', undefined, 1, 0).label, '행사 한 장');
  assert.equal(roleAt(undefined, '소식', 1, 0).label, '소식 한 장');
  assert.equal(roleAt('수업 후기', undefined, 2, 2).label, '놀이로 자라는 것');
  assert.equal(roleAt('수업 후기', undefined, 3, 1).label, '오늘 한 놀이 장면');
  assert.ok(!/도장|태권|관장|사범/.test(JSON.stringify([1, 2, 3].map((n) => cardSlots(n).map((s) => roleAt('모집 안내', undefined, n, s))))));
});

test('AI 지시문 · 응답 검사가 장수를 따름', () => {
  const head = (s: string) => s.split('\n').slice(0, 3).join('\n'); // 앞 줄 = 장수 · 카드 역할 (뒤 공통 규칙은 그대로)
  const one = head(cardCopyPrompt(doc, '제목', { kind: '모집 안내' }, undefined, false, 1));
  assert.ok(one.includes('카드뉴스 1장') && one.includes('정확히 1개') && one.includes('입학설명회') && !one.includes('카드2'), one);
  const two = head(cardCopyPrompt(doc, '제목', { kind: '수업 후기' }, undefined, false, 2));
  assert.ok(two.includes('카드1 = 학부모가 궁금해할') && two.includes('카드2 = 이 놀이로 아이들이 자라는 점') && !two.includes('오늘 한 놀이 · 활동'), two);
  assert.ok(cardCopyPrompt(doc, '제목', { kind: '수업 후기' }).includes('카드뉴스 3장'), '기본은 3장 그대로');
  const c = { title: 't', sub: 's', scene: 'x', afterSectionId: 's1' };
  assert.equal(cardCopySchema(1).safeParse({ cards: [c] }).success, true);
  assert.equal(cardCopySchema(1).safeParse({ cards: [c, c] }).success, false);
  // 카드 점검도 장수만큼
  const chk = cardCheckPrompt(doc, '제목', [c, c], { kind: '수업 후기' });
  assert.ok(chk.includes('[카드] 2장') && chk.includes('정확히 2개') && !chk.includes('카드3 ='), chk.slice(0, 300));
  // 한 장만 다시 쓰기: 1장 묶음이면 요약 역할, 2장 묶음 끝 카드는 "카드 2"
  assert.ok(cardOnePrompt(doc, '제목', 0, { title: 'a', sub: 'b', scene: 'c' }, [], { kind: '수업 후기' }, undefined, false, 1).includes('어떤 놀이 · 활동을 했고'));
  assert.ok(cardOnePrompt(doc, '제목', 2, { title: 'a', sub: 'b', scene: 'c' }, [], { kind: '수업 후기' }, undefined, false, 2, 2).includes('카드뉴스 2번 카드'));
});

test('카드 문구는 장수만큼, 자리 번호가 붙음 (데모)', async () => {
  assert.deepEqual((await demoText.cardCopies(doc, 't', {}, {}, undefined, false, 2)).map((c) => c.index), [0, 2]);
  assert.deepEqual((await demoText.cardCopies(doc, 't', {}, {}, undefined, false, 1)).map((c) => c.index), [0]);
  assert.equal((await demoText.cardCopies(doc, 't', {})).length, 3);
});

test('카드 묶음은 자리 번호대로 저장 (2장 = 0 · 2) — 글 속 위치 규칙 그대로', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtd-cc-'));
  const db = openDb(path.join(dir, 'app.db'));
  const cs = db.createCardSet('v1', { style: '교육 잡지형', size: '1080x1350', mode: 'template' }, [{ title: 'a', sub: 'b', scene: 'c', index: 0 }, { title: 'd', sub: 'e', scene: 'f', index: 2 }]);
  assert.deepEqual(cs.cards.map((c) => c.index), [0, 2]);
  // 설정: 기본 'auto', 이상한 값은 'auto'
  assert.equal(loadSettings(db).cardCount, 'auto');
  assert.equal(saveSettings(db, { cardCount: 2 }).cardCount, 2);
  assert.equal(saveSettings(db, { cardCount: 7 as any }).cardCount, 'auto');
});

test('한 줄로 바로 쓰기: 설정 장수 · 글 종류에 맞게 · 만들지 않기', () => {
  const base = { profile: null, titlePrefix: '' };
  assert.equal(buildQuickInput({ ...base, memo: '2027학년도 신입 원아 모집 입학설명회 안내', withCards: true, cardSetting: 'auto' }).cardCount, 1);
  assert.equal(buildQuickInput({ ...base, memo: '오늘 햇님반 촉감 놀이', withCards: true, cardSetting: 'auto' }).cardCount, 3);
  assert.equal(buildQuickInput({ ...base, memo: '오늘 햇님반 촉감 놀이', withCards: true, cardSetting: 2 }).cardCount, 2);
  const none = buildQuickInput({ ...base, memo: '오늘 햇님반 촉감 놀이', withCards: false });
  assert.equal(none.cardCount, 0);
  assert.equal(none.withCards, false);
});

test('카드 그림에 찍는 번호: 2장 묶음이면 "1 / 2 · 2 / 2", 예전 3장은 그대로', async () => {
  const { cardHtml } = await import('../../src/main/services/card-renderer/template');
  const base = { copy: { title: 't', sub: 's', scene: 'x' }, style: '깔끔한 정보형' as const, size: '1080x1350' as const, brand: { main: '#000', accent: '#f00' }, dojoName: 'd' };
  assert.ok(cardHtml({ ...base, index: 2, no: 2, total: 2 } as any).includes('2 / 2'));
  assert.ok(cardHtml({ ...base, index: 1 } as any).includes('2 / 3'));
});
