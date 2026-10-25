// API 비밀키 보관 (DB · 일반 설정 · 백업과 분리된 secrets.bin)
// Electron safeStorage = Windows DPAPI: 같은 Windows 사용자 계정에서만 풀림.
// 평문으로 파일에 남지 않게 하는 것이지, 이 컴퓨터 계정 주인에게서 숨기는 절대 보호는 아님 (README 참고).
// 키 원문은 메인 프로세스 밖(화면)으로 내보내지 않음: 등록 · 마스킹 보기 · 삭제만.
import fs from 'node:fs';
import { maskSecret } from '../../shared/validation';

export type SecretName = 'openai' | 'naverApiKey' | 'naverSecret' | 'naverCustomer' | 'kakao';
export const SECRET_NAMES: SecretName[] = ['openai', 'naverApiKey', 'naverSecret', 'naverCustomer', 'kakao'];

export interface Cipher { available(): boolean; encrypt(s: string): Buffer; decrypt(b: Buffer): string }

export function createVault(file: string, cipher: Cipher) {
  let cache: Partial<Record<SecretName, string>> | null = null;
  let broken = false; // 파일은 있는데 풀지 못함 → 새로 쓰면 다른 키가 다 지워지므로 원본을 먼저 보관
  function load() {
    if (cache) return cache;
    try { cache = JSON.parse(cipher.decrypt(fs.readFileSync(file))); } catch { cache = {}; broken = fs.existsSync(file); }
    return cache!;
  }
  function persist() {
    if (!cipher.available()) throw new Error('이 컴퓨터에서 Windows 암호화 저장을 쓸 수 없어 키를 저장하지 않았어요.');
    if (broken) { fs.copyFileSync(file, `${file}.풀지못함-${Date.now()}.bak`); broken = false; }
    fs.writeFileSync(file, cipher.encrypt(JSON.stringify(cache ?? {})));
  }
  return {
    get: (n: SecretName) => load()[n] ?? null,
    set(n: SecretName, v: string) { load()[n] = v.trim(); persist(); },
    remove(n: SecretName) { delete load()[n]; persist(); },
    masked() { const c = load(); return Object.fromEntries(SECRET_NAMES.map((n) => [n, maskSecret(c[n])])) as Record<SecretName, string | null>; },
  };
}
export type Vault = ReturnType<typeof createVault>;

// 로컬 형식 검사 (비용 없는 확인). 원격 확인은 사용자가 버튼으로 따로
export function checkFormat(n: SecretName, v: string): string | null {
  const t = v.trim();
  if (!t) return '값이 비어 있어요';
  if (/\s/.test(t)) return '중간에 띄어쓰기가 있어요. 복사할 때 다른 글자가 같이 들어갔는지 확인해 주세요';
  if (n === 'openai' && !/^sk-[A-Za-z0-9_\-]{20,}$/.test(t)) return 'OpenAI 키는 보통 sk- 로 시작해요';
  if (n === 'naverCustomer' && !/^\d{3,12}$/.test(t)) return 'Customer ID 는 숫자예요 (SA API 사용 관리 화면 위 CUSTOMER_ID 옆 숫자)';
  if ((n === 'naverApiKey' || n === 'naverSecret') && t.length < 20) return '값이 너무 짧아요. 광고주센터 [도구 → SA API 사용 관리]에서 [복사]를 다시 눌러 주세요';
  if (n === 'kakao' && !/^[0-9a-f]{32}$/i.test(t)) return '카카오 REST API 키는 영문 · 숫자 32자예요';
  return null;
}
