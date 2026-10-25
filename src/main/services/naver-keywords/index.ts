// 네이버 검색광고 API 키워드 도구 (기획서 5장)
// 확인: https://naver.github.io/searchad-apidoc/ — GET /keywordstool, 서명 = base64(HMAC-SHA256(secret, "{timestamp}.{method}.{uri}"))
// 헤더 X-Timestamp · X-API-KEY · X-Customer · X-Signature. hintKeywords 는 띄어쓰기 없이, 쉼표로 최대 5개.
// 작은 검색량은 "< 10" 같은 문자열로 옴 → 원문 그대로 보존 (숫자로 바꾸지 않음)
import { createHmac } from 'node:crypto';
import { ApiError, fromHttp, toApiError } from '../errors';
import type { KeywordRow } from '../../../shared/types';

const BASE = 'https://api.searchad.naver.com';

export function sign(timestamp: string, method: string, uri: string, secret: string) {
  return createHmac('sha256', secret).update(`${timestamp}.${method}.${uri}`).digest('base64');
}

export function hintOf(words: string[]) {
  const clean = [...new Set(words.map((w) => w.replace(/\s+/g, '').trim()).filter(Boolean))].slice(0, 5);
  if (!clean.length) throw new ApiError('bad-request', '조회할 키워드를 적어 주세요', '네이버 검색광고');
  return clean.join(',');
}

const COMP: Record<string, string> = { 높음: '높음', 중간: '중간', 낮음: '낮음' };

export function normalize(raw: any, fetchedAt: string, limit = 40): KeywordRow[] {
  const list: any[] = Array.isArray(raw?.keywordList) ? raw.keywordList : [];
  return list.slice(0, limit).map((k) => ({
    keyword: String(k.relKeyword ?? ''),
    source: 'naver' as const,
    pc: k.monthlyPcQcCnt == null ? undefined : String(k.monthlyPcQcCnt),
    mobile: k.monthlyMobileQcCnt == null ? undefined : String(k.monthlyMobileQcCnt),
    competition: k.compIdx == null ? undefined : (COMP[String(k.compIdx)] ?? String(k.compIdx)),
    fetchedAt,
  })).filter((r) => r.keyword);
}

// 합계는 두 값이 모두 정확한 숫자일 때만 (문자열 "< 10" 이 섞이면 계산하지 않음)
export function totalOf(r: KeywordRow): number | null {
  const n = (v?: string) => (v != null && /^\d+$/.test(v) ? Number(v) : null);
  const a = n(r.pc), b = n(r.mobile);
  return a == null || b == null ? null : a + b;
}

export async function lookupKeywords(creds: { apiKey: string; secret: string; customerId: string }, words: string[], signal?: AbortSignal) {
  const hint = hintOf(words);
  const uri = '/keywordstool';
  const ts = Date.now().toString();
  const url = `${BASE}${uri}?hintKeywords=${encodeURIComponent(hint)}&showDetail=1`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'X-Timestamp': ts, 'X-API-KEY': creds.apiKey, 'X-Customer': creds.customerId, 'X-Signature': sign(ts, 'GET', uri, creds.secret) },
      signal: signal ?? AbortSignal.timeout(10_000),
    });
  } catch (e) { throw toApiError('네이버 검색광고', e); }
  const body = await res.text();
  if (!res.ok) throw fromHttp('네이버 검색광고', res.status, body);
  let raw: any;
  try { raw = JSON.parse(body); } catch { throw new ApiError('schema', '네이버 응답을 읽지 못했어요', '네이버 검색광고'); }
  const fetchedAt = new Date().toISOString();
  return { hint, raw: body, rows: normalize(raw, fetchedAt), fetchedAt };
}
