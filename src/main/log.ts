// 오류 기록: 오류 코드 중심. 키 · 쿠키 · 긴 입력은 남기지 않음
import fs from 'node:fs';
import path from 'node:path';

let dir = '';
export function initLog(logDir: string) { dir = logDir; fs.mkdirSync(dir, { recursive: true }); }

const SECRET_PATTERNS = [/sk-[A-Za-z0-9_\-]{8,}/g, /KakaoAK\s+\S+/g, /X-(API-KEY|Signature|Customer)['":\s]+\S+/gi, /[0-9a-f]{32}/gi, /NID_[A-Z]+=[^;\s]+/g];
export function scrub(s: string) {
  let t = s;
  for (const re of SECRET_PATTERNS) t = t.replace(re, '[가림]');
  return t.length > 500 ? `${t.slice(0, 500)}…` : t;
}

export function log(code: string, detail = '') {
  if (!dir) return;
  try { fs.appendFileSync(path.join(dir, `${new Date().toISOString().slice(0, 7)}.log`), `${new Date().toISOString()} ${code} ${scrub(detail)}\n`, 'utf-8'); } catch { /* 로그 실패는 무시 */ }
}
