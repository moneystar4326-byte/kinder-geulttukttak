// 사진 폴더로 글쓰기 (태권 글뚝딱 2.5.0~2.7.10에서 옮김) — 화면 · 메인 · 시험이 같이 쓰는 규칙
// 유치원판: 아이들이 만 3~5세라 얼굴 가림은 찾은 얼굴 모두 기본으로 켜고, 원장님 · 선생님이 사진마다 확인해야 넣을 수 있어요.
// 사진 자체는 OpenAI로 보내지 않아요 (AI에는 장면 글자만 가요)
import type { ArticleDoc, PhotoRegion } from './types';
import { childNames } from './validation';

// 사진으로 글쓰기 메뉴. 숨기려면 false
export const PHOTO_MENU_ON = true;
export const MAX_PHOTOS = 10;
export const PHOTO_EXT = /\.(jpe?g|png)$/i;
export const HEIC_EXT = /\.(heic|heif)$/i;
export const OUTPUT_LONG_SIDE = 2048;

// ---------- 파일 이름 → 장면 제목 ----------
const COPY_MARK = /(\s*\(\d+\)|\s*-\s*복사본(\s*\(\d+\))?|\s+복사본|\s*-\s*copy(\s*\(\d+\))?)$/i;
// 기기 이름 뒤에 숫자가 오거나 그것만 있을 때만 (2026-11-16 백테스트: "사진 찍어 줄게 하니 브이"를 장면 없는 사진으로 봄)
const DEVICE_NAME = /^(img|dsc|dscn|dcim|pxl|mvimg|photo|image|kakaotalk|screenshot|스크린샷|사진|제목\s*없음|새\s*폴더)([\s_-]*\d|\s*$)/i;

export function sceneFromName(fileName: string) {
  let base = fileName.replace(/\.[^.]+$/, '').normalize('NFC').trim();
  for (let i = 0; i < 3 && COPY_MARK.test(base); i++) base = base.replace(COPY_MARK, '').trim();
  const m = base.match(/^(\d{1,3})\s*[_.)\-]\s*(.+)$/);
  const order = m ? Number(m[1]) : null;
  const title = (m ? m[2] : base).replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  const hangul = (title.match(/[가-힣]/g) ?? []).length;
  return { order, title: title.slice(0, 100), needsTitle: hangul < 2 || DEVICE_NAME.test(title) };
}

// ---------- 같은 사진 하나로 (2026-11-16 사용자: 폴더 사진이 다 안 나옴 → 이름만 다르고 내용이 같은 사진이 있었음) ----------
// 내용이 같은 사진은 처음 것만 목록에 두고, 나머지 파일 이름은 안내에 씀. 해시가 없는 사진(복사 중 · 읽기 실패)은 그대로
export function dedupePhotos<T extends { hash: string; name: string }>(list: T[]): { photos: T[]; dups: { kept: string; same: string[] }[] } {
  const first = new Map<string, T>();
  const same = new Map<string, string[]>();
  const photos: T[] = [];
  for (const p of list) {
    if (!p.hash) { photos.push(p); continue; }
    const k = first.get(p.hash);
    if (!k) { first.set(p.hash, p); photos.push(p); continue; }
    same.set(p.hash, [...(same.get(p.hash) ?? []), p.name]);
  }
  return { photos, dups: [...same].map(([h, names]) => ({ kept: first.get(h)!.name, same: names })) };
}

// ---------- 짧은 장면 다시 묻기 (2026-11-16 사용자: "찰칵"처럼 짧게 넣으면 재료가 부족 → 구체적으로 다시 물어봄) ----------
export const SHORT_SCENE_CHARS = 15; // 글 점검의 "장면이 짧아요" 안내와 같은 기준
export const SCENE_MAX = 200; // 장면 + 더 적은 내용
export const shortScene = (title: string) => title.replace(/\s/g, '').length < SHORT_SCENE_CHARS;
export const sceneAnswered = (extra?: string) => (extra ?? '').replace(/\s/g, '').length >= 5;
// 장면 칸에 더 적은 내용을 붙여 AI에게 보낼 장면 한 줄로 (마침표가 없으면 붙임)
export function sceneWithDetail(title: string, extra?: string) {
  const t = title.trim();
  const x = (extra ?? '').trim();
  if (!x) return t.slice(0, SCENE_MAX);
  return `${/[.!?…]$/.test(t) ? t : `${t}.`} ${x}`.slice(0, SCENE_MAX);
}

