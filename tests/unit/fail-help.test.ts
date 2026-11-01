// 실패 안내: OpenAI 문구는 할 일까지 알려 주고, 네이버 · 카카오 문구는 그대로, 버튼은 AI 작업에만
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromHttp, messageFor } from '../../src/main/services/errors';
import { failActions } from '../../src/shared/failHelp';

test('OpenAI 실패 문구는 다음에 할 일을 말해 줌', () => {
  assert.match(fromHttp('OpenAI', 429, 'insufficient_quota').message, /크레딧이나 사용 한도가 부족해요.*다시 만들어 주세요.*그대로/);
  assert.match(fromHttp('OpenAI', 401).message, /키를 새로 만들어/);
  assert.match(fromHttp('OpenAI', 503).message, /내 PC 문제가 아니에요/);
  assert.match(fromHttp('OpenAI', 403).message, /카톡으로 보내 주세요/);
  assert.match(fromHttp('OpenAI 이미지', 429, 'insufficient_quota').message, /크레딧이나 사용 한도/);
  assert.match(messageFor('network', 'OpenAI'), /인터넷이 끊긴 것 같아요/);
});

test('OpenAI 가 아닌 곳의 문구는 그대로', () => {
  assert.equal(fromHttp('카카오', 503).message, '카카오 서버가 잠시 응답하지 않아요. 잠시 뒤 다시 시도해 주세요.');
  assert.doesNotMatch(fromHttp('네이버 검색광고', 429, 'quota').message, /쓰던 글/);
});

test('이유별 버튼', () => {
  assert.deepEqual(failActions('article', 'quota'), ['billing', 'retry']);
  assert.deepEqual(failActions('article', 'auth'), ['keys', 'settings']);
  assert.deepEqual(failActions('revise', 'server'), ['retry']);
  assert.deepEqual(failActions('card', 'permission'), ['kakao']);
  assert.deepEqual(failActions('article', 'unknown'), []);
  assert.deepEqual(failActions('naver', 'quota'), []);
});
