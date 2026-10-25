// 내보내기 · 백업 · 복원 (기획서 13장)
// 백업 = DB + 카드 · 로고 자산 + 일반 설정(DB 안). 비밀키(secrets.bin) · 네이버 세션(browser-profile) · 로그는 넣지 않음
import fs from 'node:fs';
import path from 'node:path';
import { strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import type { Db } from './db';
import { SCHEMA_VERSION, openDb } from './db';
import type { ArticleVersion, CardSet } from '../shared/types';
import { markdownBody, plainBody, safeFileName } from '../shared/validation';

// 같은 이름이 있으면 덮어쓰지 않고 (2), (3)… 을 붙임 (덮어쓸지는 화면에서 먼저 물어봄)
export function uniquePath(file: string) {
  if (!fs.existsSync(file)) return file;
  const { dir, name, ext } = path.parse(file);
  for (let i = 2; ; i++) { const f = path.join(dir, `${name} (${i})${ext}`); if (!fs.existsSync(f)) return f; }
}

export function exportFiles(outDir: string, v: ArticleVersion, cs: CardSet | null, kinds: { txt?: boolean; md?: boolean; cards?: boolean; zip?: boolean }) {
  fs.mkdirSync(outDir, { recursive: true });
  const d = new Date(v.createdAt); // 파일 이름 날짜는 이 컴퓨터 시간 기준
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const base = safeFileName(`${day} ${v.title}`);
  const written: string[] = [];
  const txt = `${v.title}\n\n${plainBody(v.doc)}\n\n${v.doc.tags.map((t) => `#${t}`).join(' ')}\n`;
  const md = markdownBody(v.title, v.doc);
  const cards = (cs?.cards ?? []).filter((c) => c.status === 'done' && c.outputPath && fs.existsSync(c.outputPath));
  if (kinds.txt) { const f = uniquePath(path.join(outDir, `${base}.txt`)); fs.writeFileSync(f, txt, 'utf-8'); written.push(f); }
  if (kinds.md) { const f = uniquePath(path.join(outDir, `${base}.md`)); fs.writeFileSync(f, md, 'utf-8'); written.push(f); }
  if (kinds.cards) for (const c of cards) { const f = uniquePath(path.join(outDir, `${base} 카드${c.index + 1}.png`)); fs.copyFileSync(c.outputPath!, f); written.push(f); }
  if (kinds.zip) {
    const z: Zippable = { [`${base}.txt`]: strToU8(txt), [`${base}.md`]: strToU8(md) };
    for (const c of cards) z[`카드${c.index + 1}.png`] = [fs.readFileSync(c.outputPath!), { level: 0 }];
    const f = uniquePath(path.join(outDir, `${base}.zip`));
    fs.writeFileSync(f, zipSync(z));
    written.push(f);
  }
  return written;
}

function addDir(z: Zippable, dir: string, prefix: string) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    const key = `${prefix}/${e.name}`;
    if (e.isDirectory()) addDir(z, full, key);
    else z[key] = [fs.readFileSync(full), { level: /\.(png|jpe?g|webp|zip)$/i.test(e.name) ? 0 : 6 }];
  }
}

// 자산 경로는 DB에 절대 경로로 저장됨 → 백업에 원래 데이터 폴더를 적어 두고 복원할 때 바꿈
export function makeBackup(db: Db, dataDir: string, outFile: string, appVersion: string) {
  const tmp = path.join(dataDir, `backup-tmp-${Date.now()}.db`);
  db.raw.exec(`VACUUM INTO '${tmp.replaceAll("'", "''")}'`);
  try {
    const z: Zippable = {
      'manifest.json': strToU8(JSON.stringify({ app: 'geulttukttak2', appVersion, schema: SCHEMA_VERSION, dataDir, createdAt: new Date().toISOString() }, null, 2)),
      'app.db': fs.readFileSync(tmp),
    };
    addDir(z, path.join(dataDir, 'assets'), 'assets');
    fs.writeFileSync(outFile, zipSync(z));
  } finally { fs.rmSync(tmp, { force: true }); }
  return outFile;
}

