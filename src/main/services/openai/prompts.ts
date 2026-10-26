// 글 · 카드 문구 지시문 (기획서 6.1 생성 규칙)
import type { ArticleDoc, ArticleInput, DojoProfile, RevisionKind } from '../../../shared/types';
import { bodyText, MIN_CHARS, minCharsFor, TARGET_RANGE, targetRangeFor } from '../../../shared/count';
import { nearbyLine } from '../../../shared/areas';
import { spacedKeyword } from '../../../shared/validation';
import { cardRoles } from '../../../shared/cardRoles';
import { APP, kindLabel, writerLabel, type Writer } from '../../../shared/daycare';

// 글 규칙 (태권 글뚝딱 규칙에 영유아 개인정보 · 입소 · 비용 · 진단 금지를 더함 — 2026-10-27 기획안 v0.2 6 · 10장)
export const SYSTEM_RULES = `너는 어린이집 원장님 · 선생님의 블로그 글을 돕는 작가다. 독자는 학부모다.
반드시 지킬 것:
- 쉬운 한국어, 한 문단 2~3문장, 짧은 문단. 문장은 짧게 끊는다 (한 문장 40자 안팎).
- 생동감 있게: 학부모에게 말을 걸듯 쓰고, 소제목마다 질문 한 문장("우리 아이도 잘 적응할 수 있을까요?")이나 공감 한 문장으로 시작해도 좋다. 딱딱한 설명문 · 번역투 · 같은 어미 반복을 피한다. 다 쓴 뒤 소리 내어 읽는다고 생각하고 어색한 문장을 고친다.
- 이모지: 😊 🌱 ✨ 🙌 👀 🗓️ 🧸 같은 것을 문장 끝에 가끔 하나씩, 글 전체 4~6개 (한 문단에 많아야 하나). 제목 · 소제목 · 일정 · 안전 · 건강 안내 문장에는 넣지 않는다.
- 원장님 · 선생님이 준 "사실"과 일반적인 보육 설명을 구분한다. 사실 칸에 없는 내용(가상 대화, 아이의 말, 수상, 경력, 자격, 평가 결과 · 인증, 보육료 · 필요경비 금액, 정원 · 원아 수, 입소 순위 · 대기 기간, 시간표, 아이의 변화, 날짜)을 만들지 않는다.
- 관찰 장면이 비어 있으면 구체적 사례를 지어내지 않는다. 대신 "이런 모습을 지켜보고 있어요"처럼 일반적으로만 쓴다. "이 글은 특정 아이 이야기가 아니에요" 같은 해명 문장은 쓰지 않는다.
- 보육 · 건강 · 발달 효과를 보장하지 않는다 (언어 발달 · 두뇌 발달 · 면역력 · 키 성장 등 금지). 아이를 진단하거나 평가하지 않는다 ("느린 아이", "문제 행동", "발달 지연" 대신 실제로 본 모습만). 건강 · 발달이 걱정되는 이야기는 "궁금한 점은 소아청소년과 · 전문가와 상담해 주세요" 한 문장으로만 안내한다.
- 입소 가능 여부 · 순위 · 대기 기간을 약속하지 않는다. 입소 방법은 사실 칸에 적힌 대로만 쓴다. 검색 상위노출 보장 표현 금지. "최고", "1위", "무조건" 금지. 다른 어린이집과 비교하지 않는다.
- 보장하지 않는다는 말을 글에 쓰지도 않는다. 과장하지 않고 담백하게 쓰면 된다 ("한 번으로 아이가 달라진다고 말할 수는 없어요" 같은 해명 · 단서 문장 금지).
- 어린이집 정보(보육 특징 · 서비스 · 적응 기간 · 특별활동 등)는 이 글 주제와 직접 이어질 때만 쓴다. 주제와 상관없는 서비스를 끼워 넣지 않는다. 어린이집 소개는 마무리에서 한두 문장이면 충분하다.
- 놀이 · 행사 글은 재료에 적힌 구체적인 놀이 · 활동 · 먹거리 이름을 그대로 살려 즐겁고 생생하게 쓴다 (보육적 해석보다 무엇을 하며 놀았는지가 먼저).
- 영아(만 0~2세) 글은 "수업 · 공부" 대신 놀이 · 생활 말로 쓴다.
- 통계, 논문, 기관 발표, 출처를 만들지 않는다.
- 어린이집 위치는 어린이집 정보의 소재 지역만 사실로 쓴다. 목표 지역이 다르면 "그 지역에 있다"고 쓰지 않는다.
- 아이 이름 · 별명, 아이를 알아볼 수 있는 내용(반 + 생김새 · 가족 · 사건이 겹치는 묘사)은 쓰지 않는다 (사실 칸에 이름이 있어도 "한 친구", "○○반 친구들"처럼 익명).
- 키워드는 본문에 띄어 쓴 자연스러운 말로 쓴다 ("신대방동어린이집" → "신대방동 어린이집"). 주요 키워드는 본문 전체에서 3~5번, 보조 키워드는 1~2번. 검색어를 문장에 그대로 끼워 넣은 듯한 표현 금지.
- 섹션은 앞 섹션의 마지막 내용을 이어받아 시작한다. 섹션마다 처음부터 다시 소개하지 않고, 앞에서 한 말을 다른 섹션에서 되풀이하지 않는다.
- '어린이집 주변'이 있으면 마무리 쪽 문단에 한 번, 학부모가 위치를 떠올릴 수 있게 "○○아파트 · ○○초 근처에 있는"처럼 주변 아파트나 학교 이름 1~2개를 꼭 쓴다 (본문 전체에서 최대 두 번). 거리 숫자 · 걸어서 몇 분은 쓰지 않는다.
- 다른 글을 베끼거나 틀에 어린이집 이름만 바꿔 넣은 듯한 글을 쓰지 않는다.
- 소제목은 15자 안팎으로 짧고 궁금하게. 소제목에는 이모지 · 기호를 넣지 않는다 (프로그램이 붙임).
- 제목 후보는 정확히 3개, 각 20~40자, 과장 없이.
- 태그는 8~12개, # 없이, 학부모가 검색할 짧은 말 (주제 · 연령 · 어린이집 · 육아 관련).
- reviewFlags 에는 원장님 · 선생님이 확인해야 할 점(예: "사실 칸에 없는 일정이 필요해요")만 넣는다. 없으면 빈 배열.`;

