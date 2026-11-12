// 카드뉴스 3장의 역할을 글 종류에 맞게 (태권 글뚝딱 2026-10-18: 행사 글에서 수업 장면을 찾다 다른 수업 이야기를 끌어오던 문제)
// 2026-10-27 사용자: 카드 아래 글이 "궁금하지요 · 살펴봐요"로 끝나 부실 → 고민만이 아니라 답까지, 수업은 무엇을 어떻게 했는지까지
import type { ArticleBrief, ArticleKind, BriefPurpose } from './types';

export interface CardRole { label: string; guide: string }

// 2026-10-27 기획안 v0.4. 안쪽 이름: 수업 후기 = 놀이 · 활동 이야기, 모집 안내 = 입학 · 원아 모집 안내
export const CARD_ROLES: Record<ArticleKind, [CardRole, CardRole, CardRole]> = {
  '수업 후기': [
    { label: '학부모의 궁금함 · 답', guide: '학부모가 궁금해할 점 하나(아이가 유치원에서 무엇을 하며 지내는지)와 그에 대한 답' },
    { label: '오늘 한 놀이 장면', guide: '이 글에 적힌 오늘 한 놀이 · 활동 — 무엇을 어떻게 했는지' },
    { label: '놀이로 자라는 것', guide: '이 놀이로 아이들이 자라는 점 (글에 적힌 의미)' },
  ],
  '성장 이야기': [
    { label: '이전 모습', guide: '글에 적힌 이전 모습' },
    { label: '선생님이 도운 과정', guide: '글에 적힌, 선생님이 도운 과정 — 무엇을 어떻게 도왔는지' },
    { label: '지금 모습 · 메시지', guide: '글에 적힌 지금 모습과 메시지' },
  ],
  '행사 안내': [
    { label: '행사 소개 (언제 · 무엇)', guide: '행사 소개 — 언제 · 무엇을 하는지 (글에 적힌 날짜 · 행사 이름 그대로)' },
    { label: '하는 활동', guide: '행사에서 하는 활동 — 글에 적힌 구체적인 활동 · 먹거리 · 놀이를 살려서' },
    { label: '참여 안내 · 준비물', guide: '참여 안내 · 준비물 — 글에 있는 안내만' },
  ],
  '모집 안내': [
    { label: '학부모의 고민 · 답', guide: '유치원을 고르는 학부모의 고민 하나와 그에 대한 유치원의 답' },
    { label: '우리 유치원 하루 · 교육과정', guide: '글에 적힌 유치원의 하루 · 교육과정 · 방과후과정' },
    { label: '입학설명회 · 신청 방법', guide: '글에 적힌 입학설명회 · 신청 방법 (글에 없으면 "유치원으로 문의")' },
  ],
  '교육 정보': [
    { label: '학부모 질문 · 답', guide: '학부모 질문과 짧은 답' },
    { label: '유치원에서 하는 방식', guide: '글에 적힌, 유치원에서 실제로 하는 방식' },
    { label: '가정에서 도울 점', guide: '가정에서 도울 점 하나' },
  ],
};

// 자세히 쓰기 글은 고른 종류 대신 글 성격으로 (태권 글뚝딱 2.2.9, 2026-10-28 사용자: 결과 글인데 카드2가 재료에 없는 일반 설명
// — 재료에 없는 "지도 과정" 칸을 일반 설명으로 채우고, 가장 큰 결과는 카드에 없었음). 유치원판은 놀이 · 생활 말로
export const BRIEF_CARD_ROLES: Record<BriefPurpose, [CardRole, CardRole, CardRole]> = {
  '소식': [
    { label: '가장 큰 소식', guide: '있었던 일 중 가장 큰 소식 (날짜 · 행사 이름 · 반 이름은 글자 그대로)' },
    { label: '그 밖의 결과 · 장면', guide: '있었던 일 중 나머지 결과 · 장면' },
    { label: '의미', guide: '이 일이 아이들에게 어떤 자리였는지 — 있었던 일에 기대어' },
  ],
  '안내': [
    { label: '언제 · 무엇', guide: '있었던 일에 적힌 날짜 · 행사 이름 그대로, 무엇을 하는지' },
    { label: '하는 일', guide: '있었던 일에 적힌 활동 · 준비물' },
    { label: '참여 안내', guide: '있었던 일에 적힌 참여 방법 · 안내만' },
  ],
  '교육': [
    { label: '배운 것', guide: '있었던 일에 적힌 놀이 · 배운 내용' },
    { label: '실제 장면', guide: '있었던 일에 적힌 실제 놀이 · 활동 장면 — 무엇을 어떻게 했는지' },
    { label: '알아 두면 좋은 점', guide: '그 놀이 · 내용을 학부모가 이해하도록 돕는 설명 하나와 있었던 일' },
  ],
  '성장': [
    { label: '이전 모습', guide: '있었던 일에 적힌 이전 모습' },
    { label: '그사이 · 결과', guide: '있었던 일에 적힌 선생님이 도운 과정이나 결과 (도운 과정이 재료에 없으면 결과 · 장면으로, 지어내지 않는다)' },
    { label: '지금 모습', guide: '있었던 일에 적힌 지금 모습과 메시지' },
  ],
  '모집': CARD_ROLES['모집 안내'],
};

