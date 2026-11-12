// 블로그 글 모양 (2026-10-18 사용자: 1버전처럼 이모지 · 큰 소제목 · 생동감 · 태그)
// 1버전(태권 글뚝딱 shared/layout.ts · lines.ts)의 규칙을 옮김
import type { ArticleDoc } from './types';

export const HEADING_EMOJI = ['🌱', '💡', '📌', '🙌', '✨', '🧸', '🗓️'];

// 앞에 붙은 이모지 · 기호 떼기 (AI가 붙인 것을 지우고 코드가 같은 모양으로 다시 붙임)
export const stripLeadEmoji = (s: string) => s.replace(/^[\p{Extended_Pictographic}\u{FE0F}\u{200D}\s■□●○▶︎▷-]+/u, '').trim();

// 소제목마다 이모지 하나 (순서대로). 이미 같은 모양이면 그대로
export function decorateHeadings(doc: ArticleDoc): ArticleDoc {
  let n = 0;
  return {
    ...doc,
    sections: doc.sections.map((s) => {
      if (!s.heading || /^마무리/.test(stripLeadEmoji(s.heading))) return s.heading ? { ...s, heading: stripLeadEmoji(s.heading) } : s;
      const h = `${HEADING_EMOJI[n++ % HEADING_EMOJI.length]} ${stripLeadEmoji(s.heading)}`;
      return { ...s, heading: h };
    }),
  };
}

// 휴대폰 · 가운데 정렬에서 읽기 좋게 긴 줄을 20자 안팎으로 끊기 (끝에 한 단어만 남지 않게 고르게)
// 태권 글뚝딱 2.7.1에서 옮김: 28자는 폭 360 휴대폰에서 한 번 더 접혀 짧은 조각이 혼자 남음
const MAX = 20;
const LINE_LIMIT = 270; // 글자 크기 16 기준 예상 폭 (폭 320 휴대폰의 본문 칸 280 안쪽). 넘으면 한 번 더 나눔
const HEADING_MAX = 13; // 소제목은 글자 크기 24
const HEADING_LIMIT = 185; // 16 기준 폭. 24로 키우면 1.5배
const widthOf = (s: string) => [...s].reduce((w, c) => w + (c === ' ' ? 5 : /[\x21-\x7e]/.test(c) ? 9 : /\p{Extended_Pictographic}/u.test(c) ? 20 : /[\u{FE0F}\u{200D}]/u.test(c) ? 0 : 15), 0);
// 2026-11-02 사용자: "한 / 가지", "이어 / 가기", "음식뿐 / 아니라"처럼 말 묶음 사이에서 끊겨 어색함 → 그런 자리는 피하고 쉼표 · 이어 주는 말 뒤를 먼저 고름
const BAD_END = /(^|\s)(한|두|세|네|몇|이|그|저|이런|그런|저런|어떤|모든|각|첫|새|온|여러|어느|무슨|및|또는|더|잘|못|안|꼭|좀|아주|매우|너무|참|다시|이어|서|세어|들어|알아|찾아|돌아)$/;
const BAD_START = /^(수|것|거|걸|때|줄|등|뿐|중|분|번|개|명|살|가지|있어요|있습니다|있지요|있는|있을|없어요|없는|않아요|않고|않는|않으려|않습니다|같아요|같은|봐요|봐|보세요|보아요|볼|보면|주세요|줘요|드려요|드립니다|주시면|주시기|싶어요|싶은|아니라|아니에요|아닌|갈|가요|가기|가는|가며|간|돼요|되는|된|하는|하기|해요|듯|대로|만큼|위해|위한|바랍니다|보는|보고|보며|본|주는|주고|주면|주면서|주며|준|뒤|뒤에|전에|후에|앞에|동안|때문에)(?=[\s.,!?]|$)/;
const GOOD_END = /(,|고|며|면|서|니까|는데|지만|도록)$/;
const breakCost = (s: string, i: number, target: number) =>
  Math.abs(i - target) + (BAD_END.test(s.slice(0, i)) || BAD_START.test(s.slice(i + 1)) ? 20 : 0) - (GOOD_END.test(s.slice(0, i)) ? 3 : 0);
function wrap(sentence: string, max = MAX, limit = LINE_LIMIT): string[] {
  const s = sentence.trim();
  const fits = widthOf(s) <= limit;
  const n = Math.max(Math.ceil([...s].length / max), fits ? 1 : 2);
  if (n <= 1 || !s.includes(' ')) return [s];
  const out: string[] = [];
  let from = 0;
  for (let k = 1; k < n; k++) {
    const target = Math.round((s.length * k) / n);
    let best = -1;
    for (let i = from + 1; i < s.length - 1; i++) if (s[i] === ' ' && (best < 0 || breakCost(s, i, target) < breakCost(s, best, target))) best = i;
    if (best < 0) break;
    out.push(s.slice(from, best).trim());
    from = best + 1;
  }
  out.push(s.slice(from).trim());
  return out.filter(Boolean).flatMap((x) => (x !== s && widthOf(x) > limit ? wrap(x, max, limit) : [x]));
}
export function shortLines(text: string) {
  return text.split('\n').flatMap((line) => {
    const t = line.trim();
    if (([...t].length <= MAX && widthOf(t) <= LINE_LIMIT) || /^\[|^#|^\p{Extended_Pictographic}/u.test(t)) return [line];
    // 문장 끝 이모지("…주세요. 😊")가 혼자 한 줄이 되지 않게 앞 문장에 붙임
    const parts = t.split(/(?<=[.!?])\s+/).reduce<string[]>((acc, x) => {
      if (acc.length && /^[\p{Extended_Pictographic}\u{FE0F}\u{200D}\s]+$/u.test(x)) acc[acc.length - 1] += ` ${x.trim()}`;
      else acc.push(x);
      return acc;
    }, []);
    return parts.flatMap((x) => wrap(x));
  }).join('\n');
}

// 문단을 휴대폰 화면에 맞는 덩어리로: 2줄 이상이면 문장이 끝나는 곳에서 나누고, 길어도 4줄을 넘기지 않음
const SENTENCE_END = /(?:[.!?…]|[요다])[\s\p{Extended_Pictographic}\u{FE0F}\u{200D}]*$/u;
export function mobileParagraphs(text: string): string[] {
  const chunks: string[][] = [];
  let cur: string[] = [];
  const flush = () => { if (cur.length) chunks.push(cur); cur = []; };
  for (const line of shortLines(text).split('\n')) {
    if (!line.trim()) { flush(); continue; }
    cur.push(line);
    if (cur.length >= 4 || (cur.length >= 2 && SENTENCE_END.test(line))) flush();
  }
  if (cur.length === 1 && chunks.length && chunks[chunks.length - 1].length < 4) chunks[chunks.length - 1].push(cur[0]); // 한 줄만 혼자 남지 않게
  else flush();
  return chunks.map((c) => c.join('\n'));
}

// 소제목 줄 나누기. 글자 크기 24에서 넘치지 않게 (앞 이모지는 첫 줄에)
export const headingLines = (heading: string) => wrap(heading, HEADING_MAX, HEADING_LIMIT);

export const tagLine = (tags: string[]) => tags.map((t) => `#${t.replace(/^#/, '').replace(/\s/g, '')}`).filter((t) => t.length > 1).join(' ');