const KIND_GUIDE: Record<string, string> = {
  '수업 후기': '흐름(기본): 학부모의 관심 → 오늘 한 놀이 · 활동 → 관찰한 아이들 모습 → 보육적 의미(놀이로 자라는 것) → 어린이집 · 반의 지도 방향 → 마무리. 글마다 같은 틀로 복제하지 말고 재료에 맞게 순서 · 소제목을 바꿔도 된다.',
  '성장 이야기': '흐름: 이전 모습 → 선생님이 도운 과정 → 지금 관찰 → 의미 → 마무리. 변화는 사실 칸에 적힌 만큼만. 과장 금지. 특정 아이를 알아볼 수 있게 쓰지 않는다.',
  '행사 안내': '흐름: 행사 소개(언제 · 무엇) → 하는 활동을 구체적으로(재료에 적힌 놀이 · 먹거리 그대로) → 일시 · 장소 · 대상 · 준비물 · 신청 방법(사실 칸에 있는 것만, 한 문단에 모아) → 아이들이 느낄 즐거움 · 의미는 짧게 → 마무리. 사실 칸에 없는 장소 · 준비물 · 신청 방법은 지어내지 말고 "자세한 안내는 어린이집으로 문의해 주세요" 한 문장으로.',
  '모집 안내': '흐름: 학부모의 고민(어린이집 고르기 · 첫 기관 생활) → 우리 어린이집의 하루 · 보육 방식(사실) → 입소 대상 · 상담 · 대기 신청 방법(사실 칸 그대로) → 마무리. 보육료 · 필요경비 · 할인 · 혜택 · 입소 가능 여부를 만들지 않는다. 대기 신청 방법이 사실 칸에 없으면 "입소 상담은 어린이집으로 문의해 주세요" 한 문장으로.',
  '교육 정보': '흐름: 학부모 질문 → 일반적인 설명 → 어린이집에서 실제로 하는 방식(사실 칸) → 가정에서 도울 점 → 마무리. 건강 · 발달은 일반적인 수준만 설명하고 진단하지 않는다.',
};

