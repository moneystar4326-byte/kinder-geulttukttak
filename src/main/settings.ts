// 일반 설정 (비밀 아님, DB settings 표)
import os from 'node:os';
import path from 'node:path';
import type { Db } from './db';
import { APP } from '../shared/kinder';
import type { CardCountSetting } from '../shared/cardRoles';
import type { NaverAutoConsent } from '../shared/naverAuto';

export interface AppSettings {
  setupDone: boolean;
  // 모델 기본값 (2026-10-18 OpenAI 공식 문서 확인, README "확인 기록"): gpt-image-1 은 2026-10-23 종료 예정 → 후속 gpt-image-2.5-flare,
  // gpt-5 스냅샷은 2026-12-11 종료 예정 → 모델 목록의 gpt-6.1-sol. 실제 키로 호출해 보지는 않음 (미검증). 설정에서 바꿀 수 있음
  textModel: string;
  imageModel: string;
  saveDir: string;
  typingSpeed: number; // 초당 글자 (15~30 권장)
  imageAutoRetry: number;
  monthlyImageLimit: number;
  browserPath: string;
  keywordCacheHours: number; // 같은 검색어 재조회 간격 (약관 · 한도 확인 전까지 짧게)
  cardCount: CardCountSetting; // 카드뉴스 기본 장수 (그림 비용 아끼기). 'auto' = 글 종류에 맞게
  // 네이버 자동 입력 켜기 동의 (태권 글뚝딱 2.8.0에서 옮김). 없으면 꺼짐. 화면의 settings:save 로는 바꿀 수 없고 naverAuto:consent / naverAuto:off 로만
  naverAuto: NaverAutoConsent | null;
}

export const DEFAULTS: AppSettings = {
  setupDone: false,
  textModel: 'gpt-6.1-sol',
  imageModel: 'gpt-image-2.5-flare',
  saveDir: path.join(os.homedir(), 'Documents', APP.appName),
  typingSpeed: 20,
  imageAutoRetry: 1,
  monthlyImageLimit: 60,
  browserPath: '',
  keywordCacheHours: 24,
  cardCount: 'auto',
  naverAuto: null,
};

export function loadSettings(db: Db): AppSettings {
  // 데모 모드는 2.1에서 없앰 (2026-10-22). 예전에 켜 둔 값이 남아 있어도 버림
  const { demo: _old, ...saved } = db.getSetting<Partial<AppSettings> & { demo?: boolean }>('app', {});
  return { ...DEFAULTS, ...saved };
}

export function saveSettings(db: Db, patch: Partial<AppSettings>) {
  const cur = loadSettings(db);
  const next: AppSettings = { ...cur, ...patch };
  next.typingSpeed = Math.min(80, Math.max(5, Math.round(next.typingSpeed)));
  next.imageAutoRetry = Math.min(2, Math.max(0, Math.round(next.imageAutoRetry)));
  next.monthlyImageLimit = Math.min(500, Math.max(0, Math.round(next.monthlyImageLimit)));
  next.keywordCacheHours = Math.min(168, Math.max(0, Math.round(next.keywordCacheHours)));
  if (![1, 2, 3, 'auto'].includes(next.cardCount)) next.cardCount = 'auto';
  next.textModel = next.textModel.trim() || DEFAULTS.textModel;
  next.imageModel = next.imageModel.trim() || DEFAULTS.imageModel;
  db.setSetting('app', next);
  return next;
}
