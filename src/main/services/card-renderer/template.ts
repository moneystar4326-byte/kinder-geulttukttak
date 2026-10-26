// 카드 HTML 틀 (기획서 7.1). 배경 · 한글 · 로고는 서로 다른 층.
// 글자가 넘치면 자동으로 줄이지 않고 overflow 로 알려 문구를 줄이게 함 (measure 스크립트)
import { pathToFileURL } from 'node:url';
import type { CardCopy, CardSize, CardStyle } from '../../../shared/types';
import { IND, isDaycare } from '../../../shared/industry';

export interface CardLayerInput {
  copy: CardCopy;
  index: number; // 0..2
  style: CardStyle;
  size: CardSize;
  brand: { main: string; accent: string };
  dojoName: string;
  logoFile?: string;
  logoScale?: number; // % (60~200, 기본 120)
  backgroundFile?: string; // 없으면 템플릿 배경 (CSS)
  fontDir: string;
}

export const SAFE = 72; // 안전 여백 시작값
// 로고 높이: 100% = 64px, 도장 정보에서 60~200% (2026-10-22 파일럿: 로고가 너무 작음)
export const logoHeight = (scale = 120) => Math.round(64 * Math.min(200, Math.max(60, scale)) / 100);
export const sizeOf = (s: CardSize) => (s === '1080x1080' ? { w: 1080, h: 1080 } : { w: 1080, h: 1350 });
export const layoutOf = (style: CardStyle): 'top-text' | 'bottom-text' => (style === '깔끔한 정보형' ? 'bottom-text' : 'top-text');

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const color = (c: string, d: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : d);
const furl = (f: string) => pathToFileURL(f).href;

// 띠 모양 줄 장식 (검정 + 강조색 = 태권도 띠). 어린이집판은 강조색 한 줄 · 제목은 굵은 본문 글꼴 (2026-10-27 기획안 v0.2 8장)
const stripe = (accent: string) => (isDaycare ? accent : `linear-gradient(180deg,#111 0 50%,${accent} 50% 100%)`);
const titleFont = (style: CardStyle) => (style === '교육 잡지형' || isDaycare ? 'NotoKR;font-weight:900' : 'BHS');

// 템플릿 배경: AI 그림 없이 CSS 모양만 (AI 생성이라고 표시하지 않음)
function templateBg(style: CardStyle, main: string, accent: string, index: number) {
  const tilt = [-12, 8, -4][index] ?? 0;
  if (style === '교육 잡지형') return `
    <div class="bg" style="background:#F6F1E7"></div>
    <div class="shape" style="right:-160px;bottom:-120px;width:760px;height:760px;border-radius:50%;background:${main};opacity:.12"></div>
    <div class="shape" style="left:${SAFE}px;bottom:${SAFE + 40}px;width:420px;height:22px;background:${stripe(accent)};transform:rotate(${tilt}deg);border-radius:4px"></div>`;
  if (style === '따뜻한 일러스트') return `
    <div class="bg" style="background:linear-gradient(170deg,#FFF6EC 0%,#FDE7D3 100%)"></div>
    <div class="shape" style="left:-120px;bottom:-160px;width:640px;height:640px;border-radius:50%;background:${accent};opacity:.14"></div>
    <div class="shape" style="right:-80px;bottom:120px;width:420px;height:420px;border-radius:50%;background:${main};opacity:.12"></div>
    <div class="shape" style="right:${SAFE + 20}px;bottom:${SAFE + 60}px;width:360px;height:26px;background:${stripe(accent)};transform:rotate(${tilt}deg);border-radius:6px"></div>`;
  return `
    <div class="bg" style="background:#FFFFFF"></div>
    <div class="shape" style="left:0;right:0;top:0;height:55%;background:linear-gradient(160deg,${main} 0%,${main}CC 100%)"></div>
    <div class="shape" style="right:${SAFE}px;top:${SAFE + 40}px;width:300px;height:300px;border-radius:50%;border:24px solid #ffffff33"></div>`;
}