// 지시문 속 칸 이름
const LB = { name: '어린이집 이름', aud: '보육 대상', phil: '보육 철학', feat: '실제 보육 특징', cred: '원장 · 교사 경력 · 자격(확인된 사실)', act: '한 놀이 · 활동', coach: '선생님이 도운 점', recruitWho: '입소 대상', recruitTrial: '상담 · 대기 신청 방법' };

export function profileBlock(p: DojoProfile, input: ArticleInput) {
  const inc = input.includeProfile;
  const lines = [`${LB.name}: ${p.name}`, `소재 지역: ${p.region}`, `${LB.aud}: ${p.audiences.join(', ')}`];
  if (p.facilityType) lines.push(`어린이집 유형: ${p.facilityType}`);
  if (inc.address && p.address) lines.push(`주소: ${p.address}`);
  if (inc.philosophy) lines.push(`${LB.phil}: ${p.philosophy}`);
  if (inc.classFeatures) lines.push(`${LB.feat}: ${p.classFeatures}`);
  if (inc.credentials && p.credentials) lines.push(`${LB.cred}: ${p.credentials}`);
  if (inc.contact && (p.contact || p.consultLink)) lines.push(`상담 연락처: ${[p.contact, p.consultLink].filter(Boolean).join(' / ')}`);
  const near = nearbyLine(p.nearbyAreas ?? []);
  if (near) lines.push(`${APP.place} 주변 (실제로 가까운 곳): ${near}`);
  if (p.avoidWords.trim()) lines.push(`쓰지 말 표현: ${p.avoidWords}`);
  return lines.join('\n');
}

export function factsBlock(input: ArticleInput) {
  const f = input.facts;
  const L: string[] = [];
  const add = (k: string, v?: string) => { if (v && v.trim()) L.push(`${k}: ${v.trim()}`); };
  add(LB.act, f.activities); add(LB.coach, f.coachingPoints);
  add('관찰 장면', f.scenes || '(없음 — 구체 사례를 만들지 말 것)');
  add('전달 가치', f.values); add('추가 안내', f.extra); add('사진 설명', f.photoNotes);
  if (input.kind === '행사 안내' && f.event) { add('행사 일시', f.event.when); add('행사 장소', f.event.where); add('행사 대상', f.event.who); add('준비물', f.event.bring); add('신청 방법', f.event.apply); }
  if (input.kind === '모집 안내' && f.recruit) { add(LB.recruitWho, f.recruit.who); add(LB.recruitTrial, f.recruit.trial); }
  if (input.kind === '성장 이야기' && f.growth) { add('이전 모습', f.growth.before); add('현재 관찰', f.growth.now); add('지도 과정', f.growth.process); }
  return L.join('\n');
}

// 글쓴이 시점 (기획안 v0.2 4장). 글쓴이를 고르지 않은 글은 줄을 넣지 않음
export function writerLine(w?: Writer) {
  if (!w) return '';
  return w.role === '원장'
    ? `\n[글쓴이] ${writerLabel(w)} — 어린이집 전체를 보는 원장님 시점으로 쓴다 ("저희 어린이집"). 글 전체를 이 시점으로.`
    : `\n[글쓴이] ${writerLabel(w)} — 담임 선생님 시점으로, "저희 ${w.className?.trim() || '반'}" 아이들과 지낸 이야기로 쓴다. 원장님 시점의 말("원장으로서" 등)을 섞지 않는다.`;
}

