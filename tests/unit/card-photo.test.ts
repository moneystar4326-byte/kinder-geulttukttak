// 카드 그림 칸에 사진 넣기 (태권 글뚝딱 2.6.x에서 옮김): 사진을 AI 그림과 따로 두고, 어떤 버튼을 눌러도 사진이 사라지거나 그림 비용이 들지 않음
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../../src/main/db';
import { relocatePaths } from '../../src/main/backup';
import { createCardService, removeCardFiles, retryPendingCardFiles, type Shooter } from '../../src/main/services/card-renderer';
import type { ImageAI } from '../../src/main/services/openai';
import { cardOnePrompt } from '../../src/main/services/openai/prompts';
import { DEMO_INPUT, DEMO_PROFILE } from '../../src/main/services/openai/demo';

const DOC = { titleCandidates: [], sections: [{ id: 's1', paragraphs: ['p'] }], tags: [], photoSuggestions: [], reviewFlags: [] };

function setup(mode: 'ai' | 'template' = 'ai', file = ':memory:') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtd-card-photo-'));
  const db = openDb(file === ':memory:' ? file : path.join(dir, file));
  db.saveProfile(DEMO_PROFILE);
  const a = db.createArticle('default', DEMO_INPUT, [], false);
  const v = db.addVersion({ articleId: a.id, title: 't', doc: DOC, counts: { withSpaces: 1, withoutSpaces: 1 }, note: 'n' } as any, { baseVersionId: null } as any).version;
  const copies = [0, 1, 2].map((i) => ({ title: `제목${i}`, sub: '보조 문구입니다', scene: 'scene' }));
  const cs = db.createCardSet(v.id, { style: '따뜻한 일러스트', size: '1080x1350', mode }, copies);
  const state = { draws: 0, html: '', broken: false };
  const image: ImageAI = { async background() { state.draws++; return Buffer.from('ai'); } };
  const shooter: Shooter = { async shoot(html, _w, _h, out) { state.html = html; fs.writeFileSync(out, 'png'); return { overflow: false, titleLines: 1, subLines: 2, broken: state.broken ? ['x'] : [], fontsOk: true }; } };
  const svc = createCardService({ db, image, shooter, assetsDir: dir, fontDir: dir, profile: () => db.getProfile(), autoRetry: 0, monthlyImageLimit: 50 });
  const photo = path.join(dir, '원본.jpg');
  fs.writeFileSync(photo, 'jpeg');
  return { db, cs, svc, state, dir, photo, v, a, copies };
}

test('사진을 넣으면 그림 칸이 사진이 되고 그림 요청이 없음', async () => {
  const { cs, svc, state, photo } = setup();
  const c = await svc.setPhoto(cs.cards[0].id, photo);
  assert.equal(c.status, 'done');
  assert.ok(c.photoPath && fs.existsSync(c.photoPath));
  assert.notEqual(c.photoPath, photo);
  assert.match(state.html, /photo-\d+\.jpg/);
  assert.equal(state.draws, 0);
});

test('원본을 지워도 카드가 나옴', async () => {
  const { cs, svc, state, photo } = setup();
  const c = await svc.setPhoto(cs.cards[0].id, photo);
  fs.rmSync(photo);
  await svc.updateCopy(c.id, { ...c.copy, title: '새 제목' });
  assert.match(state.html, /photo-\d+\.jpg/);
});

test('사진 카드는 그림 다시 · 다시 만들기 · 묶음 만들기에도 그림을 그리지 않음', async () => {
  const { db, cs, svc, state, photo } = setup();
  const c = await svc.setPhoto(cs.cards[0].id, photo);
  assert.equal((await svc.renderOne(c.id, { newBackground: true })).photoPath, c.photoPath);
  assert.equal(state.draws, 0);
  await svc.renderSet(cs.id);
  assert.equal(state.draws, 2); // 사진 없는 2장만
  assert.equal(db.getCard(c.id)!.photoPath, c.photoPath);
});

test('템플릿 모드로 다시 만들어도 사진이 남음', async () => {
  const { db, cs, svc, state, photo } = setup('template');
  const c = await svc.setPhoto(cs.cards[0].id, photo);
  await svc.renderOne(c.id);
  assert.equal(db.getCard(c.id)!.photoPath, c.photoPath);
  assert.match(state.html, /photo-\d+\.jpg/);
});