// AI 그림 카드: 위 = 그림만, 아래 = 글만 (겹치지 않게). 2026-10-18 실사용: 글 상자가 아이 얼굴을 가림
export const SPLIT_IMAGE_RATIO = { '1080x1350': 0.6, '1080x1080': 0.56 } as const; // 정사각형은 가로 그림이 덜 잘리게 조금 더 크게
function splitHtml(c: CardLayerInput) {
  const { w, h } = sizeOf(c.size);
  const main = color(c.brand.main, IND.brand.main), accent = color(c.brand.accent, IND.brand.accent);
  const imgH = Math.round(h * SPLIT_IMAGE_RATIO[c.size]);
  const logoH = logoHeight(c.logoScale);
  const foot = c.logoFile ? logoH + 40 : 104; // 로고가 커지면 글 상자가 그만큼 비켜 줌
  const boxTop = imgH + 40;
  const boxH = h - boxTop - foot;
  const sq = c.size === '1080x1080';
  const titleSize = sq ? 56 : 64, subSize = sq ? 32 : 36;
  const paper = c.style === '깔끔한 정보형' ? '#FFFFFF' : c.style === '교육 잡지형' ? '#F6F1E7' : '#FFF8EF';
  const font = c.fontDir;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:NotoKR;font-weight:400;src:url(${furl(`${font}/noto-sans-kr-korean-400-normal.woff2`)}) format('woff2'),url(${furl(`${font}/noto-sans-kr-latin-400-normal.woff2`)}) format('woff2')}
