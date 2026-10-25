// 외부 API 오류를 사용자가 할 일 기준으로 나눔 (기획서 12장)
export type ApiErrorCode = 'auth' | 'permission' | 'quota' | 'rate' | 'network' | 'server' | 'schema' | 'cancelled' | 'bad-request' | 'limit' | 'license' | 'unknown';

export class ApiError extends Error {
  constructor(public code: ApiErrorCode, message: string, public provider: string, public retryable = false) { super(message); }
}

const MSG: Record<ApiErrorCode, (p: string) => string> = {
  auth: (p) => `${p} 키가 맞지 않아요. 설정에서 키를 다시 확인해 주세요.`,
  permission: (p) => `${p} 계정에 이 기능(모델) 권한이 없어요. 설정에서 모델을 바꾸거나 ${p} 계정의 사용 권한을 확인해 주세요.`,
  quota: (p) => `${p} 사용 한도나 크레딧이 부족해요. ${p} 결제 · 사용량 화면을 확인해 주세요.`,
  rate: (p) => `${p} 요청이 잠깐 많아요. 1분쯤 뒤에 다시 시도해 주세요.`,
  network: () => '인터넷 연결을 확인해 주세요.',
  server: (p) => `${p} 서버가 잠시 응답하지 않아요. 잠시 뒤 다시 시도해 주세요.`,
  schema: () => 'AI 응답 형식이 맞지 않았어요. 다시 시도해 주세요.',
  cancelled: () => '멈췄어요.',
  'bad-request': (p) => `${p}가 요청을 받지 않았어요. 설정의 모델 이름을 확인해 주세요.`,
  limit: () => '설정한 사용 한도에 닿았어요. 설정에서 한도를 바꿀 수 있어요.',
  license: () => '계정 연결이 필요해요.',
  unknown: (p) => `${p} 요청 중 문제가 생겼어요.`,
};

// 네이버 검색광고 거절 이유 → 할 일
function naverHint(b: string) {
  if (/timestamp|time/.test(b)) return '이 컴퓨터 시계가 맞지 않아요. Windows [설정 → 시간 및 언어 → 날짜 및 시간]에서 [지금 동기화]를 눌러 주세요.';
  if (/signature/.test(b)) return '비밀키가 API Key 와 짝이 맞지 않아요. 비밀키를 [교체]로 다시 넣어 주세요 (앞뒤 띄어쓰기 없이).';
  if (/customer/.test(b)) return 'Customer ID 가 이 키의 계정 번호가 아니에요. [SA API 사용 관리] 화면 위 CUSTOMER_ID 숫자를 다시 넣어 주세요.';
  if (/license|api.?key|access/.test(b)) return 'API Key(액세스라이선스)가 맞지 않아요. [교체]로 다시 넣어 주세요.';
  return 'API Key · 비밀키 · Customer ID 가 같은 계정 것인지 확인해 주세요. 방금 발급했다면 몇 분 뒤 다시 해 보세요.';
}
// 상대가 보낸 이유 원문 (짧게 · 응답에 키가 되돌아오면 앞 4자만 남기고 가림)
function reason(body: string) {
  let t = body;
  try { const j = JSON.parse(body); t = [j.title, j.detail, j.message, j.code].filter(Boolean).join(' / ') || body; } catch { /* 글자 그대로 */ }
  t = t.replace(/[A-Za-z0-9+/=_-]{16,}/g, (k) => k.slice(0, 4) + '••••').replace(/\s+/g, ' ').trim().slice(0, 120);
  return t ? ` (네이버 답: ${t})` : '';
}

export function fromHttp(provider: string, status: number, body = ''): ApiError {
  const b = body.toLowerCase();
  if (status === 401 && /네이버/.test(provider)) return new ApiError('auth', `${provider} 인증에 실패했어요. ${naverHint(b)}${reason(body)}`, provider);
  if (status === 401) return new ApiError('auth', MSG.auth(provider), provider);
  if (status === 403) {
    // 네이버 검색광고 403 = 인증 실패 (키 · 비밀키 · Customer ID 조합이 안 맞음). 모델 이야기가 아님 (2026-10-18 실사용)
    // 카카오 403 = 키는 맞는데 앱에서 카카오맵(로컬) 사용 설정이 꺼짐 ("disabled OPEN_MAP_AND_LOCAL service" · 2026-10-22 파일럿 설치)
    if (/카카오/.test(provider)) return new ApiError('auth', /OPEN_MAP_AND_LOCAL/i.test(body) || !body
      ? '카카오 키는 맞지만 이 키의 앱에서 카카오맵 사용이 꺼져 있어요. 카카오 개발자 사이트 → 내 애플리케이션 → 이 앱 → [제품 설정 → 카카오맵]에서 사용 설정을 켠 뒤 다시 확인해 주세요.'
      : '카카오가 요청을 거절했어요 (403). 카카오 개발자 사이트에서 이 앱의 REST API 키와 카카오맵 사용 설정을 확인해 주세요.', provider);
    // 네이버가 보낸 거절 이유를 같이 보여 줌 (값이 맞아 보이는데 계속 실패 · 2026-10-22 파일럿 설치)
    if (/네이버/.test(provider)) return new ApiError('auth', `${provider} 인증에 실패했어요. ${naverHint(b)}${reason(body)}`, provider);
    return new ApiError('permission', MSG.permission(provider), provider);
  }
  if (status === 429) {
    if (/insufficient_quota|quota|billing|credit/.test(b)) return new ApiError('quota', MSG.quota(provider), provider);
    return new ApiError('rate', MSG.rate(provider), provider, true);
  }
  if (status === 404 || (status === 400 && /model/.test(b))) return new ApiError('bad-request', MSG['bad-request'](provider), provider);
  if (status === 400) return new ApiError('bad-request', `${provider} 요청이 거절됐어요 (400).`, provider);
  if (status >= 500) return new ApiError('server', MSG.server(provider), provider, true);
  return new ApiError('unknown', MSG.unknown(provider), provider);
}

export function toApiError(provider: string, e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  const any = e as any;
  if (any?.name === 'AbortError' || any?.name === 'APIUserAbortError') return new ApiError('cancelled', MSG.cancelled(provider), provider);
  if (any?.name === 'TimeoutError' || any?.name === 'APIConnectionTimeoutError') return new ApiError('network', '응답이 너무 늦어요. 인터넷 연결을 확인하고 다시 시도해 주세요.', provider, true);
  if (typeof any?.status === 'number') return fromHttp(provider, any.status, `${any?.code ?? ''} ${any?.message ?? ''}`);
  if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|Connection error|timed out/i.test(String(any?.message ?? any))) return new ApiError('network', MSG.network(provider), provider, true);
  return new ApiError('unknown', MSG.unknown(provider), provider);
}

export const messageFor = (code: ApiErrorCode, provider: string) => MSG[code](provider);
