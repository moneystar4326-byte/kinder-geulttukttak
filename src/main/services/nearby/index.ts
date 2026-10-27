// 유치원 주변 학교 · 유치원 · 아파트 · 역 이름 (카카오 로컬 API, 선택 기능)
// 1버전(태권 글뚝딱 nearby.ts)의 규칙을 옮김: 초등 1km · 아파트 500m · 역 1km, 학부모가 검색할 짧은 이름으로
// 이름은 AI에 맡기지 않고 사용자가 골라 제목 머리말 · 키워드 후보로만 씀
import { ApiError, fromHttp, toApiError } from '../errors';
import type { NearbyArea } from '../../../shared/types';
import { cleanAreaName, kinderPrefix, dongOf } from '../../../shared/areas';
import { APP } from '../../../shared/kinder';

async function get(url: string, key: string, signal?: AbortSignal) {
  let r: Response;
  try { r = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` }, signal: signal ?? AbortSignal.timeout(10_000) }); } catch (e) { throw toApiError('카카오', e); }
  if (!r.ok) throw fromHttp('카카오', r.status, await r.text());
  return r.json() as Promise<any>;
}

async function pages(base: string, key: string, signal?: AbortSignal) {
  const out: any[] = [];
  for (let page = 1; page <= 3; page++) {
    const j = await get(`${base}&page=${page}&size=15`, key, signal);
    out.push(...j.documents);
    if (j.meta?.is_end) break;
  }
  return out;
}

const GENERIC = /^(현대|삼성|한성|우창)$/;

export function shortName(name: string, kind: string, regionWords: string[] = []) {
  let n = name;
  if (kind === '학교') n = n.replace(/^(서울|경기|인천|부산|대구|광주|대전|울산|세종)/, '').replace(/초등학교$/, '초');
  if (kind === '아파트') {
    n = n.replace(/아파트$/, '');
    const full = n;
    for (const r of regionWords) n = n.replace(new RegExp(`^${r}`), '');
    if (n.length <= 2) n = full;
  }
  if (kind === '지하철역') n = n.replace(/\s.*$/, '');
  return n.trim();
}

export async function collectNearby(key: string, address: string, regionWords: string[], signal?: AbortSignal): Promise<NearbyArea[]> {
  if (!address.trim()) throw new ApiError('bad-request', `${APP.place} 정보에 상세 주소를 먼저 적어 주세요 (주변 장소를 찾을 때만 써요)`, '카카오');
  const addr = address.replace(/\s*(상가|\d+층).*$/, '');
  const geo = await get(`https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(addr)}`, key, signal);
  const doc = geo.documents?.[0];
  if (!doc) throw new ApiError('bad-request', `주소를 찾지 못했어요: ${addr}`, '카카오');
  const near = `x=${doc.x}&y=${doc.y}&radius=1500&sort=distance`;
  const out: NearbyArea[] = [];
  const add = (docs: any[], kind: string, keep: (d: any) => boolean, maxDist: number) => {
    for (const d of docs) {
      const dist = Number(d.distance);
      if (!keep(d) || dist > maxDist) continue;
      const name = shortName(d.place_name, kind, regionWords);
      if (name.length >= 2 && !GENERIC.test(name)) out.push({ name, kind, distance: dist, source: 'kakao' });
    }
  };
  add(await pages(`https://dapi.kakao.com/v2/local/search/category.json?category_group_code=SC4&${near}`, key, signal), '학교', (d) => /초등학교$/.test(d.place_name), 1000);
  add(await pages(`https://dapi.kakao.com/v2/local/search/category.json?category_group_code=PS3&${near}`, key, signal), '유치원', (d) => /유치원$/.test(d.place_name), 800);
  add(await pages(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent('아파트')}&${near}`, key, signal), '아파트',
    (d) => /아파트/.test(d.category_name) && !/상가|관리사무소|동$|주차장/.test(d.place_name), 500);
  add(await pages(`https://dapi.kakao.com/v2/local/search/category.json?category_group_code=SW8&${near}`, key, signal), '지하철역', () => true, 1000);
  // 아파트 이름 앞의 동네 · 역 이름 떼기 ("보라매롯데낙천대" → "롯데낙천대") — 1버전 규칙
  const local = [...regionWords, ...out.filter((a) => a.kind === '지하철역').map((a) => a.name.replace(/역$/, ''))].filter((w) => w.length >= 2).sort((a, b) => b.length - a.length);
  const cleaned = out.map((a) => ({ ...a, name: cleanAreaName(a.name, a.kind, local) })).filter((a) => !/및/.test(a.name));
  const seen = new Set<string>();
  return cleaned.filter((a) => (seen.has(a.name) ? false : (seen.add(a.name), true)));
}

// 제목 머리말 후보: 동네 → 아파트("[○○아파트 유치원]") → 직접 적은 이름 → 학교 · 역("○○ 근처")
export function prefixOptions(region: string, areas: NearbyArea[]) {
  const r = dongOf(region);
  const rank = (k: string) => (k === '아파트' ? 0 : k === '학교' || k === '지하철역' || k === '유치원' ? 2 : 1);
  const sorted = [...areas].sort((a, b) => rank(a.kind) - rank(b.kind));
  return [...new Set([...(r ? [`[${r} ${APP.term}]`] : []), ...sorted.map((a) => (a.kind === '아파트' && a.source === 'kakao' ? kinderPrefix(a.name, true) : rank(a.kind) === 2 ? `[${a.name} 근처 ${APP.term}]` : kinderPrefix(a.name, false)))])];
}
