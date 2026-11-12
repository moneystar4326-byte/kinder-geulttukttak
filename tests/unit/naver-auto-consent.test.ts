// 네이버 자동 입력(예전 방식) 켜기 동의 (태권 글뚝딱 2.8.0에서 옮김)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NAVER_AUTO_TERMS, NAVER_AUTO_TERMS_VERSION, naverAutoOn } from '../../src/shared/naverAuto';
import { openDb } from '../../src/main/db';
import { loadSettings, saveSettings } from '../../src/main/settings';

test('자동 입력은 지금 문구에 동의한 기록이 있을 때만 켜짐 (기본 꺼짐, 문구가 바뀌면 다시 꺼짐)', () => {
  assert.equal(naverAutoOn(undefined), false);
  assert.equal(naverAutoOn(null), false);
  assert.equal(naverAutoOn({ version: NAVER_AUTO_TERMS_VERSION, at: '2026-11-10T00:00:00Z', appVersion: '1.0.9' }), true);
  assert.equal(naverAutoOn({ version: '옛 문구', at: '2026-11-10T00:00:00Z', appVersion: '1.0.9' }), false);
});

test('동의 문구: 체크 3개 · 본인의 선택 · 계정 제한 위험 · 끌 수 있음 · 유치원판에 없는 사진 · 영상 말 없음', () => {
  assert.equal(NAVER_AUTO_TERMS.checks.length, 3);
  assert.ok(NAVER_AUTO_TERMS.checks.some((c) => c.includes('본인의 선택')));
  assert.ok(NAVER_AUTO_TERMS.checks.some((c) => c.includes('제한하거나 정지')));
  assert.ok(NAVER_AUTO_TERMS.checks.some((c) => c.includes('붙여넣기 도우미')));
  assert.ok(!/영상|도장|관장/.test(JSON.stringify(NAVER_AUTO_TERMS)));
});

test('예전 사용자도 업데이트하면 꺼진 채 시작', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtd-na-'));
  const db = openDb(path.join(dir, 'app.db'));
  db.setSetting('app', { setupDone: true, typingSpeed: 20 }); // 1.0.9 때 저장된 설정 (naverAuto 없음)
  assert.equal(naverAutoOn(loadSettings(db).naverAuto), false);
  assert.equal(naverAutoOn(saveSettings(db, { naverAuto: { version: NAVER_AUTO_TERMS_VERSION, at: 'x', appVersion: 'y' } }).naverAuto), true);
});
