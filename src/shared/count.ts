// 글자 수 세기 (기획서 6.3). 화면 · 검증 · 테스트가 모두 이 함수만 씀.
// NFC 정규화 → 사용자가 한 글자로 보는 단위(grapheme)로 셈. 이모지 👍🏽 · 한글 조합 문자도 1자.
// 공백 포함: 줄바꿈과 폭 없는 문자만 빼고 셈 / 공백 제외: Unicode 공백 전부 뺌
import type { ArticleDoc } from './types';

// 특수 문자는 코드 번호로 만듦 (소스에 원문으로 넣으면 줄바꿈 문자가 정규식을 깨뜨림). ZWJ(200D)는 이모지 묶음이라 지우지 않음
const ch = (...codes: number[]) => String.fromCharCode(...codes);
const ZERO_WIDTH = new RegExp(`[${ch(0x200b, 0x2060, 0xfeff)}]`, 'g');
const LINE_BREAK = new RegExp(String.raw`[\r\n` + ch(0x2028, 0x2029, 0x85) + ']', 'g');
const ANY_SPACE = new RegExp(String.raw`[\s` + ch(0xa0, 0x3000) + ']', 'gu');

const seg = new Intl.Segmenter('ko', { granularity: 'grapheme' });
function graphemes(s: string) {
  let n = 0;
  for (const _ of seg.segment(s)) n++;
  return n;
}

export function countChars(text: string) {
  const t = text.normalize('NFC').replace(ZERO_WIDTH, '');
  return {
    withSpaces: graphemes(t.replace(LINE_BREAK, '')),
    withoutSpaces: graphemes(t.replace(ANY_SPACE, '')),
  };
}

// 계수 대상: 본문 소제목 + 문단 (제목 후보 · 태그 · 카드 문구 · 편집 안내 제외)
export function bodyText(doc: Pick<ArticleDoc, 'sections'>) {
  return doc.sections.flatMap((s) => [s.heading ?? '', ...s.paragraphs]).filter((x) => x.trim()).join('\n');
}

export function countDoc(doc: Pick<ArticleDoc, 'sections'>) {
  return countChars(bodyText(doc));
}

// 최소 분량 기준은 공백 제외 (기획서 15장 수동 인수 4번)
export const MIN_CHARS = 1500;
export const TARGET_RANGE = [1800, 2200] as const;

// 2026-10-18 사용자: 짧은 행사 메모로 1,500자를 채우느라 "아이에게 물어보세요"가 반복되고 인사 섹션이 따로 붙음
// → 행사 · 모집 안내는 알릴 사실이 정해져 있어 1,000자 (목표 1,200~1,600)
export const SHORT_KINDS = ['행사 안내', '모집 안내'];
export const minCharsFor = (kind?: string) => (kind && SHORT_KINDS.includes(kind) ? 1000 : MIN_CHARS);
export const targetRangeFor = (kind?: string): readonly [number, number] => (kind && SHORT_KINDS.includes(kind) ? [1200, 1600] : TARGET_RANGE);