// ---------- 아이 이름처럼 보이는 말 (경고용. 오탐은 "이름 아님"으로 넘김) ----------
const SURNAMES = '김이박최정강조윤장임한오서신권황안송류유홍전고문양손배백허남심노하곽성차주우구민진지엄채원천방공현함변염여추도석선설마길위연명기라표';
// 유치원판: 유치원 글에 자주 나오는 말 (선생님 · 반 이름 · 놀이 · 먹거리)을 이름으로 잡지 않게 더함
const COMMON = new Set(['아이', '아이들', '친구', '친구들', '학생', '학생들', '어린이', '어린이들', '우리', '모두', '선생님', '원장님', '원감님', '담임', '유아', '유아들', '원아', '원아들', '유치원', '단체', '오늘의', '한마음', '고무줄', '마무리', '하나둘', '장애물', '안정감', '성취감', '자신감', '장난감', '도시락', '주먹밥', '고구마', '도토리', '민들레', '방과후', '공놀이', '모래성', '송편을', '김장을', '김치를', '준비를', '정리를', '연습을', '선물을',
  '모든', '다른', '여러', '같은', '새로운', '어린', '작은', '많은', '처음', '함께', '단짝', '옆자리', '동생', '동생들', '형님', '형님들', '언니', '언니들', '오빠', '오빠들', '누나', '누나들', '친한', '몇몇', '다섯', '여섯', '일곱', '여덟', '아홉', '우리반', '옆반', '동갑', '귀여운', '씩씩한', '멋진', '또한', '이런', '그런', '저런', '어떤', '이번', '지난', '오늘', '모두의']);
const HONORIFIC = /([가-힣]{2,4})\s*(어린이|학생|군|양|친구)(?=$|[\s,.!?은는이가을를의와과도])/g;
const ENDS_LIKE_JOSA = /[은는이가을를의와과도로에만한할된던서고며면게지요다기]$/; // 조사 · 어미로 끝나면 이름이 아닌 것으로 봄 (연습한 · 정확히 · 준비기)
// 반 이름 ("햇살반", "7세반") · 높임 ("선생님") · 여럿 ("형님들")은 이름이 아님
const NOT_PERSON = (w: string) => COMMON.has(w) || /(반|님|들)$/.test(w) || /^님/.test(w);

export function suspectNames(text: string): string[] {
  const t = text.normalize('NFC');
  const out = new Set<string>();
  for (const m of t.matchAll(HONORIFIC)) if (!NOT_PERSON(m[1])) out.add(m[1]);
  for (const w of t.split(/[^가-힣]+/)) {
    if (w.length === 3 && SURNAMES.includes(w[0]) && !ENDS_LIKE_JOSA.test(w) && !NOT_PERSON(w)) out.add(w);
  }
  // 유치원판: "민준이가", "지우는"처럼 이름 + 조사 (메모 검사와 같은 규칙)
  for (const n of childNames(t)) out.add(n);
  return [...out];
}
// 생성된 본문은 호칭이 붙은 것만 봄 (본문의 세 글자 낱말은 거의 이름이 아님)
export function namesInBody(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.normalize('NFC').matchAll(HONORIFIC)) if (!NOT_PERSON(m[1])) out.add(m[1]);
  return [...out];
}

