// 이용권 (앱 2.1 · 2026-10-22): 홈페이지 카카오 계정에 이 PC를 연결하고, 서버가 서명한 이용권으로 체험 · 구독 기간을 확인
// [계정 연결] → 브라우저 growmoment.co.kr/app/connect → (카카오 로그인) → [이 PC 연결하기]
// → 브라우저가 127.0.0.1:임시포트/callback 으로 1회용 코드를 넘김 → 앱이 코드 + verifier(PKCE)로 이용권을 받음
// 이용권은 공개키로 인터넷 없이 확인. 켤 때 · 6시간마다 새로 받아 입금 확인 · 중지가 반영됨 (14일 못 받으면 잠김)
// 잠겨도 막는 건 AI로 새로 만드는 일뿐: 지난 글 보기 · 복사 · 내보내기 · 네이버 초안은 그대로
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import type { Cipher } from '../credentials';
import { ApiError } from '../services/errors';
import { checkAccess, LICENSE_PUBLIC_KEY, verifyLicense, type Access, type LicenseClaims } from './token';
import { IND, INDUSTRY, isDaycare } from '../../shared/industry';

export const SERVER = (process.env.GTD_SERVER || 'https://growmoment.co.kr').replace(/\/$/, '');
const REFRESH_EVERY = 6 * 3600_000;
const CONNECT_WAIT = 10 * 60_000;

type Stored = { token: string; refresh: string; activationId: string; lastSeen?: string; checkedAt?: string };

export type LicenseStatus =
  | { state: 'none' } // 아직 연결 안 함
  | { state: 'ok'; plan: 'trial' | 'paid'; daysLeft: number; inGrace: boolean; until: string | null; dojang: string; checkedAt: string | null }
  | { state: 'locked'; why: Exclude<Access, { canCreate: true }>['why'] | 'broken' | 'other-product'; message: string; dojang: string | null; checkedAt: string | null };

// 업종 구분 (2026-10-27 어린이집 글뚝딱): 홈페이지 서버가 이용권에 product 를 넣어 주면 다른 업종 이용권은 잠금.
// 아직 product 가 없는 이용권(지금 서버)은 막지 않음 — 서버에서 구분을 넣기 전까지는 같은 계정이 두 앱을 다 쓸 수 있음
// 어린이집판은 연결 · 갱신 요청에 product=daycare 를 같이 보냄 (태권도판 요청은 2.2.6 그대로)
const productParam: Record<string, string> = isDaycare ? { product: INDUSTRY } : {};

const WHY: Record<string, string> = {
  'trial-ended': '무료 체험이 끝났어요. 구독하시면 바로 이어서 쓸 수 있어요.',
  'paid-ended': '구독 기간이 끝났어요. 입금하시면 확인 뒤 바로 풀려요.',
  revoked: '이용이 멈춰 있어요. 카카오톡으로 문의해 주세요.',
  'recheck-needed': '14일 동안 이용권을 확인하지 못했어요. 인터넷에 연결한 뒤 [다시 확인]을 눌러 주세요.',
  'clock-back': '컴퓨터 시계가 맞지 않아요. Windows 날짜 · 시간을 확인해 주세요.',
  'other-device': '다른 PC의 이용권이에요. [계정 연결]을 다시 해 주세요.',
  'other-dojang': '이용권 정보가 맞지 않아요. [계정 연결]을 다시 해 주세요.',
  broken: '이용권을 읽지 못했어요. [계정 연결]을 다시 해 주세요.',
  'other-product': `${IND.appName}용 이용권이 아니에요. ${IND.appName} 계정으로 [계정 연결]을 다시 해 주세요.`,
};
export const NEED_CONNECT = '새 글 만들기는 계정 연결 뒤에 쓸 수 있어요. 왼쪽 아래 [계정 연결]을 눌러 주세요 (14일 무료).';

// PC 식별값: Windows MachineGuid · 맥 IOPlatformUUID 의 해시 (원래 값은 서버로 보내지 않음). 못 읽으면 자료 폴더에 만든 임의 값
export function readDeviceHash(fallbackFile: string): string {
  let raw = '';
  if (process.platform === 'win32') {
    try {
      const out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
      raw = out.match(/MachineGuid\s+REG_SZ\s+([0-9a-f-]{36})/i)?.[1] ?? '';
    } catch { /* 아래 대체 값 */ }
  } else if (process.platform === 'darwin') {
    try {
      const out = execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], { encoding: 'utf8', timeout: 5000 });
      raw = out.match(/"IOPlatformUUID"\s*=\s*"([0-9A-F-]{36})"/i)?.[1] ?? '';
    } catch { /* 아래 대체 값 */ }
  }
  if (!raw) {
    try { raw = fs.readFileSync(fallbackFile, 'utf8').trim(); } catch { /* 처음 */ }
    if (!raw) { raw = randomBytes(16).toString('hex'); fs.writeFileSync(fallbackFile, raw); }
  }
  return createHash('sha256').update(`geulttukttak2-device:${raw.toLowerCase()}`).digest('base64url');
}