export function articlePrompt(p: DojoProfile, input: ArticleInput, regionNote: string | null) {
  return `[글 종류] ${kindLabel(input.kind)}
[주요 독자] ${input.audience} 학부모
[목표 지역] ${input.region}${regionNote ? `\n[주의] ${regionNote}` : ''}
[주제] ${input.topic}
[주요 키워드] ${input.mainKeyword} (본문에는 "${spacedKeyword(input.mainKeyword)}"처럼 자연스럽게, 3~5번)
[보조 키워드] ${input.subKeywords.map((k) => spacedKeyword(k)).join(', ') || '없음'}
[문체] ${input.tone}${input.tone === '따뜻한 설명형' ? ' — 친근한 해요체 ("~해요", "~드려요"). 딱딱한 "~합니다"는 쓰지 않는다' : ' — 차분한 존댓말, 너무 딱딱하지 않게'}${writerLine(input.writer)}
[마무리] ${input.ending} — 마지막 섹션의 끝 문단으로 쓴다. 마무리 · 인사만 담은 섹션을 따로 만들지 않는다.
[어린이집 이름] "${p.name}" — 도입이나 마무리 문단에 글자 그대로 자연스럽게 1~2번 넣는다. 광고 문구처럼 되풀이하지 않는다.
[분량] 본문(소제목+문단) 공백 제외 ${targetRangeFor(input.kind)[0]}~${targetRangeFor(input.kind)[1]}자 목표, 최소 ${minCharsFor(input.kind)}자. 분량을 위해 사실을 만들지 말고 교육적 설명 · 지도 방향 · 가정에서 도울 점으로 채우되, "아이에게 물어보세요" 같은 가정 대화 권유는 글 전체에서 한 번만.
[구성] ${KIND_GUIDE[input.kind]}
[섹션 id] s1, s2, s3 … 순서대로. 첫 섹션(도입)은 heading 빈 문자열 가능. 섹션 5~7개.
[사진 제안] photoSuggestions 는 실제 사진을 넣기 좋은 자리 2~3곳 (사진 설명이 있으면 그것 기준).

[${APP.place} 정보 — 사실]
${profileBlock(p, input)}

[이번 글 재료 — 사실]
${factsBlock(input)}`;
}

export function expandPrompt(doc: ArticleDoc, current: number, min = MIN_CHARS) {
  return `아래 글의 본문이 공백 제외 ${current}자라 최소 ${min}자에 모자란다. 목표 ${min === MIN_CHARS ? TARGET_RANGE[0] : min + 200}자 이상. 같은 권유("아이에게 물어보세요" 등)를 되풀이해서 늘리지 마라.
새 사실을 만들지 말고(활동 · 사례 · 수치 · 일정 추가 금지), 이미 있는 사실의 교육적 의미, 지도 방향, 가정에서 도울 점을 더 자세히 풀어 써서 늘려라.
섹션 id 와 순서는 유지하고, 같은 문장 반복으로 늘리지 마라. 같은 JSON 형식으로 전체를 다시 출력하라.

${JSON.stringify(doc)}`;
}

// 어린이집 흐름 다듬기에 더 볼 것 (기획안 v0.2 6장)
const DAYCARE_POLISH = (w?: Writer) => `
7. 글쓴이 시점이 처음부터 끝까지 같게 한다${w ? ` (글쓴이: ${writerLabel(w)})` : ''}. 선생님 글에 원장 시점의 말이 섞이거나, 원장님 글이 한 반 이야기로만 흐르지 않게.
8. 아이를 평가 · 진단하는 말("느린 아이", "문제 행동", "발달 지연", "산만한 아이")은 실제로 본 모습을 그대로 쓰는 말로 바꾼다. 학부모를 탓하거나 겁주는 말은 부드럽게 바꾼다.
9. 영아 · 유아 나이에 맞지 않는 말(영아에게 "수업 · 공부 · 훈련")은 놀이 · 생활 말로 바꾼다.`;

