// 글뚝딱 2 — Electron 메인
// 보안 기본: nodeIntegration 끔 · contextIsolation 켬 · sandbox, 외부 페이지 이동 · 새 창 막음, 자산은 전용 주소(gtd-asset://)로만
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, clipboard, dialog, net, protocol, safeStorage, session, shell } from 'electron';
import { openDb } from './db';
import { createVault } from './credentials';
import { createJobRunner } from './jobs';
import { registerIpc } from './ipc';
import { electronShooter } from './services/card-renderer/electron-shooter';
import { createBrowserDraft } from './services/browser-draft';
import { loadSettings } from './settings';
import { restoreBackup } from './backup';
import { initLog, log } from './log';
import { createLicense, pickDeviceHash } from './license';
import { APP } from '../shared/kinder';

protocol.registerSchemesAsPrivileged([{ scheme: 'gtd-asset', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

// 시험용: 데이터 폴더를 따로 (실사용 자료와 섞이지 않게)
if (process.env.GTD_DATA_DIR) app.setPath('userData', process.env.GTD_DATA_DIR);
// 자료 폴더 옮기기: %APPDATA%\글뚝딱-자료위치.txt 에 적힌 폴더를 씀 (2026-10-18 사용자: D 드라이브에 두고 싶음)
// 위치 파일 · 기본 자료 폴더가 태권 글뚝딱과 따로 (%APPDATA%\유치원글뚝딱-자료위치.txt · %APPDATA%\유치원 글뚝딱) — 한 PC에 두 앱을 깔아도 섞이지 않게
else {
  app.setPath('userData', path.join(app.getPath('appData'), APP.appName));
  let where = '';
  try { where = fs.readFileSync(path.join(app.getPath('appData'), APP.dataLocFile), 'utf-8').trim(); } catch { /* 없으면 기본 위치 */ }
  if (where && fs.existsSync(where)) app.setPath('userData', where);
  else if (where) {
    // 적어 둔 자료 폴더가 없으면 (드라이브가 안 붙음 등) 빈 자료로 켜지 않고 알림 후 종료 — 2026-10-18 버그 점검
    // showErrorBox 는 ready 전에도 쓸 수 있음 → 아래에서 DB 를 만들기 전에 멈춤
    dialog.showErrorBox('글뚝딱 자료 폴더를 찾지 못했어요', [`자료 폴더가 없어요: ${where}`, '', '드라이브가 연결되어 있는지 확인한 뒤 다시 켜 주세요.', `자료 위치를 바꾸려면 ${path.join(app.getPath('appData'), APP.dataLocFile)} 파일을 고치거나 지우면 돼요.`].join(String.fromCharCode(10)));
    process.exit(1);
  }
}
// 한 번에 하나만 실행 (데이터 폴더 기준이라 위의 폴더 지정보다 뒤에)
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

const dataDir = app.getPath('userData');
const assetsDir = path.join(dataDir, 'assets');
const resources = app.isPackaged ? process.resourcesPath : path.join(__dirname, '../../resources');
const fontDir = path.join(resources, 'fonts');
fs.mkdirSync(assetsDir, { recursive: true });
initLog(path.join(dataDir, 'logs'));

// 복원 요청이 있으면 DB를 열기 전에 처리
const pendingRestore = path.join(dataDir, 'restore-pending.txt');
if (fs.existsSync(pendingRestore)) {
  const file = fs.readFileSync(pendingRestore, 'utf-8').trim();
  fs.rmSync(pendingRestore, { force: true });
  try { restoreBackup(file, dataDir); log('restore-ok'); } catch (e) { log('restore-failed', e instanceof Error ? e.message : String(e)); }
}

const db = openDb(path.join(dataDir, 'app.db'));
const interrupted = db.recoverInterrupted();
if (interrupted) log('jobs-interrupted', String(interrupted));

let win: BrowserWindow | null = null;

// 자비스 음성 비서: `--jarvis-quick=주제` 로 켜거나 다시 부르면 '주제 한 줄로 바로 쓰기'를 시작 (발행은 사람이 직접)
const jarvisArg = (argv: string[]) => {
  const a = argv.find((x) => x.startsWith('--jarvis-quick='));
  return a ? a.slice('--jarvis-quick='.length).trim().slice(0, 300) : '';
};
let jarvisQuick = jarvisArg(process.argv);

function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 900, minWidth: 900, minHeight: 640, title: APP.appName, backgroundColor: '#F7F7F5', show: false,
    webPreferences: { preload: path.join(__dirname, '../preload/index.js'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, spellcheck: false },
  });
  win.setMenuBarVisibility(false);
  win.once('ready-to-show', () => win?.show());
  // 앱 화면 밖으로 이동 · 새 창 막기 (외부 링크는 IPC shell:open 의 허용 목록으로만)
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  // 권한 요청은 모두 거절. 예외 하나: 우리 앱 화면이 "메모 말로 넣기"에서 마이크(소리만)를 쓸 때 (2026-10-26)
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) => {
    const audioOnly = perm === 'media' && 'mediaTypes' in details && (details.mediaTypes ?? []).length > 0 && (details.mediaTypes ?? []).every((t) => t === 'audio');
    cb(audioOnly && wc === win?.webContents && details.requestingUrl.startsWith('file:'));
  });
  session.defaultSession.setPermissionCheckHandler((wc, perm, origin) => perm === 'media' && wc === win?.webContents && origin.startsWith('file:'));
  // 카드 · 로고 미리보기: 데이터 폴더 assets 안의 파일만
  protocol.handle('gtd-asset', (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '');
    const file = path.resolve(assetsDir, rel);
    if (!file.startsWith(path.resolve(assetsDir) + path.sep) || !fs.existsSync(file)) return new Response('not found', { status: 404 });
    return net.fetch(pathToFileURL(file).href);
  });

  const vault = createVault(path.join(dataDir, 'secrets.bin'), {
    available: () => safeStorage.isEncryptionAvailable(),
    encrypt: (s) => safeStorage.encryptString(s),
    decrypt: (b) => safeStorage.decryptString(b),
  });
  // 이용권 (계정 연결 · 체험 · 구독 기간). 시험 때 GTD_SERVER 로 시험 홈페이지를 가리킬 수 있음 (서명 키가 같아야 통과)
  const cipher = { available: () => safeStorage.isEncryptionAvailable(), encrypt: (s: string) => safeStorage.encryptString(s), decrypt: (b: Buffer) => safeStorage.decryptString(b) };
  const license = createLicense({
    file: path.join(dataDir, 'license.bin'), cipher, device: pickDeviceHash(dataDir),
    openExternal: (url) => shell.openExternal(url),
    focus: () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } },
    log,
  });
  license.startAutoRefresh();
  app.on('before-quit', () => license.stop());
  const runner = createJobRunner(db, (job) => win?.webContents.send('job:update', job));
  const browser = createBrowserDraft({
    profileDir: path.join(dataDir, 'browser-profile'),
    browserPath: () => loadSettings(db).browserPath || undefined,
    // 본문은 시스템 클립보드로 붙여넣기 (한글 · 줄바꿈 유지 — 1버전 방식). 붙여넣은 뒤 원래 클립보드 내용을 되돌림
    paste: async (page, _f, text) => {
      const before = await clipboard.readText();
      try {
        await clipboard.writeText(text);
        await page.keyboard.press('ControlOrMeta+V'); // 맥은 ⌘V
        await page.waitForTimeout(800);
      } finally { await clipboard.writeText(before); } // 중간에 멈춰도 원래 클립보드로
    },
    log,
  });

  registerIpc({
    db, vault, runner, browser, license, shooter: electronShooter(), dataDir, assetsDir, fontDir, win: () => win,
    takeJarvisQuick: () => { const q = jarvisQuick; jarvisQuick = ''; return q; },
    requestRestore: (file) => {
      fs.writeFileSync(pendingRestore, file, 'utf-8');
      browser.close().finally(() => { db.close(); app.relaunch(); app.exit(0); });
    },
  });
  createWindow();
});

app.on('second-instance', (_e, argv) => {
  const q = jarvisArg(argv);
  if (q) { jarvisQuick = q; win?.webContents.send('jarvis:quick'); }
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});
app.on('window-all-closed', () => app.quit());
app.on('web-contents-created', (_e, wc) => {
  wc.on('will-attach-webview', (e) => e.preventDefault());
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
});