@font-face{font-family:NotoKR;font-weight:700;src:url(${furl(`${font}/noto-sans-kr-korean-700-normal.woff2`)}) format('woff2'),url(${furl(`${font}/noto-sans-kr-latin-700-normal.woff2`)}) format('woff2')}
@font-face{font-family:NotoKR;font-weight:900;src:url(${furl(`${font}/noto-sans-kr-korean-900-normal.woff2`)}) format('woff2'),url(${furl(`${font}/noto-sans-kr-latin-900-normal.woff2`)}) format('woff2')}
@font-face{font-family:BHS;src:url(${furl(`${font}/black-han-sans-korean-400-normal.woff2`)}) format('woff2'),url(${furl(`${font}/black-han-sans-latin-400-normal.woff2`)}) format('woff2')}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${w}px;height:${h}px;overflow:hidden;background:${paper}}
#c{position:relative;width:${w}px;height:${h}px;overflow:hidden;font-family:NotoKR,sans-serif;color:#1A1A1A;background:${paper}}
#img{position:absolute;left:0;top:0;width:${w}px;height:${imgH}px;object-fit:cover;object-position:center ${sq ? '30%' : '40%'}}
#band{position:absolute;left:0;right:0;top:${imgH}px;height:10px;background:${isDaycare ? `linear-gradient(90deg,${main} 0 50%,${accent} 50% 100%)` : `linear-gradient(90deg,#111 0 50%,${accent} 50% 100%)`}}
#num{position:absolute;left:${SAFE}px;top:${imgH - 30}px;font:700 28px NotoKR;color:#fff;background:${accent};border-radius:999px;padding:8px 22px;box-shadow:0 4px 14px rgba(0,0,0,.2)}
#box{position:absolute;left:${SAFE}px;right:${SAFE}px;top:${boxTop}px;max-height:${boxH}px;overflow:hidden}
#title{font-family:${titleFont(c.style)};font-size:${titleSize}px;line-height:1.22;word-break:keep-all;overflow-wrap:anywhere;color:${c.style === '깔끔한 정보형' ? main : '#1A1A1A'}}
#rule{width:80px;height:7px;background:${accent};margin:20px 0 18px;border-radius:4px}
#sub{font-size:${subSize}px;line-height:1.55;word-break:keep-all;overflow-wrap:anywhere;color:#333}
#foot{position:absolute;left:${SAFE}px;right:${SAFE}px;bottom:${SAFE - 40}px;height:${c.logoFile ? logoH : 56}px;display:flex;align-items:center}
#name{font:700 30px NotoKR;color:${main}}
#logo{height:${logoH}px;max-width:${Math.round(w / 2)}px;object-fit:contain;object-position:left center}
</style></head><body><div id="c">
<img id="img" src="${furl(c.backgroundFile!)}">
<div id="band"></div><div id="num">${c.index + 1} / 3</div>
<div id="box"><div id="title">${esc(c.copy.title)}</div><div id="rule"></div><div id="sub">${esc(c.copy.sub)}</div></div>
<div id="foot">${c.logoFile ? `<img id="logo" src="${furl(c.logoFile)}">` : `<div id="name">${esc(c.dojoName)}</div>`}</div>
</div></body></html>`;
}

export function cardHtml(c: CardLayerInput) {
  if (c.backgroundFile) return splitHtml(c);
  const { w, h } = sizeOf(c.size);
  const main = color(c.brand.main, IND.brand.main), accent = color(c.brand.accent, IND.brand.accent);
  const layout = layoutOf(c.style);
  const font = c.fontDir;
  // 2026-10-27 카드 글이 2문장 60~110자로 길어짐 → 80자가 넘으면 한 단계 작은 글자 (AI 그림 카드 틀은 그대로 들어감)
  const long = [...c.copy.sub].length > 80;
  const titleSize = c.size === '1080x1080' ? (long ? 66 : 76) : long ? 74 : 84;
  const subSize = c.size === '1080x1080' ? (long ? 32 : 38) : long ? 36 : 42;
  // 글자 상자 높이 상한 (나머지는 그림이 보이는 곳). 아래 상자는 안쪽 여백이 있어 조금 더 크게
  const onImage = !!c.backgroundFile;
  // 흰 판(안쪽 여백 88px)이 있으면 그만큼 더 줌 (2026-10-18 실사용: 여백만큼 넘침으로 잘못 판정)
  const boxH = Math.round(h * (layout === 'top-text' ? (onImage ? 0.5 : 0.45) : c.size === '1080x1080' ? 0.57 : 0.52));
  const textColor = c.style === '깔끔한 정보형' ? '#111827' : '#1A1A1A';
  const panel = onImage || c.style === '깔끔한 정보형';
  const logoH = logoHeight(c.logoScale);
  const footH = c.logoFile ? logoH + (onImage ? 12 : 0) : 56;
  const boxPos = layout === 'top-text' ? `top:${SAFE}px` : `bottom:${Math.max(SAFE + 56, SAFE - 30 + footH + 14)}px`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:NotoKR;font-weight:400;src:url(${furl(`${font}/noto-sans-kr-korean-400-normal.woff2`)}) format('woff2'),url(${furl(`${font}/noto-sans-kr-latin-400-normal.woff2`)}) format('woff2')}
@font-face{font-family:NotoKR;font-weight:700;src:url(${furl(`${font}/noto-sans-kr-korean-700-normal.woff2`)}) format('woff2'),url(${furl(`${font}/noto-sans-kr-latin-700-normal.woff2`)}) format('woff2')}
@font-face{font-family:NotoKR;font-weight:900;src:url(${furl(`${font}/noto-sans-kr-korean-900-normal.woff2`)}) format('woff2'),url(${furl(`${font}/noto-sans-kr-latin-900-normal.woff2`)}) format('woff2')}
@font-face{font-family:BHS;src:url(${furl(`${font}/black-han-sans-korean-400-normal.woff2`)}) format('woff2'),url(${furl(`${font}/black-han-sans-latin-400-normal.woff2`)}) format('woff2')}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${w}px;height:${h}px;overflow:hidden;background:#fff}
#c{position:relative;width:${w}px;height:${h}px;overflow:hidden;font-family:NotoKR,sans-serif;color:${textColor}}
.bg,.shape{position:absolute}.bg{inset:0}
#img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center ${layout === 'top-text' ? 'bottom' : 'top'}}
#box{position:absolute;left:${SAFE}px;right:${SAFE}px;${boxPos};max-height:${boxH}px;overflow:hidden;
  ${panel ? `background:rgba(255,255,255,.92);border-radius:28px;padding:44px 48px;box-shadow:0 10px 40px rgba(0,0,0,.12);` : 'padding:12px 0;'}}
#num{display:inline-block;font:700 28px NotoKR;color:#fff;background:${accent};border-radius:999px;padding:6px 20px;margin-bottom:26px}
#title{font-family:${titleFont(c.style)};font-size:${titleSize}px;line-height:1.22;word-break:keep-all;overflow-wrap:anywhere;color:${c.style === '깔끔한 정보형' ? main : textColor}}
#rule{width:96px;height:8px;background:${accent};margin:30px 0 26px;border-radius:4px}
#sub{font-size:${subSize}px;line-height:1.55;font-weight:400;word-break:keep-all;overflow-wrap:anywhere;color:#333}
#foot{position:absolute;left:${SAFE}px;right:${SAFE}px;bottom:${SAFE - 30}px;height:${footH}px;display:flex;align-items:center;justify-content:space-between}
#name{font:700 30px NotoKR;color:${onImage ? '#fff' : main};${onImage ? 'text-shadow:0 2px 10px rgba(0,0,0,.45)' : ''}}
#logo{box-sizing:border-box;height:${footH}px;max-width:${Math.round(w / 2)}px;object-fit:contain;${onImage ? 'background:rgba(255,255,255,.92);border-radius:12px;padding:6px 12px;' : ''}}
#page{font:700 26px NotoKR;color:${onImage ? '#fff' : '#888'}}
</style></head><body><div id="c">
${onImage ? `<img id="img" src="${furl(c.backgroundFile!)}">` : templateBg(c.style, main, accent, c.index)}
<div id="box"><div id="num">${c.index + 1} / 3</div><div id="title">${esc(c.copy.title)}</div><div id="rule"></div><div id="sub">${esc(c.copy.sub)}</div></div>
<div id="foot">${c.logoFile ? `<img id="logo" src="${furl(c.logoFile)}">` : `<div id="name">${esc(c.dojoName)}</div>`}</div>
</div></body></html>`;
}