// 글 성격은 이야기를 적은 글(자세히 쓰기)에서만 씀 — 글 쓰기(articlePrompt)와 같은 기준
export const storyBrief = (input?: { facts?: { story?: string }; brief?: ArticleBrief }) => (input?.facts?.story?.trim() ? input.brief : undefined);

export const cardRoles = (kind?: ArticleKind | string, purpose?: BriefPurpose) =>
  purpose ? BRIEF_CARD_ROLES[purpose] : CARD_ROLES[(kind as ArticleKind) in CARD_ROLES ? (kind as ArticleKind) : '수업 후기'];

// ---------- 카드 장수 고르기 (태권 글뚝딱 2.4.0에서 옮김: 설정에서 1 · 2 · 3장, 그림 비용 아끼기) ----------
// 1장 = 글 전체를 담은 한 장 요약 카드 (3장 중 하나를 자르지 않음), 2장 = 첫 카드 + 마지막 카드, 3장 = 지금 그대로
// 카드 자리 번호(Card.index)는 0 · 1 · 2 그대로 써서 글 속 위치 규칙(도입 뒤 · 가운데 · 마무리 앞)을 바꾸지 않음
export type CardCount = 0 | 1 | 2 | 3;
export type CardCountSetting = 'auto' | 1 | 2 | 3;

export const SUMMARY_ROLES: Record<ArticleKind, CardRole> = {
  '수업 후기': { label: '오늘 놀이 한 장', guide: '이 글을 한 장에 — 오늘 어떤 놀이 · 활동을 했고, 아이들에게 무엇이 남았는지' },
  '성장 이야기': { label: '변화 한 장', guide: '이 글을 한 장에 — 글에 적힌 이전 모습에서 지금 모습으로의 변화' },
  '행사 안내': { label: '행사 한 장', guide: '이 글을 한 장에 — 언제 · 무엇을 하는 행사인지와 참여 안내 (글에 적힌 날짜 · 행사 이름 그대로)' },
  '모집 안내': { label: '모집 한 장', guide: '이 글을 한 장에 — 어떤 유치원인지, 입학설명회 · 신청 방법 (글에 적힌 것만, 없으면 "유치원으로 문의")' },
  '교육 정보': { label: '질문과 답 한 장', guide: '이 글을 한 장에 — 학부모 질문 하나와 유치원의 답' },
};
export const BRIEF_SUMMARY_ROLES: Record<BriefPurpose, CardRole> = {
  '소식': { label: '소식 한 장', guide: '이 글을 한 장에 — 가장 큰 소식(날짜 · 행사 이름 그대로)과 아이들에게 어떤 자리였는지' },
  '안내': { label: '안내 한 장', guide: '이 글을 한 장에 — 언제 · 무엇과 참여 안내 (적힌 것만)' },
  '교육': { label: '배운 것 한 장', guide: '이 글을 한 장에 — 놀이 · 배운 내용과 실제 장면' },
  '성장': { label: '변화 한 장', guide: '이 글을 한 장에 — 이전 모습에서 지금 모습으로의 변화' },
  '모집': SUMMARY_ROLES['모집 안내'],
};

// 글 종류에 맞게: 행사 · 모집 안내는 알릴 사실이 정해진 짧은 글이라 1장, 나머지는 3장
export const defaultCardCount = (kind?: string): 1 | 3 => (kind === '행사 안내' || kind === '모집 안내' ? 1 : 3);
export const resolveCardCount = (setting: CardCountSetting | undefined, kind?: string): 1 | 2 | 3 => (setting === 1 || setting === 2 || setting === 3 ? setting : defaultCardCount(kind));
// 글에 정한 장수 (예전 글은 cardCount 가 없음 → 카드를 골랐으면 3장)
export const cardCountOf = (input: { cardCount?: CardCount; withCards: boolean }): CardCount => input.cardCount ?? (input.withCards ? 3 : 0);
export const cardSlots = (count: number): number[] => (count >= 3 ? [0, 1, 2] : count === 2 ? [0, 2] : count === 1 ? [0] : []);

// 카드 묶음 크기(size)와 자리(slot)로 역할 — 1장 묶음이면 요약 카드
export function roleAt(kind: string | undefined, purpose: BriefPurpose | undefined, size: number, slot: number): CardRole {
  if (size === 1) return purpose ? BRIEF_SUMMARY_ROLES[purpose] : SUMMARY_ROLES[(kind as ArticleKind) in SUMMARY_ROLES ? (kind as ArticleKind) : '수업 후기'];
  return cardRoles(kind, purpose)[slot] ?? cardRoles(kind, purpose)[0];
}
// 보여 주는 카드 번호 (2장 묶음의 자리 0 · 2 → 카드 1 · 2). "카드 3번이 빠졌어요"처럼 헷갈리지 않게
export const cardNo = (indices: number[], index: number) => [...indices].sort((a, b) => a - b).indexOf(index) + 1;

// 그림 카드에서 그림 칸이 차지하는 높이 (화면의 카드 사진 맞춤도 같이 씀). 정사각형은 가로 그림이 덜 잘리게 조금 더 크게
export const SPLIT_IMAGE_RATIO = { '1080x1350': 0.6, '1080x1080': 0.56 } as const;
