// 어느 글에나 들어가는 태도 · 다짐 말이 몰렸는지 세기 (2026-11-02 요요유치원 추석 글: "살펴" 11번)
// 글 다듬기 지시와 확인 메모가 같이 씀. 한 글에 세 번까지는 괜찮게 봄
import { bodyText } from './count';
import type { ArticleDoc } from './types';

const WATCH: [string, RegExp][] = [
  ['살펴 · 살피', /살펴|살피/g],
  ['지켜보', /지켜보|지켜봐/g],
  ['눈길', /눈길/g],
  ['저마다', /저마다/g],
  ['소중히', /소중히/g],
  ['비교하지', /비교하지/g],
  ['마음을 두', /마음을\s*두|마음에\s*두/g],
  ['관심을 두', /관심을\s*두/g],
  ['~기보다', /기보다/g],
  ['~려 해요', /려\s*해요/g],
];
export const OVERUSED_MAX = 3;

export function overusedWords(doc: Pick<ArticleDoc, 'sections'>) {
  const body = bodyText(doc);
  return WATCH.map(([word, re]) => ({ word, count: body.match(re)?.length ?? 0 })).filter((x) => x.count > OVERUSED_MAX);
}

// 지시문에 넣는 한 줄 (몰린 말이 없으면 빈 문자열)
export const overusedLine = (doc: Pick<ArticleDoc, 'sections'>) => {
  const list = overusedWords(doc);
  return list.length ? `\n[꼭 줄일 말 — 프로그램이 세어 봤다] ${list.map((x) => `"${x.word}" ${x.count}번`).join(', ')}. 각각 ${OVERUSED_MAX}번 아래로 줄인다. 다른 말로 바꾸기만 하지 말고, 이 글의 활동을 구체적으로 말하는 문장으로 고치거나 지운다.` : '';
};

// 앞 내용을 정리만 하는 문장 (2026-11-05 시험 글: "~함께 있었던 김장 체험이에요", "~마련되는 자리예요")
const SUMMARY = /(했던|있었던|하는|되는|이어지는|담긴)\s*(체험|활동|자리|시간|구성|이야기|행사)(이에요|예요|이랍니다|랍니다)|빼놓을 수 없|[가-힣]는\s*(일이에요|때예요)|해\s*보는\s*경험이에요|만나는\s*(하원\s*)?시간이에요/;

// 글 말투 점검 (2026-11-05 사용자가 고른 글: 질문 2~3개 + 어미 섞기). 질문 수 · "~했어요" 연속만 셈
// minQ: 사진 글은 1개 (2026-11-16 백테스트: 2개를 채우려고 "낙엽으로 무엇을 만들었을까요?"처럼 장면 칸에 답이 있는 질문을 만듦)
export function styleIssues(doc: Pick<ArticleDoc, 'sections'>, kind?: string, minQ = 2) {
  const issues: string[] = [];
  const body = bodyText(doc);
  const questions = (body.match(/[?？]/g) ?? []).length;
  if (kind !== '교육 정보' && questions < minQ) issues.push(`질문이 ${questions}개예요. 재료로 답할 수 있는 질문을 ${minQ}~3개로 맞춘다.`);
  if (questions > 3) issues.push(`질문이 ${questions}개예요. 3개 이하로 줄인다.`);
  let run = 0;
  let longest = 0;
  for (const x of doc.sections.flatMap((s) => s.paragraphs).join(' ').split(/(?<=[.!?])\s+/)) {
    run = /했어요[.!\s\p{Extended_Pictographic}\u{FE0F}]*$/u.test(x.trim()) ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  if (longest >= 3) issues.push(`"~했어요"가 ${longest}번 이어져요. 2번 아래로 바꾼다.`);
  const sentences = doc.sections.flatMap((s) => s.paragraphs).join(' ').split(/(?<=[.!?])\s+/);
  const long = sentences.filter((x) => x.replace(/\s/g, '').length > 55);
  if (long.length) issues.push(`너무 긴 문장을 둘로 나눈다: ${long.slice(0, 3).map((x) => `"${x.trim()}"`).join(' ')}`);
  const summary = sentences.filter((x) => SUMMARY.test(x));
  if (summary.length) issues.push(`정리만 하는 문장을 지우거나 구체적으로 고친다: ${summary.slice(0, 3).map((x) => `"${x.trim()}"`).join(' ')}`);
  const line = overusedLine(doc);
  if (line) issues.push(line.replace(/^\n/, ''));
  return issues;
}
