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
