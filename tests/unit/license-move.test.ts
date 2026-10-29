// 1.0.2: 유치원 전용 서버로 옮김 — 예전 서버(growmoment.co.kr) 이용권은 열어 주지 않고 [계정 연결]만 안내 (2026-10-29 기획안 v0.3)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLicense, SERVER } from '../../src/main/license';

const pair = () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { pub: publicKey.export({ type: 'spki', format: 'pem' }).toString(), key: privateKey };
};
const NEW = pair(), OLD = pair(), OTHER = pair();
const DEVICE = 'dev-hash-1234567890abcdef';
const token = (k: ReturnType<typeof pair>) => {
  const body = Buffer.from(JSON.stringify({
    v: 2, sub: 'u1', dojang: '햇살유치원', device: DEVICE, plan: 'trial', trialEndsAt: new Date(Date.now() + 5 * 864e5).toISOString(),
    paidUntil: null, graceDays: 3, iat: new Date().toISOString(), recheckBy: new Date(Date.now() + 14 * 864e5).toISOString(),
  }));
  return `${body.toString('base64url')}.${sign(null, body, k.key).toString('base64url')}`;
};
const plain = { available: () => true, encrypt: (s: string) => Buffer.from(s), decrypt: (b: Buffer) => b.toString() };

function make(tok: string) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kinder-lic-')), 'license.bin');
  fs.writeFileSync(file, JSON.stringify({ token: tok, refresh: 'old-refresh-secret', activationId: 'a1' }));
  const calls: string[] = [];
  const lic = createLicense({
    file, cipher: plain, device: DEVICE, openExternal: () => {}, keys: { current: NEW.pub, old: OLD.pub },
    fetch: (async (url: string) => { calls.push(String(url)); return new Response('{}', { status: 500 }); }) as unknown as typeof fetch,
  });
  return { lic, calls };
}

test('기본 서버 주소는 유치원 전용 서버', () => {
  if (!process.env.GTD_SERVER) assert.equal(SERVER, 'https://kinder.growmoment.co.kr');
});

test('새 서버 이용권은 그대로 열림', () => {
  assert.equal(make(token(NEW)).lic.status().state, 'ok');
});

test('예전 서버 이용권은 잠그고 "옮겨졌어요 · 다시 연결" 안내', () => {
  const st = make(token(OLD)).lic.status();
  assert.equal(st.state, 'locked');
  assert.equal(st.state === 'locked' && st.why, 'moved');
  assert.match(st.state === 'locked' ? st.message : '', /새 주소로 옮겨졌어요.*\[계정 연결\]/);
});

test('예전 서버 이용권의 갱신 비밀값을 새 서버로 보내지 않음', async () => {
  const { lic, calls } = make(token(OLD));
  const st = await lic.refresh();
  assert.equal(calls.length, 0);
  assert.equal(st.state === 'locked' && st.why, 'moved');
});

test('어느 키로도 안 풀리는 이용권은 예전처럼 broken', () => {
  const st = make(token(OTHER)).lic.status();
  assert.equal(st.state === 'locked' && st.why, 'broken');
});
