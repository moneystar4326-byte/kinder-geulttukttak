// 태권 글뚝딱 2.2.11에서 옮김: 유치원 정보의 첫인사 · 끝인사를 글 맨 앞 · 맨 끝에 그대로 (+ 유치원 글쓴이 줄과의 순서)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripGreetings, stripWriterSign, withContact, withDojoName, withGreetings, withWriterSign, writerSignLine } from '../../src/main/article';
import { articlePrompt } from '../../src/main/services/openai/prompts';
import { DEMO_INPUT, DEMO_PROFILE } from '../../src/main/services/openai/demo';
import type { ArticleDoc, ArticleInput, DojoProfile } from '../../src/shared/types';

const doc = (): ArticleDoc => ({
  titleCandidates: ['제목'], tags: [], photoSuggestions: [], reviewFlags: [],
  sections: [{ id: 's1', heading: '', paragraphs: ['첫 문단이에요.'] }, { id: 's2', heading: '마무리', paragraphs: ['끝 문단이에요.'] }],
} as ArticleDoc);
const G = '안녕하세요, 햇살유치원입니다 😊';
const C = '오늘도 햇살유치원을 아껴 주셔서 감사합니다.';
const prof = (p: Partial<DojoProfile> = {}): DojoProfile => ({ ...DEMO_PROFILE, name: '햇살유치원', region: '서울 노원구 상계동', nearbyAreas: [], greeting: G, closing: C, ...p });

test('첫인사는 첫 문단 앞, 끝인사는 마지막 문단 뒤에 적은 그대로', () => {
  const out = withGreetings(doc(), prof(), {});
  assert.deepEqual(out.sections[0].paragraphs, [G, '첫 문단이에요.']);
  assert.deepEqual(out.sections[1].paragraphs, ['끝 문단이에요.', C]);
});

test('두 번 붙여도 한 번만 들어감 · 떼면 원래 글', () => {
  const once = withGreetings(doc(), prof(), {});
  assert.deepEqual(withGreetings(once, prof(), {}), once);
  assert.deepEqual(stripGreetings(once, prof()).sections, doc().sections);
});

test('글마다 끄면 붙이지 않음 · 비어 있으면 그대로', () => {
  assert.deepEqual(withGreetings(doc(), prof(), { greetings: false }).sections, doc().sections);
  assert.deepEqual(withGreetings(doc(), prof({ greeting: ' ', closing: '' }), {}).sections, doc().sections);
  const onlyEnd = withGreetings(doc(), prof({ greeting: '' }), {});
  assert.deepEqual(onlyEnd.sections[0].paragraphs, ['첫 문단이에요.']);
  assert.equal(onlyEnd.sections[1].paragraphs.at(-1), C);
});

test('인사에 유치원 이름이 있으면 유치원 이름 줄을 따로 붙이지 않음', () => {
  assert.deepEqual(withDojoName(doc(), prof(), G + C), doc());
});

test('지시문: 인사가 있으면 AI는 인사를 쓰지 않게, 끄면 그 줄 없음', () => {
  const p = articlePrompt(prof(), DEMO_INPUT, null);
  assert.match(p, /\[첫인사\] 프로그램이 글 맨 앞에 "안녕하세요, 햇살유치원입니다 😊"를 붙인다/);
  assert.match(p, /\[끝인사\]/);
  assert.doesNotMatch(articlePrompt(prof(), { ...DEMO_INPUT, greetings: false }, null), /\[첫인사\]|\[끝인사\]/);
  assert.doesNotMatch(articlePrompt(prof({ greeting: '', closing: '' }), DEMO_INPUT, null), /\[첫인사\]|\[끝인사\]/);
});

// 유치원만: 글 끝 글쓴이 줄 ("○○ 드림")
const signed = { ...DEMO_INPUT, writer: { id: 'w1', role: '교사', name: '김하늘', className: '햇님반' }, writerSign: true } as ArticleInput;

test('유치원: 끝인사 다음에 글쓴이 줄', () => {
  const line = writerSignLine(signed, prof());
  assert.ok(line);
  const out = withWriterSign(withGreetings(doc(), prof(), signed), signed, prof());
  assert.deepEqual(out.sections[1].paragraphs.slice(-2), [C, line]);
});

test('유치원: 다시 다듬을 때 글쓴이 줄을 떼면 끝인사가 보여 두 번 들어가지 않음', () => {
  const full = withWriterSign(withGreetings(doc(), prof(), signed), signed, prof());
  const noSign = stripWriterSign(full, signed, prof());
  assert.equal(noSign.sections[1].paragraphs.at(-1), C);
  assert.deepEqual(stripGreetings(noSign, prof()).sections, doc().sections);
  const again = withWriterSign(withGreetings(stripGreetings(noSign, prof()), prof(), signed), signed, prof());
  assert.deepEqual(again, full);
  assert.deepEqual(stripWriterSign(doc(), signed, prof()), doc());
});

// 2026-10-29 유치원 정보 점검: 연락처를 넣기로 한 글인데 AI가 번호를 빼먹으면 프로그램이 한 줄 붙임
test('연락처: 본문에 없으면 끝인사 · 글쓴이 줄보다 앞에 한 줄, 있으면 그대로, 끄면 안 붙임', () => {
  const p = prof({ contact: '02-000-0000', consultLink: 'https://pf.kakao.com/_x' });
  const on = { ...signed, includeProfile: { ...signed.includeProfile, contact: true } } as ArticleInput;
  const full = withWriterSign(withGreetings(withContact(doc(), on, p), p, on), on, p);
  assert.deepEqual(full.sections[1].paragraphs.slice(-3), ['상담 문의: 02-000-0000 · https://pf.kakao.com/_x', C, writerSignLine(on, p)]);
  const has = { ...doc(), sections: [doc().sections[0], { id: 's2', heading: '마무리', paragraphs: ['상담은 02 000 0000, https://pf.kakao.com/_x 로 주세요.'] }] } as ArticleDoc;
  assert.deepEqual(withContact(has, on, p), has);
  assert.deepEqual(withContact(doc(), { ...on, includeProfile: { ...on.includeProfile, contact: false } } as ArticleInput, p), doc());
  assert.deepEqual(withContact(doc(), on, prof({ contact: '', consultLink: '' })), doc());
});
