// 입력 검사 오류가 영어 그대로 보이지 않게 (2026-10-29 유치원 정보 점검)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { issueMessage } from '../../src/main/ipc/messages';

const first = (schema: z.ZodTypeAny, v: unknown) => issueMessage(schema.safeParse(v).error?.issues[0]);

test('글자 수 넘으면 어느 칸인지 · 몇 자까지인지 한국어로', () => {
  assert.equal(first(z.object({ greeting: z.string().max(300) }), { greeting: '가'.repeat(301) }), '"첫인사" 칸은 300자까지 적을 수 있어요. 조금 줄여 주세요.');
  assert.equal(first(z.object({ contact: z.string().max(200) }), { contact: '1'.repeat(201) }), '"연락처" 칸은 200자까지 적을 수 있어요. 조금 줄여 주세요.');
});

test('한국어 안내가 이미 있으면 그대로', () => {
  assert.equal(first(z.object({ name: z.string().min(1, '유치원 이름을 적어 주세요') }), { name: '' }), '유치원 이름을 적어 주세요');
});

test('모르는 칸 · 다른 오류도 영어 없이', () => {
  const m = first(z.object({ zzz: z.number() }), { zzz: 'x' });
  assert.doesNotMatch(m, /[A-Za-z]{4,}/);
});
