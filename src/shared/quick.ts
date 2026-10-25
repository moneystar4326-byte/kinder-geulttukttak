// 한 줄로 바로 쓰기: 메모로 글 종류 · 마무리 · 행사 일시 정하기 (2026-10-18)
// 전에는 "물음표 → 교육 정보, 아니면 수업 후기" 둘뿐이라 "10월 23~24일 1박 2일 합숙" 안내도 수업 후기가 됨
import { ENDINGS, type ArticleKind } from './types';

const QUESTION = /[?？]|방법|좋은\s*점|언제|몇\s*살|효과|차이/;
const RECRUIT = /모집|체험\s*(수업|신청)|신규\s*(등록|모집)|선착순|입관\s*안내/;
const EVENT = /합숙|캠프|행사|파티|레크|대회|발표회|운동회|체육대회|공개\s*수업|견학|소풍|나들이|수련회|특강|공연|승급\s*심사|승품|\d+\s*박\s*\d+\s*일|\d{1,2}\s*월\s*\d{1,2}\s*일/;
// 이미 지난 일을 적은 메모는 후기 ("대회 나가서 3등 했어요")
const PAST = /(했|갔|왔|받았|마쳤|끝났|나갔|다녀왔|진행했)(어요|습니다|다|어)|했던/;

export function quickKind(memo: string): ArticleKind {
  if (QUESTION.test(memo)) return '교육 정보';
  if (RECRUIT.test(memo)) return '모집 안내';
  if (PAST.test(memo)) return '수업 후기';
  if (EVENT.test(memo)) return '행사 안내';
  return '수업 후기';
}

// 행사 · 모집 글은 도장 홍보 대신 인사 · 상담 안내로 (행사 글 끝에 적응 기간 홍보가 붙던 문제)
export function quickEnding(kind: ArticleKind): string {
  if (kind === '행사 안내') return ENDINGS[3]; // 마무리 인사만
  if (kind === '모집 안내') return ENDINGS[1]; // 상담 안내로 마무리
  return ENDINGS[0];
}

// 메모에 적힌 날짜 · 기간을 그대로 (지어내지 않음): "2026년 10월 23일 금요일부터 24일 토요일"
export function quickWhen(memo: string): string {
  const m = memo.match(/(\d{4}\s*년\s*)?\d{1,2}\s*월\s*\d{1,2}\s*일(\s*\(?[월화수목금토일]요?일?\)?)?(\s*(부터|~|-)\s*(\d{1,2}\s*월\s*)?\d{1,2}\s*일(\s*\(?[월화수목금토일]요?일?\)?)?(까지)?)?/);
  const day = m ? m[0].trim() : '';
  const nights = memo.match(/\d+\s*박\s*\d+\s*일/)?.[0] ?? '';
  return [day, nights].filter(Boolean).join(' · ');
}
