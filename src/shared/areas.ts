// 주변 장소 이름을 글에 쓰기 (2026-10-18 사용자: 카카오로 모은 이름이 제목 · 본문 · 태그 · 지도에 안 쓰임)
// 1버전(태권 글뚝딱 shared/target.ts) 규칙: 초등학교 1km · 역 1km · 아파트 500m 안만, 학교 · 역은 "○○ 근처 태권도"
// 이름은 AI가 만들지 않고 코드로만 붙임
import type { NearbyArea } from './types';
import { IND, isDaycare } from './industry';

const MAX: Record<string, number> = { 학교: 1000, 지하철역: 1000, 아파트: 500, 유치원: 800 };
const near = (areas: NearbyArea[], kind: string) =>
  areas.filter((a) => a.kind === kind && (a.distance == null || a.distance <= (MAX[kind] ?? 1000))).sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));

export const dongOf = (region: string) => region.trim().split(/\s+/).pop()?.replace(new RegExp(`${IND.term}$`), '') ?? '';

// 어린이집판 (2026-10-27 기획안 v0.2 9장): 제목 머리말은 아파트 기준. 카카오 아파트 이름은 "아파트"를 떼고 모아서 다시 붙임
// ("롯데낙천대" → [롯데낙천대아파트 어린이집]). 직접 적은 이름은 아파트 · 단지로 끝나면 그대로, 아니면 "○○ 근처"
const aptName = (name: string) => (/(아파트|단지)$/.test(name) ? name : `${name}아파트`);
export const daycarePrefix = (name: string, kakaoApt: boolean) =>
  kakaoApt ? `[${aptName(name)} ${IND.term}]` : /(아파트|단지)$/.test(name) ? `[${name} ${IND.term}]` : `[${name} 근처 ${IND.term}]`;

// 제목 머리말 후보 (돌아가며 씀)
// 2026-10-18 사용자: [신대방동 태권도]로 블로그 1번째 · 플레이스 2위 확인 → 이름을 늘리되 소재 동 이름은 세 편에 한 번 꼭
// 나머지: 직접 입력한 동네 이름(예: 보라매) · 가까운 초등 3곳 · 가까운 역 2곳을 번갈아.
// 동네 이름을 괄호에 그대로 쓰면 다른 도장 이름처럼 읽혀서, 소재 동 말고는 모두 "○○ 근처"
const KAKAO_KINDS = ['학교', '지하철역', '아파트', '유치원'];
export function prefixRotation(region: string, areas: NearbyArea[]) {
  const dong = dongOf(region);
  const manual = areas.filter((a) => a.source === 'manual' && !KAKAO_KINDS.includes(a.kind) && a.name.trim() && a.name.trim() !== dong);
  if (isDaycare) return daycareRotation(dong, manual, areas);
  const schools = near(areas, '학교').slice(0, 3);
  const stations = near(areas, '지하철역').slice(0, 2);
  const others: string[] = manual.map((a) => a.name.trim());
  for (let i = 0; i < Math.max(schools.length, stations.length); i++) {
    if (schools[i]) others.push(schools[i].name);
    if (stations[i]) others.push(stations[i].name);
  }
  const rest = [...new Set(others)].map((n) => `[${n} 근처 태권도]`);
  if (!dong) return rest;
  const own = `[${dong} 태권도]`;
  if (!rest.length) return [own];
  const out: string[] = []; // [동] → 둘 → [동] → 둘 …
  for (let i = 0; i < rest.length; i += 2) out.push(own, ...rest.slice(i, i + 2));
  return out;
}

// 어린이집: 가까운 아파트 4곳 · 직접 적은 이름을 번갈아, 소재 동 이름은 세 편에 한 번 (태권도판과 같은 순서)
function daycareRotation(dong: string, manual: NearbyArea[], areas: NearbyArea[]) {
  const rest = [...new Set([
    ...near(areas, '아파트').slice(0, 4).map((a) => daycarePrefix(a.name, true)),
    ...manual.map((a) => daycarePrefix(a.name.trim(), false)),
  ])];
  if (!dong) return rest;
  const own = `[${dong} ${IND.term}]`;
  if (!rest.length) return [own];
  const out: string[] = [];
  for (let i = 0; i < rest.length; i += 2) out.push(own, ...rest.slice(i, i + 2));
  return out;
}

