// API 키는 로그 · 백업 · DB 에 남지 않음, 백업 · 복원
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { openDb } from '../../src/main/db';
import { checkFormat, createVault } from '../../src/main/credentials';
import { makeBackup, restoreBackup, exportFiles, uniquePath } from '../../src/main/backup';
import { scrub, initLog, log } from '../../src/main/log';
import { DEMO_INPUT, DEMO_PROFILE } from '../../src/main/services/openai/demo';
import { safeFileName } from '../../src/shared/validation';

const KEY = 'sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
// 시험용 암호기 (실제 앱은 Windows DPAPI)
const cipher = { available: () => true, encrypt: (s: string) => Buffer.from(Buffer.from(s, 'utf-8').map((b) => b ^ 0x5a)), decrypt: (b: Buffer) => Buffer.from(b.map((x) => x ^ 0x5a)).toString('utf-8') };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gtd-test-'));

test('키는 암호화 파일에만, 화면에는 마스킹 값만', () => {
  const dir = tmp();
  const v = createVault(path.join(dir, 'secrets.bin'), cipher);
  v.set('openai', KEY);
  assert.ok(!fs.readFileSync(path.join(dir, 'secrets.bin')).toString('utf-8').includes(KEY));
  assert.equal(v.masked().openai, 'sk-••••6789');
  assert.equal(createVault(path.join(dir, 'secrets.bin'), cipher).get('openai'), KEY);
  v.remove('openai');
  assert.equal(v.get('openai'), null);
});

test('형식 검사', () => {
  assert.match(checkFormat('openai', 'abc')!, /sk-/);
  assert.equal(checkFormat('openai', KEY), null);
  assert.match(checkFormat('naverCustomer', '12a')!, /숫자/);
  assert.match(checkFormat('openai', 'sk-abc def')!, /띄어쓰기/);
});

test('로그에서 키 가림', () => {
  assert.ok(!scrub(`401 Incorrect API key provided: ${KEY}`).includes(KEY));
  assert.ok(!scrub('Authorization: KakaoAK 0123456789abcdef0123456789abcdef').includes('0123456789abcdef'));
  const dir = tmp();
  initLog(dir);
  log('test', `key=${KEY}`);
  const content = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf-8')).join('');
  assert.ok(content.includes('[가림]') && !content.includes(KEY));
});

test('백업에는 DB · 자산만 (비밀키 · 네이버 세션 · 로그 제외), 복원은 현재 자료를 먼저 보관', () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'assets', 'cards', 'x', '1'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets', 'cards', 'x', '1', 'card.png'), 'png');
  fs.mkdirSync(path.join(dir, 'browser-profile'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'browser-profile', 'Cookies'), 'NID_AUT=secret');
  createVault(path.join(dir, 'secrets.bin'), cipher).set('openai', KEY);
  const db = openDb(path.join(dir, 'app.db'));
  db.saveProfile(DEMO_PROFILE);
  const a = db.createArticle('default', DEMO_INPUT, [], true);
  const out = path.join(dir, 'backup.zip');
  makeBackup(db, dir, out, '0.1.0');
  db.close();
  const names = Object.keys(unzipSync(fs.readFileSync(out)));
  assert.ok(names.includes('app.db') && names.includes('manifest.json') && names.includes('assets/cards/x/1/card.png'));
  assert.ok(!names.some((n) => /secrets|browser-profile|logs|Cookies/.test(n)));
  assert.ok(!fs.readFileSync(out).includes(Buffer.from(KEY)));

  // 다른 컴퓨터(다른 폴더)로 복원
  const dir2 = tmp();
  fs.writeFileSync(path.join(dir2, 'app.db'), 'old');
  const r = restoreBackup(out, dir2);
  assert.ok(fs.existsSync(path.join(r.keptAt, 'app.db')));
  const db2 = openDb(path.join(dir2, 'app.db'));
  assert.equal(db2.getArticle(a.id)!.input.topic, DEMO_INPUT.topic);
  assert.ok(fs.existsSync(path.join(dir2, 'assets', 'cards', 'x', '1', 'card.png')));
  db2.close();
});

test('내보내기 파일 이름: 금지 문자 제거 · 덮어쓰지 않음', () => {
  assert.equal(safeFileName('태권도: "품새" <발표>?'), '태권도 품새 발표');
  assert.equal(safeFileName('con'), '_con');
  const dir = tmp();
  const db = openDb(':memory:');
  db.saveProfile(DEMO_PROFILE);
  const a = db.createArticle('default', DEMO_INPUT, [], true);
  const v = db.addVersion({ articleId: a.id, title: '제목/테스트', doc: { titleCandidates: [], sections: [{ id: 's1', paragraphs: ['본문'] }], tags: ['태그'], photoSuggestions: [], reviewFlags: [] }, counts: { withSpaces: 2, withoutSpaces: 2 }, note: 't' }).version;
  const first = exportFiles(dir, v, null, { txt: true, md: true, cards: false, zip: true });
  const second = exportFiles(dir, v, null, { txt: true, md: false, cards: false, zip: false });
  assert.equal(first.length, 3);
  assert.notEqual(first[0], second[0]);
  assert.match(second[0], /\(2\)\.txt$/);
  assert.equal(fs.readFileSync(first[0], 'utf-8'), '제목/테스트\n\n본문\n\n#태그\n');
  assert.equal(uniquePath(path.join(dir, 'none.txt')), path.join(dir, 'none.txt'));
});

test('키 보관 파일을 풀지 못하면 새로 쓰기 전에 원본을 따로 보관 (다른 키가 사라지지 않게)', () => {
  const dir = tmp();
  const file = path.join(dir, 'secrets.bin');
  createVault(file, cipher).set('openai', KEY);
  const bad = { ...cipher, decrypt: () => { throw new Error('풀 수 없음'); } };
  createVault(file, bad).set('kakao', '0123456789abcdef0123456789abcdef');
  const baks = fs.readdirSync(dir).filter((f) => f.includes('풀지못함'));
  assert.equal(baks.length, 1);
  assert.equal(createVault(path.join(dir, baks[0]), cipher).get('openai'), KEY);
});
