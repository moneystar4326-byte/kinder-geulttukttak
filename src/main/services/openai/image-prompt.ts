// 카드 배경 그림 지시문 (기획서 7.2). 1버전(태권 글뚝딱)에서 손 · 띠 오류를 줄이려고 다듬은 도복 설명을 가져옴.
// 그림에는 글자를 넣지 않음 — 한글 · 로고는 합성기가 얹음
import type { CardStyle } from '../../../shared/types';

const STYLE: Record<CardStyle, string> = {
  '교육 잡지형': 'Clean editorial magazine illustration, soft natural light, calm muted palette with generous empty space, refined and trustworthy mood.',
  '따뜻한 일러스트': 'Warm hand-drawn style digital illustration with soft watercolor-like shading, gentle pastel palette, friendly and cozy mood.',
  '깔끔한 정보형': 'Simple flat vector illustration with clean shapes, minimal detail, bright clean palette, lots of empty background space.',
};

// 도복은 모든 아이가 같은 품도복 (강담: 유급자도 같은 도복). 띠만 글 주제에 따라 바꿈 (2026-10-18 사용자)
// 로고를 켜면 (도장 정보 "그림 속 도복에 로고") 왼쪽 가슴 작은 패치 하나만 허용 · 2026-10-22 파일럿
export const dobokText = (logo = false) =>
  'Every child wears a white V-neck pullover taekwondo poom dobok (a one-piece top pulled on over the head, NOT a wrap-style karate gi with crossed lapels). ' +
  'The V-neck collar band is split lengthwise into a red outer stripe and a black inner stripe. ' +
  (logo ? 'The only decoration is one small school logo patch on the LEFT CHEST, copied from the logo reference image; no other badge, letters, name or embroidery. ' : 'No badge, emblem, logo, name or embroidery anywhere. ');
export const DOBOK = dobokText(false);

export type Belt = 'white' | 'poom' | 'mixed';
const BELT: Record<Belt, string> = {
  poom: 'Each child wears exactly ONE belt tied at the waist: a flat woven poom belt split lengthwise, black half on the upper side and red half on the lower side',
  white: 'Each child wears exactly ONE plain solid WHITE belt tied at the waist (a beginner belt, not split, no other colors)',
  mixed: 'Each child wears exactly ONE solid single-color belt tied at the waist; different children wear different colors such as white, yellow, orange, green, blue, purple, brown or red (each belt is one plain color, not split; no black belts on children)',
};
const KNOT = ', tied in a flat square knot at the front with two straight ends hanging down. No second belt, no belt held in the hands, no knot on the back. Plain belt with no letters or embroidery.';

export const uniform = (belt: Belt, logo = false) => dobokText(logo) + BELT[belt] + KNOT;
export const UNIFORM = uniform('poom');

// 글 주제 · 카드 문구로 띠 고르기: 품 · 국기원 · 시범단 → 품띠 / 처음 · 체험 · 적응 → 흰띠 / 그 밖(일반 수업 · 줄넘기 · 승급심사 · 태극 n장) → 여러 색띠
export function beltFor(text: string): Belt {
  if (/국기원|승품|품띠|품\s*심사|단\s*심사|시범단|(품새|겨루기)\s*대회|유단자/.test(text)) return 'poom';
  if (/처음|첫\s*(수업|태권도|날|등원)|체험|입관|적응|낯가림|몇\s*살부터|시작하면|초보|흰\s*띠/.test(text)) return 'white';
  return 'mixed';
}

export const ANATOMY = 'Each person has exactly two arms, two hands with five fingers each, and two legs; no floating hands, no extra limbs; natural joints and balanced taekwondo posture.';

// layout 'split' = 가로 그림 전체가 카드 위쪽에 그대로 보임 (글은 그림 밖)
// 참고 사진을 같이 보낼 때 맨 앞에 붙이는 안내 (첫 장 = 아이 도복 · 품띠, 둘째 장 = 사범님)
export function refLead(hasDobok: boolean, hasCoach: boolean, belt: Belt = 'poom', hasLogo = false) {
  const parts: string[] = [];
  let n = 1;
  if (hasDobok) {
    const beltNote = belt === 'poom'
      ? 'and exactly the same red-and-black poom belt (one belt split lengthwise into a red half and a black half)'
      : `but NOT the belt in the photo: for the belt follow the belt instruction below (${belt === 'white' ? 'plain white beginner belts' : 'single-color belts of different colors'})`;
    parts.push(`Reference image ${n++} is a product photo of the CHILDREN's uniform and belt. Every child must wear the same white V-neck dobok with the same collar (a RED outer stripe and a BLACK inner stripe), ${beltNote}. ${hasLogo ? 'Ignore any logo or letters in this photo; the chest logo comes from the logo reference image.' : 'Do NOT copy any logo, badge or letters from the photo; the chest stays plain.'}`);
  }
  if (hasCoach) parts.push(`Reference image ${n++} shows the INSTRUCTOR's uniform: a white dobok with a plain solid BLACK collar (no red) and one plain BLACK belt. Any adult instructor must wear exactly this. Do not copy his face, pose or the background.`);
  // 로고는 늘 마지막 참고 그림 (card-renderer 의 refs 순서와 같게)
  if (hasLogo) parts.push(`Reference image ${n++} is the school LOGO. Put it as one small patch (about the size of a child's palm) on the LEFT CHEST of every child's dobok, keeping its shape and colors as close as possible. Do not put it anywhere else and do not add any other letters.`);
  return parts.length ? `${parts.join(' ')} Use the reference images only for the uniforms; draw a new scene as described below. ` : '';
}