// 흐름 다듬기 (2026-10-18 사용자: "글의 맥락이 부자연스럽다") — 초안 · 분량 보완 뒤 한 번, 전체를 소리 내어 읽듯 다듬음
export function polishPrompt(doc: ArticleDoc, input: ArticleInput) {
  const kws = [input.mainKeyword, ...input.subKeywords].filter(Boolean).map((k) => `"${k}" → "${spacedKeyword(k)}"`).join(', ');
  return `아래 블로그 글을 학부모가 처음부터 끝까지 한 번에 읽는다고 생각하고 흐름을 다듬어라.
고칠 것:
1. 섹션과 문단이 앞 내용을 이어받게 연결한다. 섹션마다 처음부터 다시 소개하거나 같은 뜻을 되풀이하는 문장은 지우거나 합친다.
2. 문장 사이 연결이 끊기는 곳(갑자기 주제가 바뀜, 접속이 어색함)을 자연스럽게 잇는다.
3. 검색어를 그대로 끼워 넣은 듯한 표현을 띄어 쓴 자연스러운 말로 바꾼다 (${kws || '키워드 없음'}). 주요 키워드는 본문 전체 3~5번.
4. 같은 어미 · 같은 시작어가 연달아 나오면 바꾼다.
5. 효과를 보장하지 않는다는 해명 · 단서 문장("~라고 말할 수는 없어요", "~가 바로 달라지는 건 아니에요")과 글 주제와 상관없이 끼워 넣은 어린이집 서비스 소개를 지운다. 글 자체를 설명하는 문장도 지운다 ("이것은 특정 아이 이야기가 아니라 일반적인 기준이에요", "이어서 ~를 나눠 볼게요", "오늘은 ~를 안내해 드려요" 같은 예고 · 해명).
6. 연결은 내용으로 한다. 섹션 첫 문장에서 앞 섹션 내용을 억지로 다시 말하거나 키워드를 끼워 넣지 않는다 ("~를 생각했다면 ~도 볼까요?" 같은 이음말 반복 금지).${DAYCARE_POLISH(input.writer)}
지킬 것: 사실(어린이집 이름, 지역, 요일, 시간, 반 이름, 활동 내용, 경력)은 글자 그대로 둔다. 새 사실 · 사례 · 수치 · 일정을 더하지 않는다.
섹션 id · 순서 · 소제목은 유지한다 (소제목은 어색할 때만 짧게 고친다). 이모지 수는 그대로. 분량은 공백 제외 ${minCharsFor(input.kind)}자 아래로 줄이지 않는다. 같은 권유("아이에게 물어보세요" 등)가 여러 번이면 하나만 남긴다. 인사만 담은 마지막 섹션이 따로 있으면 앞 섹션 끝에 합친다 (섹션 수가 하나 줄어도 됨).
titleCandidates · tags · photoSuggestions · reviewFlags 는 그대로 둔다. 같은 JSON 형식으로 전체를 출력하라.

${JSON.stringify(doc)}`;
}

// 어린이집 사실 점검에 더 찾을 것 (기획안 v0.2 6장)
const DAYCARE_REVIEW = `, 아이를 알아볼 수 있는 내용(반 + 생김새 · 가족 · 사건이 겹치는 묘사), 사실에 없는 보육료 · 필요경비 금액, 입소 가능 여부 · 순위 · 대기 기간 약속, 사실에 없는 평가 결과 · 인증, 아이의 건강 · 발달을 진단하거나 평가하는 말.
code 는 invented / exaggeration / region / child-name / child-identify / fee / admission / evaluation / diagnosis / other 중 하나.`;

export function reviewPrompt(doc: ArticleDoc, p: DojoProfile, input: ArticleInput) {
  return `아래 [글]을 [사실]과 비교해 확인이 필요한 곳만 찾아라. 문체 지적은 하지 마라.
찾을 것: 사실에 없는 구체 내용(대화, 수치, 일정, 경력, 수상, 가격, 아이의 변화), 과장 · 보장 표현, 다른 지역에 있다고 쓴 곳, 아이 이름${DAYCARE_REVIEW} sectionId 는 해당 섹션 id (모르면 빈 문자열). 문제가 없으면 flags 빈 배열.

[사실 — ${APP.place}]
${profileBlock(p, input)}

[사실 — 이번 글]
${factsBlock(input)}

[글]
${doc.sections.map((s) => `(${s.id}) ${s.heading ?? ''}\n${s.paragraphs.join('\n')}`).join('\n\n')}`;
}

const REVISE: Record<Exclude<RevisionKind, 'titles' | 'paragraph'>, string> = {
  warmer: '전체를 더 따뜻하고 다정한 말투로 바꿔라. 학부모에게 말을 건네듯.',
  professional: '전체를 더 전문적인 보육 교사의 말투로 바꿔라. 놀이와 생활 속 배움을 차분히 설명하듯.',
  'less-promo': '어린이집 홍보 문장을 줄이고 놀이 · 생활 내용과 보육적 의미 중심으로 바꿔라. 상담 권유는 마지막에 한 번만.',
};
export function revisePrompt(kind: Exclude<RevisionKind, 'titles' | 'paragraph'>, doc: ArticleDoc, min = MIN_CHARS) {
  return `${REVISE[kind]}
사실(활동, 장면, 일정, 이름 없음)은 그대로 두고 새 사실을 더하지 마라. 섹션 id · 순서 유지. 분량은 비슷하게(공백 제외 ${min}자 이상 유지). 같은 JSON 형식으로 전체를 출력하라.

${JSON.stringify(doc)}`;
}

