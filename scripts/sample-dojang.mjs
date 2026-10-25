// 다른 도장 샘플 글을 강담 자료와 섞지 않고 만들기 위한 별도 자료 폴더 준비 + 앱 실행
//   node scripts/sample-dojang.mjs "OO태권도"            → D:\글뚝딱샘플\OO태권도 준비 후 앱 실행
//   node scripts/sample-dojang.mjs "OO태권도" --no-launch → 폴더만 준비
// 가져오는 것: 일반 설정(모델 · 그림 한도 등) + 암호화된 키(secrets.bin + Local State, 같은 Windows 계정에서만 풀림)
// 가져오지 않는 것: 강담 도장 정보 · 글 · 카드 · 작업 기록 · 네이버 로그인
// 장부 예외 항목 "한 PC 여러 도장 실행 스크립트" (2026-10-21)
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const SRC = 'D:\\글뚝딱버전2\\자료';
const ROOT = 'D:\\글뚝딱샘플';
const EXE = 'D:\\글뚝딱버전2\\release\\win-unpacked\\태권 글뚝딱.exe';

const name = process.argv[2]?.trim();
if (!name) {
  console.error('도장 이름을 넣어 주세요. 예: node scripts/sample-dojang.mjs "OO태권도"');
  process.exit(1);
}
const folder = path.join(ROOT, name.replace(/[\\/:*?"<>|]/g, '_'));
const isNew = !fs.existsSync(path.join(folder, 'app.db'));

if (isNew) {
  fs.mkdirSync(path.join(folder, '내보내기'), { recursive: true });
  for (const f of ['Local State', 'secrets.bin']) {
    if (!fs.existsSync(path.join(SRC, f))) throw new Error(`${f} 가 없어요. 강담 앱에서 키를 먼저 저장해 주세요.`);
    fs.copyFileSync(path.join(SRC, f), path.join(folder, f));
  }
  // 앱이 꺼져 있어도 · 켜져 있어도 안전하게 한 번에 복사 (WAL 포함)
  const src = new DatabaseSync(path.join(SRC, 'app.db'), { readOnly: true });
  src.exec(`VACUUM INTO '${path.join(folder, 'app.db').replaceAll("'", "''")}'`);
  src.close();

  const db = new DatabaseSync(path.join(folder, 'app.db'));
  const tables = db.prepare("select name from sqlite_master where type='table' and name not in ('settings','sqlite_sequence')").all().map((r) => r.name);
  db.exec('PRAGMA foreign_keys = OFF; BEGIN');
  for (const t of tables) db.exec(`DELETE FROM "${t}"`);
  const row = db.prepare("select nonsecret_value v from settings where key='app'").get();
  if (row) {
    const s = JSON.parse(row.v);
    s.saveDir = path.join(folder, '내보내기');
    s.browserPath = '';
    db.prepare("update settings set nonsecret_value=? where key='app'").run(JSON.stringify(s));
  }
  db.exec('COMMIT');
  db.close();
  console.log(`준비 완료: ${folder}`);
  console.log('앱이 열리면 [도장 정보]에 이 도장의 실제 정보를 넣고 글을 만드세요. 강담 자료는 그대로예요.');
} else {
  console.log(`이미 있는 샘플 폴더를 써요: ${folder}`);
}

if (!process.argv.includes('--no-launch')) {
  const env = { ...process.env, GTD_DATA_DIR: folder };
  delete env.ELECTRON_RUN_AS_NODE;
  spawn(EXE, [], { env, detached: true, stdio: 'ignore' }).unref();
}
