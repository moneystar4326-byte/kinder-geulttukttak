// 카드뉴스 3장의 역할을 글 종류에 맞게 (태권 글뚝딱 2026-10-18: 행사 글에서 수업 장면을 찾다 다른 수업 이야기를 끌어오던 문제)
// 2026-10-27 사용자: 카드 아래 글이 "궁금하지요 · 살펴봐요"로 끝나 부실 → 고민만이 아니라 답까지, 수업은 무엇을 어떻게 했는지까지
import type { ArticleKind } from './types';

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

export const cardRoles = (kind?: ArticleKind | string) => CARD_ROLES[(kind as ArticleKind) in CARD_ROLES ? (kind as ArticleKind) : '수업 후기'];