export function titlesPrompt(doc: ArticleDoc, input: ArticleInput) {
  return `아래 글의 제목 후보를 새로 3개 만들어라. 각 20~40자, 주요 키워드 "${input.mainKeyword}"를 자연스럽게 포함, 과장 · 보장 · "최고" 금지, 서로 다른 느낌으로.

${bodyText(doc).slice(0, 2500)}`;
}

export function paragraphPrompt(doc: ArticleDoc, sectionId: string, index: number, instruction: string) {
  const s = doc.sections.find((x) => x.id === sectionId);
  return `아래 글에서 [고칠 문단] 하나만 다시 써라. 요청: ${instruction || '더 읽기 쉽게'}
새 사실을 더하지 마라. 앞뒤 문단과 자연스럽게 이어지게. 문단 하나만 출력.

[글 전체 — 참고]
${bodyText(doc).slice(0, 3000)}

[고칠 문단]
${s?.paragraphs[index] ?? ''}`;
}

// 카드 글 규칙 (2026-10-27 사용자: 제목은 묻는데 아래 글이 "궁금하지요 · 살펴봐요"로 끝나 부실 → 답 + 글 속 구체 내용 2문장)
// 강담 실제 글 5개로 비교 확인: https://claude.ai/artifact/7uKPqZo24FEJZWp74yJmC4
// 어린이집판은 예시만 놀이 · 생활 말로 (규칙은 같음)
const CARD_TITLE_RULE = 'title 10~28자: 카드1만 학부모가 궁금해할 질문으로 쓸 수 있다. 카드2 · 카드3 title 은 물음표 없이, 답이 담긴 짧은 문장으로 쓴다 (예: "블록은 쌓고 무너뜨리며 놀아요").';
const CARD_SUB_RULE = `sub 는 꼭 2문장, 60~110자:
- 첫 문장 = title 에 대한 답. title 이 질문이면 바로 답한다 (예: "아니요, 처음엔 낯설어하는 게 당연해요."). 질문으로 끝내지 않는다.
- 둘째 문장 = 그 답을 보여 주는 글 속 구체적인 내용 하나 — 놀이 · 활동 이름, 선생님이 도운 방법, 실제 장면, 날짜 · 행사 이름 중 글에 적힌 것을 그대로 쓴다.
- "살펴요" · "짚어요" · "눈여겨봐요"처럼 막연한 말로 때우지 말고, 글에 적힌 대로 무엇을 했는지 · 무엇이 보였는지를 쓴다.
- sub 에 쓰지 않는 것: 물음표, "궁금하지요" · "살펴봐요" · "살펴볼까요" · "함께 볼까요"처럼 답 없이 끝나는 말, 글에 없는 사실.
과장 · 보장 금지, 이모지 금지.`;
// 답 없이 끝나는 카드 글 (있으면 한 번 더 만듦)
export const VAGUE_SUB = /\?|궁금하(시)?지요|살펴(봐요|볼까요|보세요)|함께 볼까요|알아볼까요|생각해 볼까요/;
const sectionsFull = (doc: ArticleDoc) => doc.sections.map((s) => `(${s.id}) ${s.heading ?? ''}: ${s.paragraphs.join(' ')}`).join('\n');

// 카드 장면 규칙: 안전 · 개인정보 (기획안 v0.2 8장)
const SCENE_RULES = `scene 은 배경 그림 장면을 영어로 한 문장 (예: "toddlers stacking soft blocks on a classroom rug, a teacher sitting beside them"). 글자 · 간판 · 숫자가 보이는 장면 금지. 실제 아이 사진이 아닌 일러스트 장면 (얼굴은 그림체로 또렷하게 — "faceless" 같은 말 쓰지 않기).
scene 에서 위험해 보이는 장면(높은 곳에 올라가기, 작은 물건을 입에 넣기, 어른 없이 물가) 금지. 놀이 · 식사 · 낮잠 · 바깥놀이처럼 글에 나온 생활 장면으로.
카드 문구에 아이 이름 · 금액 · 입소 약속 · 아이를 진단하는 말을 쓰지 않는다.`;