// 장면 칸에 적힌 아이 이름 후보 (2026-11-05 실제 글: "○○이 할머니"가 본문에 그대로 나감 · 호칭이 없어 위 검사로 못 잡음)
const RELATIVE = /([가-힣]{2,3}?)이?의?\s*(?:할머니|할아버지|엄마|아빠|어머니|아버지|언니|오빠|누나|형|동생)/g;
const AFTER_AGE = /\d+\s*(?:살|세)\s+([가-힣]{2,3}?)(?:이가|이는|이도|가|는|은|이)?(?=\s|$)/g;
const VERB_END = /(던|는|을|된|하던|있는|없는)$/;
// 장면 칸에 자주 쓰는 세 글자 낱말: 이름으로 잡으면 본문의 "선생님"이 "한 친구"로 바뀜 (태권판 리뷰 2026-11-08)
const NOT_NAME = new Set(['선생님', '원장님', '원감님', '마지막', '여러분', '하나씩', '고마워', '친구들', '아이들', '어린이', '유치원', '다같이', '오늘도', '형님들', '동생들', '언니들', '오빠들']);
// 이름일 수밖에 없는 모양: "민준이가" · "6살 규희" · "○○이 할머니" · "○○ 어린이"
function strongNames(t: string): Set<string> {
  const out = new Set<string>();
  for (const m of t.matchAll(HONORIFIC)) if (!NOT_PERSON(m[1])) out.add(m[1]);
  for (const n of childNames(t)) out.add(n);
  for (const re of [RELATIVE, AFTER_AGE]) for (const m of t.matchAll(re)) if (!NOT_PERSON(m[1])) out.add(m[1]);
  return out;
}
// notNames: 원장님 · 선생님이 [이름 아님]을 누른 말 (2026-11-16 백테스트: "배추잎"을 이름으로 보고 "한 친구 사이에"로 바꿈)
// [이름 아님]은 성씨 글자로만 잡은 세 글자 낱말에만 통함. 이름일 수밖에 없는 모양("민준이가" · "6살 규희")은 눌러도 계속 가림 (잘못 눌러도 아이 이름이 나가지 않게)
export function namesFromScenes(titles: string[], notNames: string[] = []): string[] {
  const out = new Set<string>();
  const strong = new Set<string>();
  for (const raw of titles) {
    const t = raw.normalize('NFC');
    for (const n of suspectNames(t)) if (!VERB_END.test(n)) out.add(n); // "물 마시던 친구"의 "마시던"은 이름이 아님
    for (const n of strongNames(t)) if (!VERB_END.test(n)) { out.add(n); strong.add(n); }
  }
  return [...out].filter((n) => !NOT_NAME.has(n) && !NOT_PERSON(n) && (strong.has(n) || !notNames.includes(n)));
}
export function scenesNamesInBody(text: string, titles: string[], notNames: string[] = []): string[] {
  const t = text.normalize('NFC');
  return namesFromScenes(titles, notNames).filter((n) => new RegExp(`(?<![가-힣])${n}(?:이가|이는|이도|이의|이|가|은|는|을|를|의|와|과|도|에게|한테)?(?![가-힣])`).test(t));
}

// AI가 장면 칸의 이름을 그대로 쓰면 코드가 "한 친구"로 바꿈 (앞의 나이도 함께). 안내를 해도 이름이 들어가는 일이 있어서
export function hideSceneNames<T extends { sections: { heading?: string; paragraphs: string[] }[] }>(doc: T, titles: string[], notNames: string[] = []): T {
  const names = namesFromScenes(titles, notNames);
  if (!names.length) return doc;
  const one = (t: string) => names.reduce((s, n) => s.replace(new RegExp(`(?:\\d+\\s*(?:살|세)\\s+)?(?<![가-힣])${n}(이가|이는|이도|이의|이|가|은|는|을|를|의|와|과|도|에게|한테)?(?![가-힣])`, 'g'), (_m, j?: string) => {
    const josa = (j ?? '').replace(/^이(?=[가는도의])/, '');
    return `한 친구${josa === '이' ? '가' : josa === '은' ? '는' : josa === '을' ? '를' : josa === '과' ? '와' : josa}`;
  }), t);
  return { ...doc, sections: doc.sections.map((x) => ({ ...x, heading: x.heading ? one(x.heading) : x.heading, paragraphs: x.paragraphs.map(one) })) };
}

// 얼굴 가림 모양 (태권판 2026-11-05 사용자: 귀여운 동물로). 동물도 아래에 모자이크를 먼저 칠함 (둥근 그림 모서리로 얼굴이 보이지 않게)
export type PhotoCover = 'animal' | 'mosaic';
// 한 사진 안에서는 다른 동물, 사진마다 시작이 다름
export const animalIndex = (region: number, photoIdx: number, count: number) => (region + photoIdx * 3) % count;
export const ANIMAL_COVER_SCALE = 0.85; // 칸의 긴 변 기준 (칸은 얼굴의 1.6배라 동물은 얼굴의 약 1.36배. 2026-11-06 사용자: 1.15는 너무 큼. 남는 틈은 아래 모자이크가 막음)

// ---------- 글 ↔ 사진 연결 ----------
export function photoLinkErrors(doc: Pick<ArticleDoc, 'sections'>, ids: string[]): string[] {
  const want = new Set(ids);
  const seen = new Map<string, number>();
  for (const s of doc.sections) if (s.photoId) seen.set(s.photoId, (seen.get(s.photoId) ?? 0) + 1);
  const errors: string[] = [];
  for (const id of ids) if (!seen.has(id)) errors.push(`글에 연결되지 않은 사진이 있어요 (${id})`);
  for (const [id, n] of seen) {
    if (!want.has(id)) errors.push(`글에 없는 사진 번호가 들어 있어요 (${id})`);
    else if (n > 1) errors.push(`같은 사진이 ${n}번 연결됐어요 (${id})`);
  }
  return errors;
}
// 다듬기 AI는 사진 번호를 모름 → 섹션 id 로 다시 붙임 (AI가 섹션을 없애면 위 검사가 잡음)
export function keepPhotoLinks<T extends Pick<ArticleDoc, 'sections'>>(before: Pick<ArticleDoc, 'sections'>, after: T): T {
  const byId = new Map(before.sections.map((s) => [s.id, s.photoId]));
  return { ...after, sections: after.sections.map((s) => { const { photoId: _p, ...rest } = s; const id = byId.get(s.id); return id ? { ...rest, photoId: id } : rest; }) };
}
export function photoStory(topic: string, scenes: { title: string }[]) {
  return [`오늘 글의 주제: ${topic.trim()}`, ...scenes.map((s, i) => `장면 ${i + 1}: ${s.title}`)].join('\n');
}

