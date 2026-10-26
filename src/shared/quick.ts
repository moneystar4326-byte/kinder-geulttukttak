// 한 줄로 바로 쓰기: 메모로 글 종류 · 마무리 · 행사 일시 정하기 (2026-10-18)
// 전에는 "물음표 → 교육 정보, 아니면 수업 후기" 둘뿐이라 "10월 23~24일 1박 2일 합숙" 안내도 수업 후기가 됨
import { ENDINGS, type ArticleKind } from './types';

const QUESTION = /[?？]|방법|좋은\s*점|언제|몇\s*살|효과|차이/;
const RECRUIT = /모집|입소\s*(안내|상담|신청|대기)|대기\s*신청|신입\s*원아|원아\s*모집|선착순/;
const EVENT = /행사|파티|생일\s*잔치|재롱\s*잔치|발표회|운동회|공개\s*수업|부모\s*참여|견학|소풍|나들이|현장\s*학습|공연|졸업식|수료식|입학식|김장|할로윈|핼러윈|크리스마스|\d+\s*박\s*\d+\s*일|\d{1,2}\s*월\s*\d{1,2}\s*일/;
// 이미 지난 일을 적은 메모는 후기 ("대회 나가서 3등 했어요")
// 2026-10-27: "촛불을 불었어요 · 왕관을 만들었어요"처럼 했/갔 말고 다른 지난 말도 (았 · 었 · 였 + 어요 · 습니다 · 던)
const PAST = /(했|갔|왔|났|봤|줬|았|었|였)(어요|습니다|던)|(했|갔|왔|받았|마쳤|끝났|나갔|다녀왔|진행했)(다|어)(?![가-힣])/;

export function quickKind(memo: string): ArticleKind {
  if (QUESTION.test(memo)) return '교육 정보';
  if (RECRUIT.test(memo)) return '모집 안내';
  if (PAST.test(memo)) return '수업 후기';
  if (EVENT.test(memo)) return '행사 안내';
  return '수업 후기';
}

// 행사 · 모집 글은 어린이집 홍보 대신 인사 · 상담 안내로 (행사 글 끝에 적응 기간 홍보가 붙던 문제)
// 어린이집 선생님 글은 어린이집 소개 대신 가정에서 해 볼 것으로 (기획안 v0.2 4장)
export function quickEnding(kind: ArticleKind, teacher = false): string {
  if (kind === '행사 안내') return ENDINGS[3]; // 마무리 인사만
  if (kind === '모집 안내') return ENDINGS[1]; // 상담 안내로 마무리
  return teacher ? ENDINGS[2] : ENDINGS[0];
}

// 메모에 적힌 날짜 · 기간을 그대로 (지어내지 않음): "2026년 10월 23일 금요일부터 24일 토요일"
export function quickWhen(memo: string): string {
  const m = memo.match(/(\d{4}\s*년\s*)?\d{1,2}\s*월\s*\d{1,2}\s*일(\s*\(?[월화수목금토일]요?일?\)?)?(\s*(부터|~|-)\s*(\d{1,2}\s*월\s*)?\d{1,2}\s*일(\s*\(?[월화수목금토일]요?일?\)?)?(까지)?)?/);
  const day = m ? m[0].trim() : '';
  const nights = memo.match(/\d+\s*박\s*\d+\s*일/)?.[0] ?? '';
  return [day, nights].filter(Boolean).join(' · ');
}