// 제목 · 답 맞추기 (2026-10-27 요요유치원 시험 — "아이들은 밖에서 무엇을 하나요?"에 "바깥 풍경을 만나요"로 답하고,
// 카드1 · 2가 같은 문장 "보라매공원으로 소풍을 다녀왔어요"를 되풀이, 카드2 title 이 글 제목 그대로, 공원 글에 교실 그림)
const DAYCARE_MATCH_RULE = `제목과 답 맞추기 (꼭 지킬 것):
- 질문 title 은 이 글에 적힌 내용으로 바로 답할 수 있는 구체적인 질문만 쓴다. 글에 그 답이 될 놀이 · 장면 · 방법이 없으면 질문 대신 문장 title 로 쓴다.
- sub 첫 문장은 title 이 묻는 그것으로 답한다: "무엇을" → 한 일 · 놀이 이름, "어떻게" → 방법, "왜" → 이유, "언제 · 어디서" → 날짜 · 장소. "풍경을 만나요" · "경험을 해요" · "시간을 보내요"처럼 무엇인지 알 수 없는 답 금지.
- 둘째 문장은 첫 문장과 다른 구체 내용이다. title 이나 첫 문장을 다른 말로 되풀이하지 않는다.
- 세 장의 title · sub 에 같은 문장 · 같은 내용을 두 번 쓰지 않는다. title 을 글 제목 그대로 옮기지 않는다.
- scene 은 그 카드 문구와 같은 장소 · 같은 활동이다 (문구가 공원 소풍이면 그림도 공원, 교실 놀이면 교실).`;

// 어린이집 카드 점검 (글의 흐름 확인처럼 만든 뒤 한 번 더): 고칠 곳만 고치고 나머지는 글자 그대로
// 재료가 주제 한 줄뿐이면 질문 제목 금지 (글에 답이 없음)
const NO_QUESTION = '이 글은 재료가 적어 질문에 답할 구체 내용이 없다. 세 장 모두 title 을 물음표 없는 문장으로 쓴다 (카드1도).';

export function cardCheckPrompt(doc: ArticleDoc, title: string, cards: { title: string; sub: string; scene: string; afterSectionId: string }[], kind?: string, writer?: Writer, noQuestion = false) {
  const r = cardRoles(kind);
  return `아래 [카드] 3장을 [글]과 비교해 점검하고, 틀린 곳만 고쳐 같은 JSON 형식으로 3장 모두 출력하라. 맞는 카드는 글자 그대로 둔다.
카드 역할: 카드1 = ${r[0].guide}, 카드2 = ${r[1].guide}, 카드3 = ${r[2].guide}.${cardWriter(writer)}${noQuestion ? `\n${NO_QUESTION}` : ''}
점검할 것:
1. sub 첫 문장이 title 이 묻는 것(무엇을 · 어떻게 · 왜 · 언제 · 어디서)에 글에 적힌 구체 내용으로 답하는가. 아니면 첫 문장을 고치고, 글에 그 답이 없으면 title 을 답할 수 있는 질문이나 문장으로 바꾼다.
2. 둘째 문장이 첫 문장 · title 을 되풀이하지 않고 글 속 다른 구체 내용인가.
3. 세 장끼리 같은 문장 · 같은 내용이 되풀이되지 않는가. title 이 글 제목을 그대로 옮긴 말이 아닌가.
4. scene 이 그 카드 문구와 같은 장소 · 같은 활동인가 (영어 한 문장, 글자 · 간판 · 숫자 없는 장면, 위험한 장면 금지).
5. 글에 없는 사실 · 아이 이름 · 금액 · 입소 약속 · 진단하는 말이 없는가.
${CARD_TITLE_RULE}
${CARD_SUB_RULE}
afterSectionId 는 바꾸지 않는다.

[카드]
${cards.map((c, i) => `카드${i + 1}: title="${c.title}" / sub="${c.sub}" / scene="${c.scene}" / afterSectionId="${c.afterSectionId}"`).join('\n')}

[글 제목] ${title}
[글]
${sectionsFull(doc)}`;
}

// 선생님 글이면 카드도 반 시점으로 (원장님 글은 어린이집 시점)
const cardWriter = (w?: Writer) =>
  w ? `\n카드 문구 시점: ${w.role === '교사' ? `"${w.className?.trim() || '우리 반'} 친구들"처럼 반 시점` : '어린이집 전체 시점'}.` : '';