export function readBackupManifest(file: string) {
  const files = unzipSync(fs.readFileSync(file), { filter: (f) => f.name === 'manifest.json' });
  if (!files['manifest.json']) throw new Error('태권 글뚝딱 백업 파일이 아니에요');
  const m = JSON.parse(Buffer.from(files['manifest.json']).toString('utf-8'));
  if (m.app !== 'geulttukttak2') throw new Error('태권 글뚝딱 백업 파일이 아니에요');
  if (m.schema > SCHEMA_VERSION) throw new Error(`더 새 버전의 태권 글뚝딱에서 만든 백업이에요 (자료 버전 ${m.schema}). 프로그램을 먼저 업데이트해 주세요.`);
  return m as { appVersion: string; schema: number; dataDir: string; createdAt: string };
}

// 자료 폴더를 통째로 옮긴 뒤: DB 안의 절대 경로(카드 · 로고 · 참고 사진)를 새 폴더로 바꿈
export function relocatePaths(dbFile: string, fromDir: string, toDir: string) {
  const db = openDb(dbFile);
  try {
    const from = path.join(fromDir, 'assets'), to = path.join(toDir, 'assets');
    db.raw.prepare('UPDATE cards SET background_path = replace(background_path, ?, ?), output_path = replace(output_path, ?, ?)').run(from, to, from, to);
    db.raw.prepare('UPDATE dojo_profiles SET facts_json = replace(facts_json, ?, ?)').run(JSON.stringify(from).slice(1, -1), JSON.stringify(to).slice(1, -1));
  } finally { db.close(); }
}

// 복원: 현재 자료를 먼저 보관(before-restore-…)하고 바꿈. DB가 닫힌 상태에서 불러야 함
export function restoreBackup(file: string, dataDir: string) {
  const m = readBackupManifest(file);
  const files = unzipSync(fs.readFileSync(file));
  if (!files['app.db']) throw new Error('백업에 자료 파일이 없어요');
  const keep = path.join(dataDir, 'backups', `before-restore-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  fs.mkdirSync(keep, { recursive: true });
  for (const n of ['app.db', 'app.db-wal', 'app.db-shm']) if (fs.existsSync(path.join(dataDir, n))) fs.renameSync(path.join(dataDir, n), path.join(keep, n));
  if (fs.existsSync(path.join(dataDir, 'assets'))) fs.renameSync(path.join(dataDir, 'assets'), path.join(keep, 'assets'));
  try {
  fs.writeFileSync(path.join(dataDir, 'app.db'), files['app.db']);
  for (const [name, data] of Object.entries(files)) {
    if (!name.startsWith('assets/') || name.endsWith('/')) continue;
    const dest = path.join(dataDir, ...name.split('/'));
    if (!dest.startsWith(path.join(dataDir, 'assets') + path.sep)) continue; // 경로 탈출 막기
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, data);
  }
  // 자산 절대 경로를 이 컴퓨터 데이터 폴더로 바꿈 + 스키마 올리기
  const db = openDb(path.join(dataDir, 'app.db'));
  try {
    const from = path.join(m.dataDir, 'assets'), to = path.join(dataDir, 'assets');
    if (from !== to) {
      db.raw.prepare('UPDATE cards SET background_path = replace(background_path, ?, ?), output_path = replace(output_path, ?, ?)').run(from, to, from, to);
      db.raw.prepare("UPDATE dojo_profiles SET facts_json = replace(facts_json, ?, ?)").run(JSON.stringify(from).slice(1, -1), JSON.stringify(to).slice(1, -1));
    }
  } finally { db.close(); }
  } catch (e) {
    // 복원 중 실패 → 보관해 둔 원래 자료로 되돌림
    for (const n of ['app.db', 'app.db-wal', 'app.db-shm']) fs.rmSync(path.join(dataDir, n), { force: true });
    fs.rmSync(path.join(dataDir, 'assets'), { recursive: true, force: true });
    for (const n of fs.readdirSync(keep)) fs.renameSync(path.join(keep, n), path.join(dataDir, n));
    throw e;
  }
  return { keptAt: keep, manifest: m };
}