// ---------- 얼굴 영역 (사진 크기에 대한 비율 0~1) ----------
export type Box = { x: number; y: number; w: number; h: number };
export const MIN_FACE_SCORE = 0.3; // 놓치는 것보다 많이 가리는 쪽 (잘못 가린 곳은 눌러서 지움). 유치원판도 같은 값 (낮출수록 매트 · 벽 무늬를 더 가림)
export const TURNED_MIN = 0.5; // 돌려서 찾은 전체 검사 결과의 최소 점수 (물구나무 얼굴 0.92~0.98, 착각 0.31~0.42)
export interface FaceCandidate extends Box { score: number; from: 'whole' | 'tile'; quarter: 0 | 1 | 2 | 3; check?: number } // check = 후보 둘레를 크게 잘라 다시 찾은 점수

// 후보 중 얼굴로 볼 것: 정방향 전체 검사는 그대로, 돌려서 찾은 것은 점수가 높거나 2차 확인이 높을 때, 조각 검사는 2차 확인을 통과한 것만
export function isFace(f: FaceCandidate) {
  if (f.from === 'tile') return (f.check ?? 0) >= MIN_FACE_SCORE;
  return f.quarter === 0 || f.score >= TURNED_MIN || (f.check ?? 0) >= TURNED_MIN;
}

// 돌려서 찾은 얼굴 위치를 원래 사진 기준으로 되돌림. quarter = 시계 방향으로 돌린 횟수 (0~3)
export function unrotateBox(b: Box, quarter: 0 | 1 | 2 | 3): Box {
  if (quarter === 0) return { x: b.x, y: b.y, w: b.w, h: b.h };
  if (quarter === 1) return { x: b.y, y: 1 - b.x - b.w, w: b.h, h: b.w };
  if (quarter === 2) return { x: 1 - b.x - b.w, y: 1 - b.y - b.h, w: b.w, h: b.h };
  return { x: 1 - b.y - b.h, y: b.x, w: b.h, h: b.w };
}
export function expandBox(b: Box, ratio = 0.3): Box {
  const x = Math.max(0, b.x - b.w * ratio), y = Math.max(0, b.y - b.h * ratio);
  const r = Math.min(1, b.x + b.w * (1 + ratio)), bt = Math.min(1, b.y + b.h * (1 + ratio));
  return { x, y, w: r - x, h: bt - y };
}
// 모자이크 칸 크기 (출력 픽셀): 얼굴 폭의 1/6, 최소 12px
export const blockSize = (boxWidthPx: number) => Math.max(boxWidthPx / 6, 12);

// 큰 사진은 칸으로 나눠 찾음: 통째로 줄이면 뒷줄 얼굴이 작아져 못 찾음 (사진분류 실험: 30명 중 7명 → 칸 나누면 29명)
export function tilesFor(w: number, h: number, overlap = 0.15) {
  const long = Math.max(w, h);
  if (long <= 900) return [] as { x: number; y: number; w: number; h: number }[];
  const target = Math.min(1000, Math.max(512, Math.round(long / 6))); // 감지 모델은 칸을 512px 로 줄여서 봄 → 칸이 작을수록 작은 얼굴을 찾음
  const step = target * (1 - overlap);
  const cols = Math.max(1, Math.ceil((w - target * overlap) / step)), rows = Math.max(1, Math.ceil((h - target * overlap) / step));
  const out: { x: number; y: number; w: number; h: number }[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const tw = Math.min(target, w), th = Math.min(target, h);
    const x = cols === 1 ? 0 : Math.round((w - tw) * c / (cols - 1));
    const y = rows === 1 ? 0 : Math.round((h - th) * r / (rows - 1));
    out.push({ x, y, w: tw, h: th });
  }
  return out;
}
// 칸 경계에서 두 번 잡힌 얼굴 합치기 (점수 높은 쪽 남김)
export function mergeBoxes<T extends Box & { score: number }>(boxes: T[]): T[] {
  const area = (b: Box) => b.w * b.h;
  const inter = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const keep: T[] = [];
  for (const b of [...boxes].sort((a, c) => c.score - a.score)) {
    if (!keep.some((k) => { const i = inter(k, b); return i / Math.min(area(k), area(b)) > 0.6 || i / (area(k) + area(b) - i) > 0.3; })) keep.push(b);
  }
  return keep;
}
export const cleanRegions = (rs: PhotoRegion[]) => rs.filter((r) => r.w > 0.002 && r.h > 0.002).map((r) => {
  const x = Math.min(1, Math.max(0, r.x)), y = Math.min(1, Math.max(0, r.y));
  return { ...r, x, y, w: Math.min(1 - x, r.w), h: Math.min(1 - y, r.h) };
});

