// 앱 전체가 같이 쓰는 데이터 모양

export const ARTICLE_KINDS = ['수업 후기', '성장 이야기', '행사 안내', '모집 안내', '교육 정보'] as const;
export type ArticleKind = (typeof ARTICLE_KINDS)[number];

export const AUDIENCES = ['유치부', '초등 저학년', '초등 고학년', '중등 이상', '성인'] as const;
export const TONES = ['따뜻한 설명형', '전문적인 교육형'] as const;
export type Tone = (typeof TONES)[number];
export const ENDINGS = ['도장 소개로 마무리', '상담 안내로 마무리', '가정에서 해 볼 것으로 마무리', '마무리 인사만'] as const;

export interface DojoProfile {
  id: string;
  name: string; // 공식 표기
  region: string; // 실제 동 · 구 · 시
  address?: string;
  audiences: string[];
  philosophy: string;
  classFeatures: string; // 아래 칸들을 모은 것 (글을 쓸 때 AI에 전달)
  hours?: string; // 수업 시간
  classes?: string; // 반 구성
  promoDay?: string; // 승급심사
  strengths?: string[]; // 우리 도장 강점 (체크한 것만 글에 씀)
  strengthsEtc?: string; // 그 밖의 강점 (쉼표)
  otherFacts?: string; // 그 밖의 운영 사실
  credentials?: string; // 확인 가능한 내용만
  contact?: string;
  consultLink?: string;
  blogUrl?: string;
  mapName?: string; // 네이버 지도에서 검색할 도장 이름 (비우면 도장명) // https://blog.naver.com/아이디 (네이버 초안 입력에 필요)
  logoPath?: string; // 앱 폴더 assets 안으로 복사한 경로
  logoScale?: number; // 카드 로고 크기 % (60~200, 기본 120) · 2026-10-22 파일럿
  logoOnDobok?: boolean; // 카드 그림 속 아이 도복 왼쪽 가슴에 로고 (AI가 그려서 모양이 조금 다를 수 있음)
  dobokRefPath?: string; // 아이 도복 · 품띠 참고 사진 (그림에 그대로 따라 그리게)
  coachRefPath?: string; // 사범님 도복 참고 사진
  brand: { main: string; accent: string };
  tone: Tone;
  avoidWords: string; // 쉼표 구분
  nearbyAreas?: NearbyArea[]; // 주변 학교 · 아파트 · 역 (카카오 로컬 또는 직접 입력)
  updatedAt?: string;
}

export interface NearbyArea { name: string; kind: string; distance?: number; source: 'kakao' | 'manual' }

export interface Facts {
  activities: string;
  coachingPoints: string;
  scenes: string; // 관찰 장면. 없으면 비움 (만들지 않음)
  values: string; // 최대 2개 권장
  extra: string;
  photoNotes: string;
  // 글 종류별
  event?: { when: string; where: string; who: string; bring: string; apply: string };
  recruit?: { who: string; trial: string };
  growth?: { before: string; now: string; process: string };
}

export type KeywordSource = 'naver' | 'ai' | 'manual' | 'demo' | 'nearby';
export interface KeywordRow {
  keyword: string;
  source: KeywordSource;
  pc?: string; // API 원문 그대로 ("< 10" 같은 문자열 보존)
  mobile?: string;
  competition?: string;
  fetchedAt?: string;
  cached?: boolean;
}

export interface ArticleInput {
  kind: ArticleKind;
  audience: string;
  region: string;
  topic: string;
  facts: Facts;
  mainKeyword: string;
  subKeywords: string[]; // 최대 2
  tone: Tone;
  ending: string;
  includeProfile: { philosophy: boolean; classFeatures: boolean; credentials: boolean; contact: boolean; address: boolean };
  withCards: boolean;
  titlePrefix?: string; // 예: [보라매초 근처 태권도] — 코드가 제목 앞에 붙임 (AI에 동네 이름을 맡기지 않음)
}

export interface Section { id: string; heading?: string; paragraphs: string[] }
export interface ReviewFlag { code: string; message: string; sectionId?: string }
export interface ArticleDoc {
  titleCandidates: string[];
  sections: Section[];
  tags: string[];
  photoSuggestions: { afterSectionId: string; caption: string }[];
  reviewFlags: ReviewFlag[];
}

export type ArticleStatus = 'draft' | 'generating' | 'validating' | 'review' | 'ready';

export interface ArticleVersion {
  id: string;
  articleId: string;
  title: string; // 고른 제목
  doc: ArticleDoc;
  counts: { withSpaces: number; withoutSpaces: number };
  note: string; // 무엇으로 만든 버전인지 (생성 · 보완 · 사용자 편집 …)
  createdAt: string;
}

export interface ArticleSummary {
  id: string;
  kind: ArticleKind;
  topic: string;
  status: ArticleStatus;
  title: string;
  updatedAt: string;
  demo: boolean;
}

export interface Article {
  id: string;
  profileId: string;
  input: ArticleInput;
  keywords: KeywordRow[];
  currentVersionId: string | null;
  status: ArticleStatus;
  demo: boolean;
  createdAt: string;
  updatedAt: string;
}

export const CARD_STYLES = ['교육 잡지형', '따뜻한 일러스트', '깔끔한 정보형'] as const;
export type CardStyle = (typeof CARD_STYLES)[number];
export type CardSize = '1080x1350' | '1080x1080';
export type CardMode = 'ai' | 'template';

export interface CardCopy { title: string; sub: string; scene: string }
export interface Card {
  id: string;
  cardSetId: string;
  index: number; // 0..2
  copy: CardCopy;
  backgroundPath?: string;
  outputPath?: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  error?: string;
  overflow?: boolean;
  afterSectionId?: string;
}
export interface CardSet {
  id: string;
  articleVersionId: string;
  status: 'pending' | 'running' | 'done' | 'partial' | 'failed';
  style: { style: CardStyle; size: CardSize; mode: CardMode };
  cards: Card[];
}

export type JobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted';
export interface Job {
  id: string;
  type: 'article' | 'revise' | 'cards' | 'card' | 'naver' | 'keywords' | 'nearby';
  entityId: string;
  state: JobState;
  step: string;
  startedAt: string;
  updatedAt: string;
  errorCode?: string;
  message?: string;
}

export interface SettingsView {
  demo: boolean;
  textModel: string;
  imageModel: string;
  saveDir: string;
  typingSpeed: number;
  imageAutoRetry: number;
  monthlyImageLimit: number;
  secrets: { openai: string | null; naverApiKey: string | null; naverSecret: string | null; naverCustomer: string | null; kakao: string | null }; // 마스킹된 값만
  browser: { found: string | null };
  modelsCheckedAt: string;
}

export type RevisionKind = 'warmer' | 'professional' | 'less-promo' | 'titles' | 'paragraph';
