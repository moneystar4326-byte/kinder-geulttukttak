// 앱 활성화 정보(라이선스 토큰) 서명 · 확인
// 홈페이지 lib/license/token.ts 에서 확인 부분만 가져옴 (서명은 홈페이지 서버만). 고칠 때 두 곳을 같이
// 형식: base64url(JSON 내용) + "." + base64url(Ed25519 서명)
// 월 구독 기준 (2026-10-21). 2단계 설계: docs/2단계-설계.md
import { createPublicKey, verify, type KeyObject } from 'node:crypto';

export type Plan = 'trial' | 'paid' | 'revoked';

export interface LicenseClaims {
  v: 2;
  sub: string; // 계정 id
  dojang: string; // 계정에 적힌 도장 이름 (글에 들어가는 이름)
  device: string; // PC 식별값 해시 (원래 값은 서버로 보내지 않음)
  plan: Plan;
  trialEndsAt: string | null; // 체험 끝 (ISO)
  paidUntil: string | null; // 구독 이용 기한 (ISO)
  graceDays: number; // 기한이 지나도 입금 확인을 기다리며 쓰는 날
  iat: string; // 발급 시각
  recheckBy: string; // 이 시각까지 다시 확인 못 하면 "인터넷에 연결해 주세요"
}

const b64u = (b: Buffer) => b.toString('base64url');
const DAY = 24 * 3600_000;

export type VerifyResult =
  | { ok: true; claims: LicenseClaims }
  | { ok: false; reason: 'format' | 'signature' | 'version' };

export function verifyLicense(token: string, publicPem: string | KeyObject): VerifyResult {
  const parts = token.trim().split('.');
  if (parts.length !== 2) return { ok: false, reason: 'format' };
  let body: Buffer;
  let sig: Buffer;
  try {
    body = Buffer.from(parts[0], 'base64url');
    sig = Buffer.from(parts[1], 'base64url');
  } catch {
    return { ok: false, reason: 'format' };
  }
  const key = typeof publicPem === 'string' ? createPublicKey(publicPem) : publicPem;
  if (!verify(null, body, key, sig)) return { ok: false, reason: 'signature' };
  let claims: LicenseClaims;
  try {
    claims = JSON.parse(body.toString('utf8'));
  } catch {
    return { ok: false, reason: 'format' };
  }
  if (claims.v !== 2) return { ok: false, reason: 'version' };
  return { ok: true, claims };
}

// 앱이 새 글을 만들 수 있는지. 서명 확인을 통과한 내용과 이 PC 값, 현재 시각으로 판단
// 잠겨도 막는 건 새 글 만들기뿐. 지난 글 보기 · 복사 · 내보내기는 앱이 늘 허용
export type Access =
  | { canCreate: true; plan: 'trial' | 'paid'; daysLeft: number; inGrace: boolean }
  | { canCreate: false; why: 'other-device' | 'other-dojang' | 'trial-ended' | 'paid-ended' | 'revoked' | 'recheck-needed' | 'clock-back' };

export function checkAccess(c: LicenseClaims, ctx: { device: string; dojang: string; now: Date; lastSeen?: Date }): Access {
  if (c.device !== ctx.device) return { canCreate: false, why: 'other-device' };
  // 띄어쓰기 · 기호 차이로 구독 고객이 잠기지 않게 비교 전 정리
  const norm = (s: string) => s.normalize('NFC').replace(/[\s·.,()\-_]/g, '').toLowerCase();
  if (norm(c.dojang) !== norm(ctx.dojang)) return { canCreate: false, why: 'other-dojang' };
  if (c.plan === 'revoked') return { canCreate: false, why: 'revoked' };
  // 시계를 하루 넘게 되돌린 경우만 의심 (시간대 변경 · 작은 오차는 봐줌)
  if (ctx.lastSeen && ctx.now.getTime() < ctx.lastSeen.getTime() - DAY) return { canCreate: false, why: 'clock-back' };
  if (ctx.now > new Date(c.recheckBy)) return { canCreate: false, why: 'recheck-needed' };
  const daysUntil = (iso: string) => Math.ceil((new Date(iso).getTime() - ctx.now.getTime()) / DAY);

  if (c.plan === 'trial') {
    if (!c.trialEndsAt || ctx.now >= new Date(c.trialEndsAt)) return { canCreate: false, why: 'trial-ended' };
    return { canCreate: true, plan: 'trial', daysLeft: daysUntil(c.trialEndsAt), inGrace: false };
  }
  // 구독: 기한 + 유예 기간까지 새 글 가능. 유예 중이면 앱이 "입금 확인을 기다리는 중" 안내
  if (!c.paidUntil) return { canCreate: false, why: 'paid-ended' };
  const end = new Date(c.paidUntil).getTime();
  if (ctx.now.getTime() >= end + c.graceDays * DAY) return { canCreate: false, why: 'paid-ended' };
  return { canCreate: true, plan: 'paid', daysLeft: daysUntil(c.paidUntil), inGrace: ctx.now.getTime() >= end };
}

// 한국 시각 자정 기준 만료 시각. 가입일을 1일째로 세서 days일째가 끝나는 밤 12시
// 예: 10/21 가입 · 14일 → 11/3까지 쓰고 11/4 0시(KST)에 끝

// 홈페이지 서버 서명 키의 공개키 (홈페이지 lib/license/public-key.ts 와 같음)
export const LICENSE_PUBLIC_KEY = "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEALsV2FYpd8PkN75ZpGZUZUTxNcANos8Rd0SybooyUmeY=\n-----END PUBLIC KEY-----\n";