test('사진을 빼면 있던 AI 그림으로 돌아가고 다시 그리지 않으며 사진 파일은 지워짐', async () => {
  const { cs, svc, state, photo } = setup();
  const first = await svc.renderOne(cs.cards[0].id);
  assert.equal(state.draws, 1);
  const c = await svc.setPhoto(first.id, photo);
  const back = await svc.setPhoto(c.id, null);
  assert.equal(back.photoPath, undefined);
  assert.equal(back.backgroundPath, first.backgroundPath);
  assert.equal(fs.existsSync(c.photoPath!), false);
  assert.equal(state.draws, 1);
  assert.ok(state.html.includes(path.basename(first.backgroundPath!)));
});

test('다른 사진으로 바꾸면 전 사진 파일은 남지 않음', async () => {
  const { cs, svc, photo } = setup();
  const a = await svc.setPhoto(cs.cards[0].id, photo);
  await new Promise((r) => setTimeout(r, 5));
  const b = await svc.setPhoto(a.id, photo);
  assert.notEqual(a.photoPath, b.photoPath);
  assert.equal(fs.existsSync(a.photoPath!), false);
  assert.ok(fs.existsSync(b.photoPath!));
});

test('합치기에 실패하면 전 상태로 되돌리고 새 파일을 남기지 않음', async () => {
  const { db, cs, svc, state, photo } = setup();
  const before = await svc.renderOne(cs.cards[0].id);
  state.broken = true;
  await assert.rejects(() => svc.setPhoto(before.id, photo));
  state.broken = false;
  const now = db.getCard(before.id)!;
  assert.equal(now.photoPath, undefined);
  assert.equal(now.status, 'done');
  assert.deepEqual(fs.readdirSync(path.dirname(before.outputPath!)).filter((f) => f.startsWith('photo-')), []);
});

test('문구부터 새로 만들어도 같은 자리 사진을 옮기고 그 카드는 그리지 않음', async () => {
  const { db, cs, svc, state, photo, v, copies } = setup();
  const c = await svc.setPhoto(cs.cards[1].id, photo);
  const next = db.createCardSet(v.id, cs.style, copies);
  svc.carryPhotos(db.getCardSet(cs.id), next.id);
  const moved = db.getCardSet(next.id)!.cards[1];
  assert.ok(moved.photoPath && fs.existsSync(moved.photoPath));
  assert.notEqual(moved.photoPath, c.photoPath);
  assert.equal(fs.existsSync(c.photoPath!), false); // 옛 묶음에 사진이 남지 않음
  assert.equal(fs.existsSync(c.outputPath!), false); // 사진이 찍힌 옛 카드 그림도
  assert.equal(db.getCard(c.id)!.photoPath, undefined);
  await svc.renderSet(next.id);
  assert.equal(state.draws, 2);
  assert.equal(db.getCardSet(next.id)!.cards[1].status, 'done');
});

test('자료 폴더를 옮기면 사진 경로도 바뀜 (백업 복원)', async () => {
  const { db, cs, svc, photo, dir } = setup('ai', 'data.db');
  const from = dir, to = path.join(dir, '새폴더');
  const assets = path.join(from, 'assets');
  fs.mkdirSync(assets);
  db.updateCard(cs.cards[0].id, { photoPath: path.join(assets, 'cards', 'x', 'photo-1.jpg') });
  const file = path.join(dir, 'data.db');
  void svc; void photo;
  db.close();
  relocatePaths(file, from, to);
  const again = openDb(file);
  assert.equal(again.getCard(cs.cards[0].id)!.photoPath, path.join(to, 'assets', 'cards', 'x', 'photo-1.jpg'));
  again.close();
});

test('글을 지우면 카드 파일과 사진도 지움', async () => {
  const { db, cs, svc, photo, a, dir } = setup();
  const c = await svc.setPhoto(cs.cards[0].id, photo);
  const sets = db.cardSetIdsOf(a.id);
  assert.deepEqual(sets, [cs.id]);
  db.deleteArticle(a.id);
  removeCardFiles(dir, sets);
  assert.equal(fs.existsSync(c.photoPath!), false);
});