// ---------- JPEG 읽기 (촬영 날짜 · 메타데이터 확인) ----------
function* jpegSegments(b: Uint8Array) {
  if (b[0] !== 0xff || b[1] !== 0xd8) return;
  let i = 2;
  while (i + 4 <= b.length && b[i] === 0xff) {
    const marker = b[i + 1];
    if (marker === 0xda || marker === 0xd9) return; // 이미지 본문 시작
    const len = (b[i + 2] << 8) | b[i + 3];
    yield { marker, start: i + 4, end: i + 2 + len };
    i += 2 + len;
  }
}
export const isJpeg = (b: Uint8Array) => b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
// 처리본에 촬영 정보(APP1 EXIF · XMP, APP13 IPTC, 주석)가 남았는지. APP0(JFIF) · APP2(색 정보) · APP14 는 그림 형식 정보라 괜찮음
export function jpegHasMetadata(b: Uint8Array) {
  for (const s of jpegSegments(b)) if (s.marker === 0xe1 || s.marker === 0xed || s.marker === 0xfe) return true;
  return false;
}
// EXIF 촬영 시각 "YYYY-MM-DD HH:MM:SS" (없으면 null)
export function exifDate(b: Uint8Array): string | null {
  for (const s of jpegSegments(b)) {
    if (s.marker !== 0xe1 || String.fromCharCode(...b.subarray(s.start, s.start + 4)) !== 'Exif') continue;
    const t = s.start + 6;
    if (t + 8 > b.length) return null;
    const le = b[t] === 0x49;
    const u16 = (o: number) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
    const u32 = (o: number) => (le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0 : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0);
    const read = (ifd: number, tag: number) => {
      if (ifd + 2 > b.length) return null;
      const n = u16(ifd);
      for (let i = 0; i < n; i++) {
        const e = ifd + 2 + i * 12;
        if (e + 12 > b.length) return null;
        if (u16(e) === tag) return e;
      }
      return null;
    };
    const text = (e: number | null) => {
      if (e == null) return null;
      const at = t + u32(e + 8);
      const v = String.fromCharCode(...b.subarray(at, at + 19));
      return /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(v) ? `${v.slice(0, 10).replace(/:/g, '-')}${v.slice(10)}` : null;
    };
    const ifd0 = t + u32(t + 4);
    const sub = read(ifd0, 0x8769);
    return (sub != null ? text(read(t + u32(sub + 8), 0x9003)) : null) ?? text(read(ifd0, 0x0132));
  }
  return null;
}

// 줄글로 쓴 사진 글 (유치원판은 글을 줄글로 쓰고 코드가 소제목으로 나눔): 소제목 줄 맨 앞의 [p01] 표시를 사진 번호로 바꾸고 표시는 지움
// 글 속에 잘못 들어간 표시도 지움 (사진 번호가 블로그 글에 보이지 않게)
const PHOTO_MARK = /^\s*[[(]?\s*(p\d{2})\s*[\])]?\s*[:·.\-]?\s*/i;
export function takePhotoMarks<T extends { heading?: string; paragraphs: string[] }>(sections: T[], ids: string[]): (T & { photoId?: string })[] {
  const want = new Set(ids);
  const clean = (t: string) => t.replace(/\s*\[\s*p\d{2}\s*\]\s*/gi, ' ').replace(/ {2,}/g, ' ').trim();
  return sections.map((s) => {
    const paragraphs = s.paragraphs.map(clean).filter(Boolean);
    const m = s.heading?.match(PHOTO_MARK);
    if (!m) return { ...s, paragraphs };
    const id = m[1].toLowerCase();
    const heading = clean(s.heading!.slice(m[0].length));
    return want.has(id) ? { ...s, heading, paragraphs, photoId: id } : { ...s, heading, paragraphs };
  });
}
