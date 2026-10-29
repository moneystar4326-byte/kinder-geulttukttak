// 주변 장소 이름을 글에 쓰기 (태권 글뚝딱 2026-10-18 규칙에서 옴: 초등학교 1km · 역 1km · 아파트 500m 안만)
// 유치원도 아파트 기준 (2026-10-27 기획안 v0.2 9장 · v0.4 8장). 이름은 AI가 만들지 않고 코드로만 붙임
import type { NearbyArea } from './types';
import { APP } from './kinder';

const MAX: Record<string, number> = { 학교: 1000, 지하철역: 1000, 아파트: 500, 유치원: 800 };
const near = (areas: NearbyArea[], kind: string) =>
  areas.filter((a) => a.kind === kind && (a.distance == null || a.distance <= (MAX[kind] ?? 1000))).sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));

export const dongOf = (region: string) => region.trim().split(/\s+/).pop()?.replace(new RegExp(`${APP.term}$`), '') ?? '';

// 카카오 아파트 이름은 "아파트"를 떼고 모아서 다시 붙임 ("롯데낙천대" → [롯데낙천대아파트 유치원])
// 직접 적은 이름은 아파트 · 단지로 끝나면 그대로, 아니면 "○○ 근처" (다른 유치원 이름처럼 읽히지 않게)
const aptName = (name: string) => (/(아파트|단지)$/.test(name) ? name : `${name}아파트`);
export const kinderPrefix = (name: string, kakaoApt: boolean) =>
  kakaoApt ? `[${aptName(name)} ${APP.term}]` : /(아파트|단지)$/.test(name) ? `[${name} ${APP.term}]` : `[${name} 근처 ${APP.term}]`;

// 제목 머리말 후보 (돌아가며 씀): 가까운 아파트 4곳 · 직접 적은 이름을 번갈아, 소재 동 이름은 세 편에 한 번 꼭
// (태권 글뚝딱 2026-10-18: [신대방동 태권도]로 블로그 1번째 · 플레이스 2위 → 이름을 늘리되 소재 동은 세 편에 한 번)
export function prefixRotation(region: string, areas: NearbyArea[]) {
  const dong = dongOf(region);
  // 직접 적은 이름은 종류와 상관없이 씀 (2026-10-29 점검: "보라매초"처럼 초로 끝나 '학교'로 저장된 이름이 말없이 빠졌음)
  const manual = areas.filter((a) => a.source === 'manual' && a.name.trim() && a.name.trim() !== dong);
  const rest = [...new Set([
    ...near(areas, '아파트').slice(0, 4).map((a) => kinderPrefix(a.name, true)),
    ...manual.map((a) => kinderPrefix(a.name.trim(), false)),
  ])];
  if (!dong) return rest;
  const own = `[${dong} ${APP.term}]`;
  if (!rest.length) return [own];
  const out: string[] = []; // [동] → 둘 → [동] → 둘 …
  for (let i = 0; i < rest.length; i += 2) out.push(own, ...rest.slice(i, i + 2));
  return out;
}

// 화면 안내용: 돌아가는 이름 (중복 없이)
export const prefixNames = (region: string, areas: NearbyArea[]) => [...new Set(prefixRotation(region, areas))];

export function autoPrefix(region: string, areas: NearbyArea[], turn: number) {
  const r = prefixRotation(region, areas);
  return r.length ? r[turn % r.length] : '';
}

// 지역 태그: 동네 + 가까운 아파트 2곳 (# 없이, "○○유치원")
export function areaTags(region: string, areas: NearbyArea[]) {
  const names = [dongOf(region), ...near(areas, '아파트').slice(0, 2).map((a) => aptName(a.name))].filter(Boolean);
  return [...new Set(names.map((n) => `${n.replace(/\s/g, '')}${APP.term}`))];
}

// AI에 주는 주변 사실 (거리 숫자는 주지 않음 — 글에 숫자를 쓰지 않게)
export function nearbyLine(areas: NearbyArea[]) {
  const names = [...near(areas, '아파트').slice(0, 3).map((a) => aptName(a.name)), ...near(areas, '학교').slice(0, 2).map((a) => a.name), ...near(areas, '지하철역').slice(0, 1).map((a) => a.name)];
  return names.join(', ');
}

// 본문에 주변 아파트 · 학교 · 역 이름이 하나도 없으면 마지막에 위치 한 줄을 코드로 붙임 (AI가 자주 빼먹음)
// 카카오 거리로 확인한 가까운 곳만 쓰므로 사실. 거리 숫자는 쓰지 않음
export function locationLine(placeName: string, region: string, areas: NearbyArea[]) {
  const names = [...near(areas, '아파트').slice(0, 2).map((a) => aptName(a.name)), ...near(areas, '학교').slice(0, 1).map((a) => a.name)];
  if (!names.length) return '';
  const dong = dongOf(region);
  return `${placeName}${/[가-힣]$/.test(placeName) && (placeName.charCodeAt(placeName.length - 1) - 0xac00) % 28 ? '은' : '는'} ${dong ? `${dong}, ` : ''}${names.join(' · ')} 가까이에 있어요.`;
}
export function mentionsNearby(text: string, areas: NearbyArea[]) {
  return [...near(areas, '아파트'), ...near(areas, '학교'), ...near(areas, '지하철역')].some((a) => text.includes(a.name));
}

// 아파트 이름 앞에 붙은 동네 이름 떼기 ("보라매롯데낙천대" → "롯데낙천대"), 너무 짧아지면 그대로
export function cleanAreaName(name: string, kind: string, localWords: string[]) {
  if (kind !== '아파트') return name;
  let n = name;
  for (const w of localWords) if (w && n.startsWith(w) && n.length - w.length >= 3) { n = n.slice(w.length); break; }
  return n;
}
