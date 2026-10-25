// 네이버 전용 창에 쓸 브라우저 찾기 (1버전과 같음: 크롬 → 없으면 윈도우 기본 엣지)
// 브라우저를 앱에 같이 넣지 않음 (설치 용량 · 업데이트 부담). 엣지는 Windows 10/11 에 기본으로 있음
// 맥 (2026-10-25): /Applications 의 크롬 → 엣지. 설정의 직접 지정은 .exe 또는 .app 안의 실행 파일
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MAC_APPS = [
  ['Google Chrome', 'Chrome'],
  ['Microsoft Edge', 'Edge'],
] as const;

function macPath(p: string) {
  // "/Applications/Google Chrome.app" 처럼 .app 까지만 적어도 안의 실행 파일로
  const m = p.match(/^(.*\/([^/]+))\.app\/?$/);
  return m ? path.join(p, 'Contents/MacOS', m[2]) : p;
}

export function findBrowser(custom?: string): { path: string; name: string } | null {
  if (process.platform === 'darwin') {
    if (custom) { const c = macPath(custom.trim()); if (fs.existsSync(c)) return { path: c, name: '직접 지정' }; }
    for (const [app, name] of MAC_APPS) {
      const p = [path.join('/Applications', `${app}.app`), path.join(os.homedir(), 'Applications', `${app}.app`)].map((a) => path.join(a, 'Contents/MacOS', app)).find((x) => fs.existsSync(x));
      if (p) return { path: p, name };
    }
    return null;
  }
  if (custom && /.exe$/i.test(custom) && fs.existsSync(custom)) return { path: custom, name: '직접 지정' };
  const local = process.env.LOCALAPPDATA;
  const chrome = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    ...(local ? [path.join(local, 'Google/Chrome/Application/chrome.exe')] : []),
  ].find((p) => fs.existsSync(p));
  if (chrome) return { path: chrome, name: 'Chrome' };
  const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
  return edge ? { path: edge, name: 'Edge' } : null;
}

export const NO_BROWSER = '크롬이나 엣지 브라우저를 찾지 못했어요. 크롬을 설치하거나 설정에서 브라우저 위치를 지정해 주세요.';
