// 도장 운영 정보를 칸으로 나눠 받기 (2026-10-18 사용자: 1버전처럼 입력 항목으로)
// 글을 쓸 때는 칸을 모아 한 덩어리(classFeatures)로 AI에 전달. 체크 안 한 서비스가 글에 나오면 경고 (1버전 strengths.ts 방식)
import { IND, isDaycare } from './industry';

export interface Strength { id: string; label: string; words?: RegExp }

const TKD_STRENGTHS: Strength[] = [
  { id: 'kinder', label: '유치부반' },
  { id: 'rope', label: '줄넘기 수업', words: /줄넘기\s?(수업|반|특강)/ },
  { id: 'pickup', label: '등하원 픽업', words: /픽업|등하원\s?(지원|서비스|도움)/ },
  { id: 'car', label: '차량 운행', words: /차량\s?운행|셔틀|통학\s?차량|통학차/ },
  { id: 'trial', label: '체험 수업', words: /체험\s?수업|무료\s?체험|1일\s?체험/ },
  { id: 'vacation', label: '방학 특강', words: /방학\s?특강|특강/ },
  { id: 'weekend', label: '주말반', words: /주말반|토요반|주말\s?수업/ },
  { id: 'late', label: '늦은 시간 수업 (맞벌이)', words: /맞벌이|늦은\s?시간\s?수업|야간반/ },
  { id: 'demo', label: '시범단', words: /시범단/ },
  { id: 'kukkiwon', label: '국기원 심사반', words: /국기원\s?(반|심사반)/ },
  { id: 'adapt', label: '등록 전 적응 기간' },
];

// 어린이집 초안 (2026-10-27 기획안 v0.2 · GPT 검토 뒤 바뀔 수 있음)
const DAYCARE_STRENGTHS: Strength[] = [
  { id: 'extended', label: '연장보육', words: /연장\s?보육|야간\s?연장|저녁\s?(보육|돌봄)/ },
  { id: 'infant', label: '영아 전담', words: /영아\s?전담/ },
  { id: 'inclusive', label: '장애아 통합', words: /장애아\s?(통합|전문)|통합\s?보육/ },
  { id: 'car', label: '차량 운행', words: /차량\s?운행|셔틀|통학\s?차량|등하원\s?차량/ },
  { id: 'meal', label: '자체 조리 급식', words: /자체\s?조리|직접\s?조리/ },
  { id: 'outdoor', label: '바깥놀이' },
  { id: 'forest', label: '숲 체험', words: /숲\s?(체험|놀이|교실)/ },
  { id: 'special', label: '특별활동', words: /특별\s?활동|외부\s?강사/ },
  { id: 'parent', label: '부모 참여 프로그램', words: /부모\s?(참여|참관)|참여\s?수업/ },
  { id: 'adapt', label: '입소 전 적응 기간' },
];

export const STRENGTHS: Strength[] = isDaycare ? DAYCARE_STRENGTHS : TKD_STRENGTHS;

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
  if (p.promoDay?.trim()) L.push(`${isDaycare ? '정기 행사' : '승급심사'}: ${p.promoDay.trim()}`);
  const s = strengthLabels(p);
  if (s.length) L.push(`우리 ${IND.place}에서 실제로 하는 것 (이것 말고 다른 서비스는 있다고 쓰지 말 것): ${s.join(', ')}`);
  if (p.otherFacts?.trim()) L.push(p.otherFacts.trim());
  return L.join('\n');
}

// 체크하지 않은 서비스 이야기가 글에 있으면 경고 (그 밖의 운영 사실에 적혀 있으면 괜찮음)
export function uncheckedMentions(text: string, p: OpsFields) {
  if (!p.strengths) return []; // 칸으로 나누기 전 자료는 검사하지 않음
  const facts = `${p.otherFacts ?? ''} ${p.classes ?? ''} ${p.strengthsEtc ?? ''}`;
  return STRENGTHS.filter((s) => s.words && !p.strengths!.includes(s.id) && s.words.test(text) && !s.words.test(facts))
    .map((s) => `${IND.place} 정보에서 체크하지 않은 "${s.label}" 이야기가 글에 있어요. 실제로 하는 게 아니면 빼고 올려 주세요.`);
}