test('사진 카드의 문구 다시 쓰기는 그림 장면을 말하지 않음', () => {
  const current = { title: 't', sub: 's', scene: 'a child kicking' };
  assert.match(cardOnePrompt(DOC as any, 't', 0, current, []), /그림 장면: a child kicking/);
  const p = cardOnePrompt(DOC as any, 't', 0, { ...current, scene: '' }, []);
  assert.doesNotMatch(p, /그림 장면:/);
  assert.match(p, /실제 사진/);
});

test('이전 버전 자료를 열면 글 · 카드는 그대로이고 사진 칸만 늘어남', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtd-card-photo-mig-'));
  const file = path.join(dir, 'old.db');
  const old = openDb(file);
  old.saveProfile(DEMO_PROFILE);
  const a = old.createArticle('default', DEMO_INPUT, [], false);
  const v = old.addVersion({ articleId: a.id, title: 't', doc: DOC, counts: { withSpaces: 1, withoutSpaces: 1 }, note: 'n' } as any, { baseVersionId: null } as any).version;
  const cs = old.createCardSet(v.id, { style: '따뜻한 일러스트', size: '1080x1350', mode: 'ai' }, [{ title: '옛 제목', sub: '옛 문구', scene: 's' }]);
  old.updateCard(cs.cards[0].id, { backgroundPath: 'bg.png', status: 'done' });
  old.raw.exec('ALTER TABLE cards DROP COLUMN photo_fit; ALTER TABLE cards DROP COLUMN photo_path; PRAGMA user_version = 2;');
  old.close();
  const db = openDb(file);
  const c = db.getCard(cs.cards[0].id)!;
  assert.equal(c.copy.title, '옛 제목');
  assert.equal(c.backgroundPath, 'bg.png');
  assert.equal(c.status, 'done');
  assert.equal(c.photoPath, undefined);
  assert.ok(db.getArticle(a.id));
  db.close();
  // 올리기 직전 자료를 복사해 둠
  assert.ok(fs.existsSync(file + '.before-v2'));
});

const photosIn = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((f) => (f.isDirectory() ? photosIn(path.join(dir, f.name)) : f.name.startsWith('photo-') ? [path.join(dir, f.name)] : []));

test('옮긴 뒤 사진을 빼면 PC에 사진 파일이 하나도 남지 않음', async () => {
  const { db, cs, svc, photo, v, copies, dir } = setup();
  await svc.setPhoto(cs.cards[0].id, photo);
  const next = db.createCardSet(v.id, cs.style, copies);
  svc.carryPhotos(db.getCardSet(cs.id), next.id);
  assert.equal(photosIn(dir).length, 1);
  await svc.renderSet(next.id);
  await svc.setPhoto(db.getCardSet(next.id)!.cards[0].id, null);
  assert.equal(photosIn(dir).length, 0);
});

test('장수가 줄어 빠진 카드의 사진도 남지 않음', async () => {
  const { db, cs, svc, photo, v, dir } = setup();
  const c = await svc.setPhoto(cs.cards[1].id, photo);
  const next = db.createCardSet(v.id, cs.style, [{ title: 'a', sub: 'b', scene: 's', index: 0 }]);
  svc.carryPhotos(db.getCardSet(cs.id), next.id);
  assert.equal(photosIn(dir).length, 0);
  assert.equal(fs.existsSync(c.outputPath!), false);
});

test('사진 파일이 사라지면 그림을 그리지 않고 알림 (새 묶음도 같음)', async () => {
  const { db, cs, svc, state, photo, v, copies } = setup();
  const c = await svc.setPhoto(cs.cards[0].id, photo);
  fs.rmSync(c.photoPath!);
  const failed = await svc.renderOne(c.id);
  assert.equal(failed.status, 'failed');
  assert.match(failed.error!, /사진 파일을 찾지 못했어요/);
  assert.equal(state.draws, 0);

  const c2 = await svc.setPhoto(cs.cards[1].id, photo);
  fs.rmSync(c2.photoPath!);
  const next = db.createCardSet(v.id, cs.style, copies);
  svc.carryPhotos(db.getCardSet(cs.id), next.id);
  const again = await svc.renderOne(db.getCardSet(next.id)!.cards[1].id);
  assert.equal(again.status, 'failed');
  assert.equal(state.draws, 0);
});