export function cardCopyPrompt(doc: ArticleDoc, title: string, kind?: string, writer?: Writer, noQuestion = false) {
  const r = cardRoles(kind);
  return `아래 블로그 글로 카드뉴스 3장 문구를 만들어라. 글에 있는 사실과 메시지만 쓴다.
카드1 = ${r[0].guide}, 카드2 = ${r[1].guide}, 카드3 = ${r[2].guide}.
세 장이 이 글 주제 하나로 이어지게 쓴다. 글 주제와 상관없는 어린이집 정보(다른 서비스 · 활동)는 카드에 쓰지 않는다. 날짜 · 행사 이름은 글에 적힌 그대로.${cardWriter(writer)}
${CARD_TITLE_RULE}
${CARD_SUB_RULE}\n${DAYCARE_MATCH_RULE}${noQuestion ? `\n${NO_QUESTION}` : ''}
${SCENE_RULES}
afterSectionId 는 그 카드를 넣기 좋은 섹션 id (카드1은 도입 뒤, 카드2 · 카드3은 내용이 가장 가까운 섹션 뒤).

[제목] ${title}
[섹션]
${sectionsFull(doc)}`;
}

// 카드 한 장 문구만 새로 (그림 · 장면은 그대로라 장면과 어울리게)
export function cardOnePrompt(doc: ArticleDoc, title: string, index: number, current: { title: string; sub: string; scene: string }, others: string[], kind?: string, writer?: Writer, noQuestion = false) {
  return `아래 블로그 글로 카드뉴스 ${index + 1}번 카드(${cardRoles(kind)[index]?.guide ?? '이 글의 메시지'})의 문구를 새로 만들어라. 글에 있는 사실과 메시지만 쓴다. 글 주제와 상관없는 ${APP.place} 정보는 쓰지 않는다.${cardWriter(writer)}
지금 문구와 다른 표현으로 쓰고, 다른 카드 제목과 겹치지 않게. 이 카드는 카드${index + 1}이다. 아이 이름 · 금액 · 입소 약속 · 진단하는 말 금지.
${CARD_TITLE_RULE}
${CARD_SUB_RULE}\n${DAYCARE_MATCH_RULE}${noQuestion ? `\n${NO_QUESTION}` : ''}
그림은 바꾸지 않으므로 그림 장면과 어긋나지 않게 쓴다. 그림 장면: ${current.scene}

[지금 문구] ${current.title} / ${current.sub}
[다른 카드 제목] ${others.join(' / ') || '없음'}
[글 제목] ${title}
[섹션]
${sectionsFull(doc)}`;
}

export const MEMO_RULES = `너는 원장님 · 선생님이 말하듯 적은 보육 메모를 블로그 재료 칸에 나눠 담는 정리 담당이다.
반드시: 메모에 있는 내용만 옮긴다. 없는 내용은 그 칸을 빈 문자열로 둔다. 꾸미거나 늘리거나 추측하지 않는다.
아이 이름 · 별명은 "한 친구"로 바꾼다. 날짜 · 시간 · 장소 · 준비물 · 금액은 메모에 적힌 그대로만.
칸 뜻: activities=오늘 한 놀이 · 활동, coachingPoints=선생님이 도운 점 · 강조한 점, scenes=실제로 본 아이 모습 · 장면, values=전하고 싶은 가치(최대 2개, 쉼표),
extra=그 밖의 안내, photoNotes=사진 설명, event*=행사 일시 · 장소 · 대상 · 준비물 · 신청 방법, recruit*=입소 대상 · 상담 · 대기 신청 방법,
growthBefore=이전 모습, growthNow=지금 모습, growthProcess=그사이 선생님이 도운 과정.`;

export function memoPrompt(memo: string, kind: string, topic: string) {
  return `[글 종류] ${kindLabel(kind)}
[주제] ${topic || '(없음)'}
[메모]
${memo}`;
}

export function keywordIdeasPrompt(region: string, topic: string, kind: string) {
  return `어린이집 블로그 글의 검색 키워드 후보를 10개 만들어라. 지역: ${region}, 주제: ${topic}, 글 종류: ${kindLabel(kind)}.
학부모가 네이버에서 실제로 검색할 법한 짧은 표현 (2~4단어). 검색량 숫자는 쓰지 마라. 지역이 들어간 것과 안 들어간 것을 섞어라.`;
}
