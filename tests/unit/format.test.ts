import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decorateHeadings, shortLines, stripLeadEmoji, tagLine } from '../../src/shared/format';
import { buildBlocks } from '../../src/main/services/browser-draft';

const doc = (headings: (string | undefined)[]) => ({ titleCandidates: [], tags: [], photoSuggestions: [], reviewFlags: [], sections: headings.map((h, i) => ({ id: `s${i + 1}`, heading: h, paragraphs: ['p'] })) });

test('소제목마다 이모지 하나 (AI가 붙인 것은 떼고 같은 모양으로), 도입 · 마무리는 그대로', () => {
  const d = decorateHeadings(doc([undefined, '낮잠은 언제?', '👀 수업은 이렇게', '■ 가정에서', '마무리하며']) as any);
  assert.deepEqual(d.sections.map((s: any) => s.heading), [undefined, '🌱 낮잠은 언제?', '💡 수업은 이렇게', '📌 가정에서', '마무리하며']);
  assert.deepEqual(decorateHeadings(d).sections.map((s: any) => s.heading), d.sections.map((s: any) => s.heading)); // 두 번 해도 같음
  assert.equal(stripLeadEmoji('🗓️ 일정'), '일정');
});

test('긴 줄은 28자 안팎으로 고르게 끊고, 소제목 · 태그 · 카드 자리는 그대로', () => {
  const long = '정규 수업 안에서는 매일 줄넘기를 하고, 따로 신청하거나 준비할 것은 없어요. 화요일과 목요일에는 전문 줄넘기반도 있어요.';
  const lines = shortLines(long).split('\n');
  assert.ok(lines.length >= 3 && lines.every((l) => [...l].length <= 34), lines.join(' | '));
  assert.equal(shortLines('#태권도 #줄넘기 #신대방동태권도 #대길초태권도 #보라매초태권도'), '#태권도 #줄넘기 #신대방동태권도 #대길초태권도 #보라매초태권도');
});

test('네이버 초안 맨 끝에 #태그 한 줄', () => {
  const b = buildBlocks([{ id: 's1', paragraphs: ['도입'] }], [], ['신대방동태권도', '#줄넘기', '초등 태권도']);
  assert.equal(b[b.length - 1].text, '#신대방동태권도 #줄넘기 #초등태권도');
  assert.equal(tagLine([]), '');
});

test('문장 끝 이모지는 혼자 한 줄이 되지 않음', () => {
  const out = shortLines('지금은 품새 연습에 열심히 힘을 쏟고 있어요. 차근차근 준비하는 과정에 마음을 보태 주세요. 😊');
  assert.ok(!out.split('\n').some((l) => l.trim() === '😊'), out);
  assert.ok(out.includes('😊'));
});
