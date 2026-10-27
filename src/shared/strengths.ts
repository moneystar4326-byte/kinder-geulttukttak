// 유치원 운영 정보를 칸으로 나눠 받기 (태권 글뚝딱 2026-10-18 방식)
// 글을 쓸 때는 칸을 모아 한 덩어리(classFeatures)로 AI에 전달. 체크 안 한 서비스가 글에 나오면 경고 (1버전 strengths.ts 방식)
import { APP } from './kinder';

export interface Strength { id: string; label: string; words?: RegExp }

// 유치원 초안 (2026-10-27 기획안 v0.4 7장 · GPT 검토 뒤 바뀔 수 있음)
export const STRENGTHS: Strength[] = [
  { id: 'afterschool', label: '방과후과정', words: /방과\s?후\s?과정|종일반|오후\s?돌봄/ },
  { id: 'car', label: '통학 차량', words: /차량\s?운행|셔틀|통학\s?(차량|버스)|등하원\s?차량/ },
  { id: 'meal', label: '자체 조리 급식', words: /자체\s?조리|직접\s?조리/ },
  { id: 'outdoor', label: '바깥놀이' },
  { id: 'forest', label: '숲 체험', words: /숲\s?(체험|놀이|교실)/ },
  { id: 'special', label: '특성화 활동', words: /특성화\s?(활동|프로그램)|외부\s?강사/ },
  { id: 'parent', label: '부모 참여 프로그램', words: /부모\s?(참여|참관)|참여\s?수업/ },
  { id: 'adapt', label: '입학 전 적응 기간' },
  { id: 'inclusive', label: '특수학급(통합)', words: /특수\s?학급|통합\s?(학급|교육)/ },
  { id: 'vacation', label: '방학 중 돌봄', words: /방학\s?(중\s?)?(돌봄|운영)/ },
];

export interface OpsFields { hours?: string; classes?: string; promoDay?: string; strengths?: string[]; strengthsEtc?: string; otherFacts?: string }

export function strengthLabels(p: OpsFields) {
  const picked = STRENGTHS.filter((s) => p.strengths?.includes(s.id)).map((s) => s.label);
  const etc = String(p.strengthsEtc ?? '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  return [...new Set([...picked, ...etc])];
}

// 칸 → AI에 넘길 "실제 수업 특징" 한 덩어리
export function composeClassFeatures(p: OpsFields) {
  const L: string[] = [];
  if (p.hours?.trim()) L.push(`운영 시간: ${p.hours.trim()}`);
  if (p.classes?.trim()) L.push(`반 구성: ${p.classes.trim()}`);
  if (p.promoDay?.trim()) L.push(`정기 행사: ${p.promoDay.trim()}`);
  const s = strengthLabels(p);
  if (s.length) L.push(`우리 ${APP.place}에서 실제로 하는 것 (이것 말고 다른 서비스는 있다고 쓰지 말 것): ${s.join(', ')}`);
  if (p.otherFacts?.trim()) L.push(p.otherFacts.trim());
  return L.join('\n');
}

// 체크하지 않은 서비스 이야기가 글에 있으면 경고 (그 밖의 운영 사실에 적혀 있으면 괜찮음)
export function uncheckedMentions(text: string, p: OpsFields) {
  if (!p.strengths) return []; // 칸으로 나누기 전 자료는 검사하지 않음
  const facts = `${p.otherFacts ?? ''} ${p.classes ?? ''} ${p.strengthsEtc ?? ''}`;
  return STRENGTHS.filter((s) => s.words && !p.strengths!.includes(s.id) && s.words.test(text) && !s.words.test(facts))
    .map((s) => `${APP.place} 정보에서 체크하지 않은 "${s.label}" 이야기가 글에 있어요. 실제로 하는 게 아니면 빼고 올려 주세요.`);
}
