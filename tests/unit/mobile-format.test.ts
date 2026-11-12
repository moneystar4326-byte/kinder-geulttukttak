// 휴대폰에서 읽기 좋은 글: 줄 길이 · 문단 나누기 · 소제목 · 입력 블록 (태권 글뚝딱 2.7.1에서 옮김, 예문은 유치원 이야기로)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headingLines, mobileParagraphs, shortLines } from '../../src/shared/format';
import { buildBlocks } from '../../src/main/services/browser-draft';

const px = (s: string) => [...s].reduce((w, c) => w + (c === ' ' ? 5 : /[\x21-\x7e]/.test(c) ? 9 : 15), 0);
const SAMPLE = [
  '이번 체육 놀이에서는 공 던지기를 배우기 전에 한 발로 균형을 잡는 연습부터 시작했어요. 처음에는 몸이 흔들려서 금방 발을 내리는 친구들이 많았어요.',
  '그래도 옆 친구와 서로 숫자를 세어 주면서 조금씩 오래 버티게 되었어요. 열까지 세고 나서 환하게 웃는 모습이 참 보기 좋았습니다.',
  '공 던지기는 팔 힘만으로 되는 놀이가 아니에요. 중심이 먼저 잡혀야 팔을 들어 올리고 정확하게 던질 수 있어서, 저희 유치원은 기본 자세를 충분히 연습한 뒤에 다음 놀이로 넘어가요.',
  '집에서도 양치할 때 한 발로 서 보는 놀이를 해 보세요. 하루 일 분이면 충분하고, 아이가 스스로 몇 초를 버텼는지 말해 보면 더 즐겁게 이어 갈 수 있어요. 😊',
  '다음 주에는 오늘 익힌 균형을 바탕으로 공 굴리기와 공 던지기를 이어서 해 볼 예정이에요. 아이들이 어떻게 달라질지 저희도 기대가 됩니다.',
];

test('모든 줄이 작은 폰 폭 안에 들어감', () => {
  for (const t of SAMPLE) for (const l of shortLines(t).split('\n')) assert.ok(px(l.replace(/\s*😊/, '')) <= 280, l);
});

test('어색한 자리에서 끊지 않음', () => {
  const all = SAMPLE.map(shortLines).join('\n');
  for (const bad of ['서\n보는', '세어\n주면서', '연습한\n뒤에', '배우기\n전에']) assert.ok(!all.includes(bad), `${bad} / ${all}`);
});

test('글자는 하나도 바뀌지 않음 (줄만 나눔)', () => {
  const flat = (s: string) => s.replace(/\s/g, '');
  for (const t of SAMPLE) assert.equal(flat(mobileParagraphs(t).join('')), flat(t));
});

test('문단은 4줄을 넘지 않고, 문장 끝에서 나눔 · 한 줄만 혼자 남지 않음', () => {
  for (const t of SAMPLE) {
    const chunks = mobileParagraphs(t).map((c) => c.split('\n'));
    assert.ok(chunks.length >= 2, t);
    assert.ok(chunks.every((c) => c.length <= 4 + 1), JSON.stringify(chunks));
    assert.ok(chunks.every((c) => c.length >= 2), JSON.stringify(chunks));
  }
  const first = mobileParagraphs(SAMPLE[0]);
  assert.ok(first[0].endsWith('시작했어요.'), first[0]);
  assert.deepEqual(mobileParagraphs('짧은 문단이에요.'), ['짧은 문단이에요.']);
});

test('소제목: 짧으면 한 줄, 길면 나눔 · 이모지는 첫 줄 · 글자 크기 24에서도 폭 안', () => {
  assert.deepEqual(headingLines('🌱 균형부터 잡아요'), ['🌱 균형부터 잡아요']);
  for (const h of ['🌱 공 던지기 전에 균형부터 잡아요', '💡 중심이 잡혀야 공이 멀리 날아가요', '📌 집에서도 쉽게 따라 해 보세요', '우리 아이도 동요를 끝까지 외울 수 있을까요 걱정이에요']) {
    const lines = headingLines(h);
    assert.ok(lines.length >= 2, h);
    assert.equal(lines.join(' '), h);
    assert.ok(lines.every((l) => px(l.replace(/^\S+ (?=[가-힣])/, (m) => (/^[가-힣]/.test(m) ? m : ''))) * 1.5 <= 320), lines.join(' / '));
  }
  assert.ok(headingLines('🌱 공 던지기 전에 균형부터 잡아요')[0].startsWith('🌱'));
});

test('입력 블록: 소제목은 나뉜 채 한 덩어리, 문단은 나뉘어 들어감 · 자리 글자와 태그는 그대로', () => {
  const blocks = buildBlocks([{ id: 's', heading: '💡 중심이 잡혀야 공이 멀리 날아가요', paragraphs: [SAMPLE[2]] }], [{ title: '카드', afterSectionId: 's', index: 0 }], ['유치원']);
  assert.equal(blocks[0].kind, 'heading');
  assert.ok(blocks[0].text.includes('\n'));
  const paras = blocks.filter((b) => b.kind === 'paragraph' && !b.text.startsWith('#'));
  assert.ok(paras.length >= 2);
  assert.ok(blocks.some((b) => b.kind === 'card' && b.text.startsWith('[카드 1')));
  assert.equal(blocks[blocks.length - 1].text, '#유치원');
});

test('마지막 줄은 문단을 나눠도 같음', () => {
  for (const t of SAMPLE) assert.equal(mobileParagraphs(t).join('\n').split('\n').pop(), shortLines(t).split('\n').pop());
});
