import type { z } from 'zod';
import { APP } from '../../shared/kinder';

// 입력 검사 오류를 사용자 문장으로 (2026-10-29 점검: 첫인사 301자에 "Too big: expected string to have <=300 characters"가 그대로 보임)
const FIELD_NAMES: Record<string, string> = {
  name: APP.nameLabel, region: '소재 지역', address: '상세 주소', mapName: '네이버 지도 검색 이름', blogUrl: '네이버 블로그 주소', philosophy: APP.philLabel,
  hours: '운영 시간', classes: '반 구성', promoDay: '정기 행사', strengthsEtc: '그 밖의 강점', otherFacts: '그 밖의 운영 사실', credentials: '원장 · 교사 경력 · 자격',
  avoidWords: '피할 표현', contact: '연락처', consultLink: '상담 링크', greeting: '첫인사', closing: '끝인사', className: '반 이름', topic: '주제', story: '있었던 일',
};
export function issueMessage(issue: z.ZodIssue | undefined): string {
  if (!issue) return '입력이 올바르지 않아요';
  if (/[가-힣]/.test(issue.message)) return issue.message;
  const key = [...issue.path].reverse().find((k) => typeof k === 'string') as string | undefined;
  const label = (key && FIELD_NAMES[key]) || '입력한 내용';
  const max = (issue as { maximum?: number | bigint }).maximum;
  if (issue.code === 'too_big' && max != null) return `"${label}" 칸은 ${Number(max).toLocaleString('ko-KR')}자까지 적을 수 있어요. 조금 줄여 주세요.`;
  return `"${label}" 칸의 내용을 확인해 주세요.`;
}
