// 카드뉴스 3장의 역할을 글 종류에 맞게 (2026-10-18 사용자: 합숙 글인데 카드 2가 "매일 수업에서 만나는 줄넘기")
// 전에는 늘 "고민 / 실제 수업 장면 / 교육 메시지"라 행사 글에서 수업 장면을 찾다 도장 정보(줄넘기)를 끌어옴
import type { ArticleKind } from './types';

export interface CardRole { label: string; guide: string }

export const CARD_ROLES: Record<ArticleKind, [CardRole, CardRole, CardRole]> = {
  '수업 후기': [
    { label: '학부모의 고민 · 질문', guide: '학부모의 관심(고민 · 질문)' },
    { label: '실제 수업 장면', guide: '이 글에 적힌 실제 수업 장면' },
    { label: '교육 메시지', guide: '이 글의 교육 메시지' },
  ],
  '성장 이야기': [
    { label: '이전 모습', guide: '글에 적힌 이전 모습' },
    { label: '지도 과정', guide: '글에 적힌 지도 과정' },
    { label: '지금 모습 · 메시지', guide: '글에 적힌 지금 모습과 메시지' },
  ],
  '행사 안내': [
    { label: '행사 소개 (언제 · 무엇)', guide: '행사 소개 — 언제 · 무엇을 하는지 (글에 적힌 날짜 · 행사 이름 그대로)' },
    { label: '하는 활동', guide: '행사에서 하는 활동 — 글에 적힌 구체적인 활동 · 먹거리 · 놀이를 살려서' },
    { label: '참여 안내 · 의미', guide: '참여 안내나 행사의 의미 — 글에 있는 안내만' },
  ],
  '모집 안내': [
    { label: '학부모의 고민', guide: '학부모의 고민' },
    { label: '수업 방식', guide: '글에 적힌 수업 방식' },
    { label: '체험 · 상담 방법', guide: '글에 적힌 체험 · 상담 방법' },
  ],
  '교육 정보': [
    { label: '학부모 질문', guide: '학부모 질문' },
    { label: '도장에서 하는 방식', guide: '글에 적힌, 도장에서 실제로 하는 방식' },
    { label: '가정에서 도울 점', guide: '가정에서 도울 점' },
  ],
};

export const cardRoles = (kind?: ArticleKind | string) => CARD_ROLES[(kind as ArticleKind) in CARD_ROLES ? (kind as ArticleKind) : '수업 후기'];