// 렌더러가 페이지 안에서 실행: 폰트 로딩 후 넘침 · 안전 여백 검사
export const MEASURE_JS = `(async () => {
  // 쓰지 않는 글꼴은 늦게 불러오므로 명시적으로 불러온 뒤 확인
  await Promise.all(['84px BHS', '400 42px NotoKR', '700 42px NotoKR', '900 42px NotoKR'].map((f) => document.fonts.load(f, '가A').catch(() => null)));
  await document.fonts.ready;
  const imgs = Array.from(document.images);
  await Promise.all(imgs.map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })));
  const box = document.getElementById('box');
  const W = document.getElementById('c').clientWidth, H = document.getElementById('c').clientHeight;
  const r = box.getBoundingClientRect();
  const lines = (id) => { const e = document.getElementById(id); const lh = parseFloat(getComputedStyle(e).lineHeight); return Math.round(e.getBoundingClientRect().height / lh); };
  const broken = imgs.filter((i) => !i.naturalWidth).map((i) => i.id);
  const fontsOk = document.fonts.check('84px BHS', '가') && document.fonts.check('42px NotoKR', '가');
  return {
    overflow: box.scrollHeight > box.clientHeight + 1 || r.left < ${SAFE - 1} || r.right > W - ${SAFE - 1} || r.top < 0 || r.bottom > H,
    titleLines: lines('title'), subLines: lines('sub'), broken, fontsOk,
  };
})()`;

export interface Measure { overflow: boolean; titleLines: number; subLines: number; broken: string[]; fontsOk: boolean }

// 권장 길이 안내 (실제 판정은 렌더링 결과)
export function copyHints(copy: CardCopy) {
  const t = [...copy.title].length, s = [...copy.sub].length;
  const hints: string[] = [];
  if (t > 28) hints.push(`제목이 ${t}자예요 (권장 10~28자)`);
  if (s > 110) hints.push(`보조 문구가 ${s}자예요 (권장 60~110자)`);
  return hints;
}
