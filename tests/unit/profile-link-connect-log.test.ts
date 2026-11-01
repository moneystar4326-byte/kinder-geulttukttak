// 2026-11-02 점검에서 나온 것: 잘못된 상담 링크 저장 막기 · 계정 연결 실패도 기록에 남기기
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProfileInput } from '../../src/shared/schemas';
import { createLicense } from '../../src/main/license';

const profile = (consultLink?: string) => ({
  id: 'default', name: '요요유치원', region: '서울 동작구 신대방동', philosophy: '놀이', classFeatures: '', brand: { main: '#000000', accent: '#111111' }, tone: '따뜻한 설명형', avoidWords: '', consultLink,
});
const check = (v?: string) => ProfileInput.safeParse(profile(v));

test('상담 링크: 비우거나 http(s) 주소면 저장, 그 밖에는 한국어로 안내', () => {
  for (const ok of [undefined, '', '  ', 'https://pf.kakao.com/_abc', 'http://yoyo.kr/상담', ' https://yoyo.kr ']) assert.equal(check(ok).success, true, String(ok));
  for (const bad of ['상담링크아님', 'pf.kakao.com/_abc', 'https://', 'https://주소 띄어쓰기.kr', 'javascript:alert(1)']) {
    const r = check(bad);
    assert.equal(r.success, false, bad);
    assert.match(r.error!.issues[0].message, /상담 링크는 https/);
  }
});

test('계정 연결: 서버가 거절하면 그 이유를 화면에도 기록에도 남김 (코드 · 비밀값은 안 남김)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kinder-connect-'));
  const logs: [string, string | undefined][] = [];
  const code = 'one-time-code-1234567890';
  const lic = createLicense({
    file: path.join(dir, 'license.bin'),
    cipher: { available: () => true, encrypt: (s: string) => Buffer.from(s), decrypt: (b: Buffer) => b.toString() },
    device: 'dev-hash-1234567890abcdef',
    log: (ev, msg) => logs.push([ev, msg]),
    fetch: (async () => new Response(JSON.stringify({ error: '이 PC는 이미 체험을 썼어요' }), { status: 409 })) as typeof fetch,
    // 브라우저 대신: 앱이 연 주소에서 포트 · state 를 읽어 콜백을 부름
    openExternal: (url) => {
      const q = new URL(url).searchParams;
      void fetch(`http://127.0.0.1:${q.get('port')}/callback?code=${code}&state=${q.get('state')}`).then((r) => r.text());
    },
  });
  await assert.rejects(lic.connect(), /이미 체험을 썼어요/);
  assert.deepEqual(logs, [['license-connect', '이 PC는 이미 체험을 썼어요']]);
  assert.ok(!JSON.stringify(logs).includes(code));
  lic.stop();
});