// 글 AI가 쓴 장면에서 규칙과 부딪히는 말을 뺌: 얼굴 없음 · 손에 든 띠/도복 (그런 장면이면 띠를 맨 채 서 있는 장면으로)
export function safeScene(scene: string) {
  let s = scene.replace(/\b(faceless|featureless|without faces?|no faces?)\b\s*/gi, '').replace(/\s{2,}/g, ' ').replace(/\b([Aa]) (?=[aeiou])/g, '$1n ').trim();
  if (/\b(hold(s|ing)?|held|carr(y|ies|ying)|fold(s|ing)?|hand(s|ing)? over|preparing|receiv(e|es|ing)|giv(e|es|ing))\b[^.]*\b(belt|uniform|dobok)s?\b|\b(belt|uniform|dobok)s?\b[^.]*\b(held|in (his|her|their|both) hands?)\b/i.test(s)) {
    s = 'a child standing calmly on the mat with the belt tied at the waist, looking thoughtful, an instructor nearby';
  }
  return s;
}

export function backgroundPrompt(scene: string, style: CardStyle, layout: 'top-text' | 'bottom-text' | 'split', custom?: string, belt: Belt = 'poom', logo = false) {
  const space = layout === 'split'
    ? 'Wide landscape composition. Keep every person completely inside the frame with the whole head and face clearly visible and nothing cut off at the edges; place them around the center with some floor and wall visible around them. The image must look complete on its own.'
    : layout === 'top-text'
    ? 'Keep the upper 45% of the image as a calm, simple, uncluttered background (plain wall or soft gradient) with no people or objects, because text will be placed there later. Put the people in the lower part.'
    : 'Keep the lower 40% of the image calm and simple with no important details, because text will be placed there later. Put the people in the upper part.';
  return [
    `${layout === 'split' ? 'Landscape' : 'Vertical'} illustration for a taekwondo school parent newsletter. Scene: ${safeScene(scene)}.`,
    // 2026-10-18 실사용: 장면이 "띠를 두 손에 든 아이"라 허리 띠 + 손에 든 띠 두 개가 나옴
    'The only belts in the picture are the ones tied around each person\'s waist: nobody holds, folds, hands over or displays a belt or a uniform, and no loose belts lie anywhere.',
    'Setting: a bright, tidy Korean taekwondo training hall (dojang) with a plain mat floor.',
    STYLE[style],
    custom ? `Uniform reference from the school: ${custom}` : uniform(belt, logo),
    ANATOMY,
    'Children look about 7 to 9 years old, calm and natural expressions, fictional characters, not resembling any real person.',
    // 2026-10-18 실사용: 매트 위에서 운동화를 신은 아이, 아이와 같은 띠를 맨 사범님이 나옴
    'Everyone standing on the training mat is barefoot: no shoes, no socks, no sneakers on the mat.',
    'Any adult instructor wears a white dobok with a plain solid black collar and exactly one plain black belt (not the red-and-black children belt). Parents, if shown, wear everyday clothes and are not on the mat in shoes.',
    // 2026-10-18 실사용: 얼굴에 눈 · 코 · 입이 없는 그림이 나옴
    'Draw clear, friendly facial features on every face: eyes, eyebrows, nose and a gentle mouth. No blank, featureless or hidden faces.',
    space,
    logo
      ? 'Absolutely no text, no letters, no numbers, no signs, no watermarks anywhere, including on walls, belts and props; the only exception is the one small school logo patch on each child dobok chest.'
      : 'Absolutely no text, no letters, no Korean or English characters, no numbers, no logos, no signs, no watermarks anywhere, including on walls, clothes, belts and props.',
  ].join(' ');
}
