// 기기 번호가 태권 글뚝딱과 부딪히지 않는지 (2026-10-28 사용자: 태권도판과 부딪히면 안 됨)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEVICE_PREFIX, LEGACY_DEVICE_PREFIX, pickDeviceHash, readDeviceHash } from '../../src/main/license';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kinder-device-'));
const fake = (_f: string, prefix?: string) => `hash:${prefix}`;

test('같은 PC라도 태권 글뚝딱(geulttukttak2-device)과 다른 기기 번호', () => {
  const f = path.join(tmp(), 'device-id.txt');
  assert.notEqual(readDeviceHash(f), readDeviceHash(f, LEGACY_DEVICE_PREFIX));
  assert.equal(readDeviceHash(f), readDeviceHash(f, DEVICE_PREFIX));
});

test('처음 쓰는 PC는 유치원 번호, 한 번 정하면 연결한 뒤에도 그대로', () => {
  const dir = tmp();
  assert.equal(pickDeviceHash(dir, fake), `hash:${DEVICE_PREFIX}`);
  fs.writeFileSync(path.join(dir, 'license.bin'), 'x');
  assert.equal(pickDeviceHash(dir, fake), `hash:${DEVICE_PREFIX}`);
});

test('1.0.0 때 이미 연결한 PC는 예전 번호 그대로 (잠기지 않게), 연결을 풀어도 그대로', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'license.bin'), 'x');
  assert.equal(pickDeviceHash(dir, fake), `hash:${LEGACY_DEVICE_PREFIX}`);
  fs.rmSync(path.join(dir, 'license.bin'));
  assert.equal(pickDeviceHash(dir, fake), `hash:${LEGACY_DEVICE_PREFIX}`);
});