// 화면 안내용: 돌아가는 이름 (중복 없이)
export const prefixNames = (region: string, areas: NearbyArea[]) => [...new Set(prefixRotation(region, areas))];

export function autoPrefix(region: string, areas: NearbyArea[], turn: number) {
  const r = prefixRotation(region, areas);
  return r.length ? r[turn % r.length] : '';
}

// 지역 태그: 동네 + 가까운 초등학교 2곳 + 역 1곳 (# 없이, "○○태권도")
export function areaTags(region: string, areas: NearbyArea[]) {
  if (isDaycare) {
    const names = [dongOf(region), ...near(areas, '아파트').slice(0, 2).map((a) => aptName(a.name))].filter(Boolean);
    return [...new Set(names.map((n) => `${n.replace(/\s/g, '')}${IND.term}`))];
  }
  const names = [dongOf(region), ...near(areas, '학교').slice(0, 2).map((a) => a.name), ...near(areas, '지하철역').slice(0, 1).map((a) => a.name)].filter(Boolean);
  return [...new Set(names.map((n) => `${n.replace(/\s/g, '')}태권도`))];
}

// AI에 주는 주변 사실 (거리 숫자는 주지 않음 — 글에 숫자를 쓰지 않게)
export function nearbyLine(areas: NearbyArea[]) {
  if (isDaycare) {
    const names = [...near(areas, '아파트').slice(0, 3).map((a) => aptName(a.name)), ...near(areas, '학교').slice(0, 2).map((a) => a.name), ...near(areas, '지하철역').slice(0, 1).map((a) => a.name)];
    return names.join(', ');
  }
  const pick = [...near(areas, '학교').slice(0, 3), ...near(areas, '지하철역').slice(0, 2), ...near(areas, '아파트').slice(0, 2)];
  return pick.length ? pick.map((a) => a.name).join(', ') : '';
}

// 본문에 주변 학교 · 역 이름이 하나도 없으면 마지막에 위치 한 줄을 코드로 붙임 (AI가 자주 빼먹음 — 2026-10-18 실사용)
// 카카오 거리로 확인한 가까운 곳만 쓰므로 사실. 거리 숫자는 쓰지 않음
export function locationLine(dojoName: string, region: string, areas: NearbyArea[]) {
  const names = isDaycare
    ? [...near(areas, '아파트').slice(0, 2).map((a) => aptName(a.name)), ...near(areas, '학교').slice(0, 1).map((a) => a.name)]
    : [...near(areas, '학교').slice(0, 2), ...near(areas, '지하철역').slice(0, 1)].map((a) => a.name);
  if (!names.length) return '';
  const dong = dongOf(region);
  return `${dojoName}${/[가-힣]$/.test(dojoName) && (dojoName.charCodeAt(dojoName.length - 1) - 0xac00) % 28 ? '은' : '는'} ${dong ? `${dong}, ` : ''}${names.join(' · ')} 가까이에 있어요.`;
}
export function mentionsNearby(text: string, areas: NearbyArea[]) {
  return [...(isDaycare ? near(areas, '아파트') : []), ...near(areas, '학교'), ...near(areas, '지하철역')].some((a) => text.includes(a.name));
}

// 아파트 이름 앞에 붙은 동네 이름 떼기 ("보라매롯데낙천대" → "롯데낙천대"), 너무 짧아지면 그대로
export function cleanAreaName(name: string, kind: string, localWords: string[]) {
  if (kind !== '아파트') return name;
  let n = name;
  for (const w of localWords) if (w && n.startsWith(w) && n.length - w.length >= 3) { n = n.slice(w.length); break; }
  return n;
}
