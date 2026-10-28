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