test('새 그림이 필요할 때 사진 카드의 옛 그림은 돌아갈 그림에서 뺌', async () => {
  const { cs, svc, state, photo } = setup();
  const first = await svc.renderOne(cs.cards[0].id);
  await svc.setPhoto(first.id, photo);
  const restyled = await svc.renderOne(first.id, { newBackground: true });
  assert.equal(restyled.backgroundPath, undefined);
  assert.ok(restyled.photoPath);
  assert.equal(state.draws, 1);
});

test('얼굴을 가린 사진으로 바꾸면 가리기 전 복사본은 지움, 그사이 사진이 바뀌었으면 하지 않음', async () => {
  const { db, cs, svc, photo } = setup();
  const c = await svc.setPhoto(cs.cards[0].id, photo);
  await svc.setPhotoFit(c.id, c.photoPath!, { w: 4, h: 3, faces: [] });
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  const stale = await svc.setMaskedPhoto(c.id, 'C:/다른/사진.jpg', jpeg);
  assert.equal(stale.photoPath, c.photoPath);
  await new Promise((r) => setTimeout(r, 5));
  const m = await svc.setMaskedPhoto(c.id, c.photoPath!, jpeg);
  assert.notEqual(m.photoPath, c.photoPath);
  assert.equal(fs.existsSync(c.photoPath!), false);
  assert.equal(m.photoFit?.masked, true);
  assert.equal(db.getCard(c.id)!.status, 'done');
  const other = await svc.setPhoto(c.id, photo);
  assert.equal(other.photoFit, undefined); // 새 사진은 가리지 않은 상태로 다시 시작
});

test('잠겨서 못 지운 카드 파일은 기억해 두었다가 다시 지움', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtd-card-pending-'));
  const id = '12345678-1234-1234-1234-123456789012';
  const set = path.join(dir, 'cards', id);
  fs.mkdirSync(set, { recursive: true });
  fs.writeFileSync(path.join(set, 'photo-1.jpg'), 'x');
  const real = fs.rmSync;
  (fs as any).rmSync = () => { throw new Error('잠김'); };
  let left: number;
  try { left = removeCardFiles(dir, [id]); } finally { (fs as any).rmSync = real; }
  assert.equal(left, 1);
  assert.ok(fs.existsSync(set));
  retryPendingCardFiles(dir);
  assert.equal(fs.existsSync(set), false);
  assert.equal(fs.existsSync(path.join(dir, 'cards', '.delete-pending.json')), false);
});

test('다시 지우기 목록에 이상한 경로가 있어도 밖을 지우지 않음', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtd-card-pending-'));
  const outside = path.join(dir, 'outside');
  fs.mkdirSync(outside);
  fs.mkdirSync(path.join(dir, 'cards'));
  fs.writeFileSync(path.join(dir, 'cards', '.delete-pending.json'), JSON.stringify(['../outside']));
  retryPendingCardFiles(dir);
  assert.ok(fs.existsSync(outside));
});

test('유치원판: 사진을 새로 넣으면 얼굴 가림 확인 전, 가린 곳이 없어도 확인하면 확인됨으로 남고 문구부터 새로 만들어도 유지', async () => {
  const { db, cs, svc, photo, v, copies } = setup();
  let c = await svc.setPhoto(cs.cards[0].id, photo);
  assert.equal(c.photoFit?.masked, undefined, '넣자마자는 확인 전');
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xd9]);
  c = await svc.setMaskedPhoto(c.id, c.photoPath!, jpeg, { w: 1600, h: 1200 }); // 맞춤 정보가 없어도
  assert.equal(c.photoFit?.masked, true);
  const next = db.createCardSet(v.id, cs.style, copies);
  svc.carryPhotos(db.getCardSet(cs.id), next.id);
  assert.equal(db.getCardSet(next.id)!.cards[0].photoFit?.masked, true, '옮긴 사진도 확인 그대로');
  const again = await svc.setPhoto(db.getCardSet(next.id)!.cards[0].id, photo);
  assert.equal(again.photoFit?.masked, undefined, '다른 사진을 넣으면 다시 확인');
});
