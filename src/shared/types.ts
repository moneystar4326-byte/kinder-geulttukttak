// 앱 전체가 같이 쓰는 데이터 모양
import type { Writer } from './kinder';

export const ARTICLE_KINDS = ['수업 후기', '성장 이야기', '행사 안내', '모집 안내', '교육 정보'] as const;
export type ArticleKind = (typeof ARTICLE_KINDS)[number];

// 유치원은 늘 만 3~5세 (고르지 않음 — 예전 자료 · 글 재료 모양을 그대로 두려고 값만 하나로)
export const AUDIENCES: readonly string[] = ['유아 (만 3~5세)'];
export const TONES = ['따뜻한 설명형', '전문적인 교육형'] as const;
export type Tone = (typeof TONES)[number];
// 순서가 뜻: 0 소개 · 1 상담 · 2 가정 · 3 인사 (quick.ts 가 번호로 고름)
export const ENDINGS: readonly string[] = ['유치원 소개로 마무리', '입학 상담 안내로 마무리', '가정에서 해 볼 것으로 마무리', '마무리 인사만'];

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
  promoDay?: string; // 정기 행사 (생일잔치 등)
  strengths?: string[]; // 우리 유치원 강점 (체크한 것만 글에 씀)
  strengthsEtc?: string; // 그 밖의 강점 (쉼표)
  otherFacts?: string; // 그 밖의 운영 사실
  credentials?: string; // 확인 가능한 내용만
  contact?: string;
  consultLink?: string;
  blogUrl?: string;
  mapName?: string; // 네이버 지도에서 검색할 유치원 이름 (비우면 유치원 이름) // https://blog.naver.com/아이디 (네이버 초안 입력에 필요)
  logoPath?: string; // 앱 폴더 assets 안으로 복사한 경로
  logoScale?: number; // 카드 로고 크기 % (60~200, 기본 120) · 2026-10-22 파일럿
  logoOnDobok?: boolean; // 카드 그림 속 아이 원복 왼쪽 가슴에 로고 (원복 사진이 있을 때만) (AI가 그려서 모양이 조금 다를 수 있음)
  dobokRefPath?: string; // 원복 참고 사진 (그림에 그대로 따라 그리게) — 칸 이름은 태권 글뚝딱 때 그대로
  coachRefPath?: string; // 교실 참고 사진 — 칸 이름은 태권 글뚝딱 때 그대로
  brand: { main: string; accent: string };
  tone: Tone;
  avoidWords: string; // 쉼표 구분
  nearbyAreas?: NearbyArea[]; // 주변 학교 · 아파트 · 역 (카카오 로컬 또는 직접 입력)
  facilityType?: string; // 유치원 유형 (국공립(단설) · 국공립(병설) · 사립 …)
  writers?: Writer[]; // 글쓴이 (원장님 · 선생님)
  updatedAt?: string;
}

export interface NearbyArea { name: string; kind: string; distance?: number; source: 'kakao' | 'manual' }

export interface Facts {
  story?: string; // 자세히 쓰기 "어떤 일이 있었나요?" — 원장님 · 선생님이 쓴 이야기 그대로 (2026-10-28)
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
  keywordPlan?: KeywordPlanItem[]; // 자세히 쓰기 검색어 확인: 고른 검색어와 넣을 문장 예시 (있으면 이대로 씀)
  titlePrefix?: string; // 예: [롯데낙천대아파트 유치원] — 코드가 제목 앞에 붙임 (AI에 동네 이름을 맡기지 않음)
  writer?: Writer; // 이 글을 쓰는 사람. 고른 때의 이름 · 반을 그대로 담음
  writerSign?: boolean; // 글 끝에 글쓴이 한 줄 (코드가 붙임)
  brief?: ArticleBrief; // 자세히 쓰기: 재료를 읽고 정한 글 성격 · 사실 · 주제 설명 글감 (2026-10-28)
}

// 짧은 재료로도 일반론 없이 쓰기 (태권 글뚝딱 2026-10-28, GPT 검토 반영): 글 성격을 먼저 정하고, 일반 설명은 미리 만든 글감에서만
export const BRIEF_PURPOSES = ['소식', '안내', '교육', '성장', '모집'] as const;
export type BriefPurpose = (typeof BRIEF_PURPOSES)[number];
export interface ArticleBrief {
  purpose: BriefPurpose;
  note: string; // 원장님 · 선생님께 보여 줄 한 줄 ("운동회 이야기를 전하는 소식 글로 준비했어요")
  facts: { text: string; quote: string; unclear: boolean }[]; // 재료를 나눈 사실 (unclear = 숫자가 어디에 붙는지 애매)
  check?: { quote: string; question: string }; // 애매한 것 하나만 확인
  answer?: '맞아요' | '빼기'; // 원장님 · 선생님 답. 답이 없으면 애매한 숫자는 글에 쓰지 않음
  notes: string[]; // 주제 설명 글감 (우리 아이들 이야기가 아닌 일반 지식)
  exclude: string[]; // 이 글에 넣지 않을 군더더기
  topicGap?: string; // 주제에 담긴 이유 · 주장이 재료에 없을 때 원장님 · 선생님께 물을 말 (2026-10-28: 주제를 말없이 빼던 것)
  topicAnswer?: string; // 그 물음에 원장님 · 선생님이 적은 한두 줄 (있으면 사실로 씀)
  asks?: { question: string; answer?: string }[]; // 재료가 짧을 때 더 받을 물음 2~3개 (답은 사실로 씀, 비우면 그대로)
}

export interface KeywordPlanItem { role: '주요' | '보조'; keyword: string; sentence: string; why?: string }

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
