// 네이버 지도 검색 결과 중 우리 도장 고르기 (2026-11-03 사용자: 이름으로만 골라 다른 지역 도장 지도가 들어감)
// 도장 정보의 상세 주소(없으면 지역)와 대조. 맞는 곳이 없으면 고르지 않음 (다른 도장 지도가 들어가는 것보다 빠지는 게 나음)
export interface PlaceTarget {
  sido?: string;
  area: string[]; // 시 · 군 · 구
  road?: { name: string; no?: string };
  dong?: { name: string; no?: string };
}
export interface PlaceRow { title: string; text: string }

const SIDO: [RegExp, string][] = [
  [/서울특별시|서울시/g, '서울'], [/부산광역시/g, '부산'], [/대구광역시/g, '대구'], [/인천광역시/g, '인천'], [/광주광역시/g, '광주'], [/대전광역시/g, '대전'], [/울산광역시/g, '울산'],
  [/세종특별자치시|세종시/g, '세종'], [/경기도/g, '경기'], [/강원특별자치도|강원도/g, '강원'], [/충청북도/g, '충북'], [/충청남도/g, '충남'], [/전북특별자치도|전라북도/g, '전북'], [/전라남도/g, '전남'], [/경상북도/g, '경북'], [/경상남도/g, '경남'], [/제주특별자치도|제주도/g, '제주'],
];
const SIDO_WORDS = new Set(SIDO.map(([, s]) => s));
const AREA = /^[가-힣]+(시|군|구)$/;
const ROAD = /^([가-힣][가-힣0-9]*(?:로|길))(\d+(?:-\d+)?)?$/;
const DONG = /^[가-힣][가-힣0-9]*(?:동|읍|면|리|\d가)$/;
const NUMBER = /^(\d+(?:-\d+)?)(?:번지)?$/;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const clean = (s: string) => SIDO.reduce((t, [re, to]) => t.replace(re, to), s).replace(/\s+/g, ' ').trim();

function parse(text: string): PlaceTarget {
  const t: PlaceTarget = { area: [] };
  const inParen = [...text.matchAll(/\(([^)]*)\)/g)].flatMap((m) => clean(m[1]).split(/[\s,]+/));
  const words = clean(text.replace(/\([^)]*\)/g, ' ')).split(/[\s,]+/).filter(Boolean);
  let i = 0;
  if (SIDO_WORDS.has(words[0])) t.sido = words[i++];
  for (; i < words.length && AREA.test(words[i]); i++) t.area.push(...words[i].split(/(?<=시)(?=[가-힣]+구$)/));
  const dongs: PlaceTarget['dong'][] = [];
  for (; i < words.length; i++) {
    const no = words[i + 1]?.match(NUMBER)?.[1];
    const road = words[i].match(ROAD);
    if (road) { t.road = { name: road[1], no: road[2] ?? no }; break; } // 도로명 뒤는 건물 이름 · 층이라 보지 않음
    if (DONG.test(words[i])) dongs.push({ name: words[i], no });
  }
  t.dong = dongs.find((d) => d?.no) ?? dongs[0] ?? inParen.filter((w) => DONG.test(w)).map((name) => ({ name }))[0];
  return t;
}

// 상세 주소를 먼저 보고, 거기 없는 시 · 구 · 동은 지역 칸에서 채움
// known: 카카오가 알려 준 같은 곳의 도로명 · 지번 주소 (있으면 네이버 결과가 어느 표기로 나와도 번지까지 대조)
export function placeTarget(address: string | undefined, region: string | undefined, known?: { road?: string; jibun?: string }): PlaceTarget {
  const a = parse(address ?? ''), r = parse(region ?? ''), kr = parse(known?.road ?? ''), kj = parse(known?.jibun ?? '');
  const hasArea = a.sido || a.area.length;
  return { sido: hasArea ? a.sido : r.sido, area: hasArea ? a.area : r.area, road: kr.road ?? a.road, dong: kj.dong ?? a.dong ?? (a.road ? undefined : r.dong) };
}
export const hasPlaceBasis = (t: PlaceTarget) => !!(t.sido || t.area.length || t.road || t.dong);

// 3 = 번지까지 같음, 2 = 같은 동 (번지를 모름), 1 = 시 · 구만 같고 나머지는 결과에 안 나옴, 0 = 다른 곳
export function placeRank(text: string, t: PlaceTarget): number {
  const s = clean(text);
  let after = s;
  if (t.area.length) {
    const m = s.match(new RegExp(t.area.map(esc).join('\\s*')));
    if (!m) return 0;
    const before = s.slice(0, m.index).trim().split(' ').pop() ?? '';
    if (t.sido && SIDO_WORDS.has(before) && before !== t.sido) return 0; // 서울 중구 ≠ 부산 중구
    after = s.slice(m.index! + m[0].length);
  } else if (t.sido) {
    const at = s.indexOf(t.sido);
    if (at < 0) return 0;
    after = s.slice(at + t.sido.length);
  }
  if (t.road) {
    if (t.road.no && new RegExp(`${esc(t.road.name)}\\s*${esc(t.road.no)}(?![\\d-])`).test(after)) return 3;
    if (/[가-힣0-9]+(?:로|길)\s*\d/.test(after)) return 0; // 도로명이 나왔는데 번지까지 맞지 않음
  }
  if (t.dong) {
    const same = new RegExp(`(?:^|\\s)${esc(t.dong.name)}(?=\\s|$)`).test(after);
    if (same && t.dong.no) {
      if (new RegExp(`${esc(t.dong.name)}\\s*${esc(t.dong.no)}(?![\\d-])`).test(after)) return 3;
      if (new RegExp(`${esc(t.dong.name)}\\s*\\d`).test(after)) return 0;
    }
    if (same) return 2;
    if (/[가-힣0-9]+(?:동|읍|면|리|\d가)\s*\d/.test(after)) return 0; // 다른 동 번지
  }
  return 1;
}

const flat = (s: string) => s.replace(/[\s·.,()\-_]/g, '').toLowerCase();
const bare = (s: string) => flat(s).replace(/(태권도장|태권도|도장|체육관|유치원|어린이집)$/, '');
function similar(a: string, b: string) {
  const x = flat(a), y = flat(b);
  const grams = Array.from({ length: Math.max(0, x.length - 1) }, (_, i) => x.slice(i, i + 2));
  return grams.length ? grams.filter((g) => y.includes(g)).length / grams.length : x === y ? 1 : 0;
}

// 고른 줄 번호, 없으면 -1. 번지까지 같아도 같은 건물의 다른 가게일 수 있어 이름도 봄
// 번지를 확인 못 한 곳은 이름이 같고 그런 곳이 하나일 때만
export function pickPlace(rows: PlaceRow[], name: string, t: PlaceTarget): number {
  const ranks = rows.map((r) => placeRank(r.text, t));
  const best = Math.max(0, ...ranks);
  if (!best) return -1;
  const top = rows.map((r, i) => ({ r, i })).filter((x) => ranks[x.i] === best);
  const same = top.filter((x) => bare(x.r.title) === bare(name));
  if (best === 3) return (same[0] ?? top.find((x) => similar(name, x.r.title) >= 0.5))?.i ?? -1;
  return same.length === 1 ? same[0].i : -1;
}

// 이름만으로 안 나오면 동네를 붙여 한 번 더
export function placeQueries(name: string, t: PlaceTarget) {
  const near = t.dong?.name ?? t.area[t.area.length - 1];
  return near ? [name, `${name} ${near}`] : [name];
}