const b64u = (b: Buffer) => b.toString('base64url');
const sha = (s: string) => createHash('sha256').update(s).digest('base64url');

export interface LicenseDeps {
  file: string;
  cipher: Cipher;
  device: string;
  openExternal: (url: string) => Promise<void> | void;
  onChange?: (s: LicenseStatus) => void;
  focus?: () => void;
  log?: (ev: string, msg?: string) => void;
  now?: () => Date;
  fetch?: typeof fetch;
}

export function createLicense(d: LicenseDeps) {
  const now = d.now ?? (() => new Date());
  const f = d.fetch ?? fetch;
  let stored: Stored | null | undefined;
  let pending: { server: http.Server; reject: (e: Error) => void } | null = null;

  function load(): Stored | null {
    if (stored !== undefined) return stored;
    try { stored = JSON.parse(d.cipher.decrypt(fs.readFileSync(d.file))) as Stored; } catch { stored = null; }
    return stored;
  }
  function save(s: Stored | null) {
    stored = s;
    if (!s) { fs.rmSync(d.file, { force: true }); return; }
    if (!d.cipher.available()) throw new Error('이 컴퓨터에서 Windows 암호화 저장을 쓸 수 없어 이용권을 저장하지 못했어요.');
    fs.writeFileSync(d.file, d.cipher.encrypt(JSON.stringify(s)));
  }

  function status(): LicenseStatus {
    const s = load();
    if (!s) return { state: 'none' };
    const v = verifyLicense(s.token, LICENSE_PUBLIC_KEY);
    if (!v.ok) return { state: 'locked', why: 'broken', message: WHY.broken, dojang: null, checkedAt: s.checkedAt ?? null };
    const c = v.claims;
    const product = (c as LicenseClaims & { product?: string }).product;
    if (product && product !== INDUSTRY) return { state: 'locked', why: 'other-product', message: WHY['other-product'], dojang: c.dojang, checkedAt: s.checkedAt ?? null };
    const t = now();
    const lastSeen = s.lastSeen ? new Date(s.lastSeen) : undefined;
    // 도장 이름은 이용권 안의 것으로 비교 (앱 도장 정보 이름과 계정 이름이 달라도 잠기지 않게)
    const a = checkAccess(c, { device: d.device, dojang: c.dojang, now: t, lastSeen });
    // 시계를 되돌린 걸 알아채려고 본 시각 중 가장 늦은 것을 남김 (한 시간에 한 번만 저장)
    if (!lastSeen || t.getTime() > lastSeen.getTime() + 3600_000) { try { save({ ...s, lastSeen: t.toISOString() }); } catch { /* 다음에 */ } }
    if (!a.canCreate) return { state: 'locked', why: a.why, message: WHY[a.why] ?? WHY.broken, dojang: c.dojang, checkedAt: s.checkedAt ?? null };
    return { state: 'ok', plan: a.plan, daysLeft: a.daysLeft, inGrace: a.inGrace, until: c.plan === 'paid' ? c.paidUntil : c.trialEndsAt, dojang: c.dojang, checkedAt: s.checkedAt ?? null };
  }

  // AI로 새로 만들기 전에
  function assertCanCreate() {
    const s = status();
    if (s.state === 'ok') return;
    throw new ApiError('license', s.state === 'none' ? NEED_CONNECT : s.message, '글뚝딱');
  }

  async function post<T>(path: string, body: unknown): Promise<{ status: number; j: T & { error?: string; unlink?: boolean } }> {
    const r = await f(SERVER + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
    return { status: r.status, j: await r.json().catch(() => ({})) as any };
  }

  function accept(token: string) {
    const v = verifyLicense(token, LICENSE_PUBLIC_KEY);
    if (!v.ok || v.claims.device !== d.device) throw new Error('받은 이용권이 맞지 않아요. 잠시 뒤 다시 해 주세요.');
    // 다른 업종 이용권은 저장하지 않음: 연결은 실패로 알리고, 새로 받기면 쓰던 이용권을 그대로 둠 (2026-10-27 버그 점검)
    const product = (v.claims as LicenseClaims & { product?: string }).product;
    if (product && product !== INDUSTRY) throw new Error(WHY['other-product']);
    return v.claims;
  }

  /** 서버에서 이용권을 새로 받음. 인터넷이 안 되면 지금 이용권 그대로 */
  async function refresh(): Promise<LicenseStatus> {
    const s = load();
    if (!s) return status();
    try {
      const r = await post<{ token: string }>('/api/app/refresh', { activationId: s.activationId, refresh: s.refresh, device: d.device, ...productParam });
      if (r.status === 200 && r.j.token) { accept(r.j.token); save({ ...s, token: r.j.token, checkedAt: now().toISOString() }); }
      else if (r.j.unlink) { d.log?.('license-unlinked', r.j.error); save(null); }
      else d.log?.('license-refresh', `${r.status} ${r.j.error ?? ''}`);
    } catch (e) {
      d.log?.('license-refresh', e instanceof Error ? e.message : String(e));
    }
    const st = status();
    d.onChange?.(st);
    return st;
  }

  /** [계정 연결]: 브라우저로 홈페이지 연결 화면을 열고, 돌아오는 1회용 코드로 이용권을 받음 */
  async function connect(): Promise<LicenseStatus> {
    pending?.reject(new Error('새 연결을 시작했어요'));
    const verifier = b64u(randomBytes(32));
    const state = b64u(randomBytes(16));
    const pc = (os.hostname() || 'PC').slice(0, 40);
    let done!: (code: string) => void;
    let fail!: (e: Error) => void;
    const got = new Promise<string>((res, rej) => { done = res; fail = rej; });
    let answer: (html: string) => void = () => {};

    const server = http.createServer((req, res) => {
      const u = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (u.pathname !== '/callback') { res.writeHead(404).end(); return; }
      const code = u.searchParams.get('code');
      if (u.searchParams.get('state') !== state || !code) { res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' }).end(page('연결 정보가 맞지 않아요', '앱에서 [계정 연결]을 다시 눌러 주세요.')); return; }
      // 이용권을 받은 뒤 결과를 브라우저에도 보여 줌
      answer = (html) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html);
      done(code);
    });
    await new Promise<void>((res, rej) => { server.once('error', rej); server.listen(0, '127.0.0.1', () => res()); });
    const port = (server.address() as { port: number }).port;
    const timer = setTimeout(() => fail(new Error('연결을 기다리다 멈췄어요. [계정 연결]을 다시 눌러 주세요.')), CONNECT_WAIT);
    pending = { server, reject: fail };
    try {
      const q = new URLSearchParams({ port: String(port), state, challenge: sha(verifier), device: d.device, pc, ...productParam });
      await d.openExternal(`${SERVER}/app/connect?${q}`);
      const code = await got;
      try {
        const r = await post<{ token: string; refresh: string; activationId: string }>('/api/app/activate', { code, verifier, device: d.device, ...productParam });
        if (r.status !== 200 || !r.j.token) throw new Error(r.j.error || '연결하지 못했어요. 잠시 뒤 다시 해 주세요.');
        const c: LicenseClaims = accept(r.j.token);
        save({ token: r.j.token, refresh: r.j.refresh, activationId: r.j.activationId, checkedAt: now().toISOString(), lastSeen: now().toISOString() });
        answer(page('연결됐어요!', `${c.dojang} 계정에 이 PC를 연결했어요. 이 창을 닫고 글뚝딱 앱으로 돌아가 주세요.`));
      } catch (e) {
        answer(page('연결하지 못했어요', e instanceof Error ? e.message : '잠시 뒤 다시 해 주세요.'));
        throw e;
      }
      d.focus?.();
      const st = status();
      d.onChange?.(st);
      return st;
    } finally {
      clearTimeout(timer);
      if (pending?.server === server) pending = null;
      setTimeout(() => server.close(), 1000); // 브라우저가 답을 다 받은 뒤
    }
  }

  /** 이 PC에서 이용권만 지움 (서버의 PC 연결은 그대로 · 다시 연결하면 같은 PC로 이어짐) */
  function unlink(): LicenseStatus {
    save(null);
    const st = status();
    d.onChange?.(st);
    return st;
  }

  let timer: NodeJS.Timeout | null = null;
  function startAutoRefresh() {
    setTimeout(() => { refresh().catch(() => {}); }, 3000);
    timer = setInterval(() => { refresh().catch(() => {}); }, REFRESH_EVERY);
  }
  const stop = () => { if (timer) clearInterval(timer); pending?.reject(new Error('앱을 닫았어요')); };

  return { status, assertCanCreate, refresh, connect, unlink, startAutoRefresh, stop, device: d.device };
}
export type License = ReturnType<typeof createLicense>;

function page(title: string, body: string) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · ${IND.appName}</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#FFFBF0;font-family:'Malgun Gothic',sans-serif;color:#1d1d1b">
<div style="max-width:440px;margin:24px;padding:32px;background:#fff;border:2px solid #1d1d1b;border-radius:20px;box-shadow:6px 6px 0 #1d1d1b">
<h1 style="margin:0 0 12px;font-size:26px">${esc(title)}</h1><p style="margin:0;font-size:16px;line-height:1.7">${esc(body)}</p></div></body>`;
}
