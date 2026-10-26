// 카드 배경 그림 지시문 (기획서 7.2). 손 · 몸 오류를 줄이는 설명은 태권 글뚝딱에서 다듬은 것을 가져옴
// 그림에는 글자를 넣지 않음 — 한글 · 로고는 합성기가 얹음
import type { CardStyle } from '../../../shared/types';
import { daycareAge, type AgeBand } from '../../../shared/daycare';

const STYLE: Record<CardStyle, string> = {
  '교육 잡지형': 'Clean editorial magazine illustration, soft natural light, calm muted palette with generous empty space, refined and trustworthy mood.',
  '따뜻한 일러스트': 'Warm hand-drawn style digital illustration with soft watercolor-like shading, gentle pastel palette, friendly and cozy mood.',
  '깔끔한 정보형': 'Simple flat vector illustration with clean shapes, minimal detail, bright clean palette, lots of empty background space.',
};

type Layout = 'top-text' | 'bottom-text' | 'split';
const spaceFor = (layout: Layout) => layout === 'split'
  ? 'Wide landscape composition. Keep every person completely inside the frame with the whole head and face clearly visible and nothing cut off at the edges; place them around the center with some floor and wall visible around them. The image must look complete on its own.'
  : layout === 'top-text'
  ? 'Keep the upper 45% of the image as a calm, simple, uncluttered background (plain wall or soft gradient) with no people or objects, because text will be placed there later. Put the people in the lower part.'
  : 'Keep the lower 40% of the image calm and simple with no important details, because text will be placed there later. Put the people in the upper part.';
const FACES = 'Draw clear, friendly facial features on every face: eyes, eyebrows, nose and a gentle mouth. No blank, featureless or hidden faces.';

// 영유아 나이 · 원복(참고 사진이 있을 때) · 교실 · 안전 (2026-10-27 기획안 v0.2 8장). 얼굴은 그림체로 또렷하게
// 나이 판단은 글 독자 고르기와 같은 규칙 (shared/daycare.ts)
export const ageFor = daycareAge;
const AGE: Record<AgeBand, string> = {
  infant: 'Children look about 1 to 2 years old: small toddlers with short limbs and round cheeks, sitting, crawling or walking with careful small steps.',
  preschool: 'Children look about 3 to 5 years old (preschoolers) with age-appropriate small bodies.',
  mixed: 'Children look about 2 to 5 years old (toddlers and preschoolers) with age-appropriate small bodies.',
};
const KID_ANATOMY = 'Each person has exactly two arms, two hands with five fingers each, and two legs; no floating hands, no extra limbs; natural joints and relaxed, child-appropriate posture.';

// 참고 사진: 첫 장 = 원복, 둘째 장 = 교실 (태권도판의 아이 도복 · 사범님 자리를 그대로 씀), 로고는 늘 마지막
export function daycareRefLead(hasUniform: boolean, hasRoom: boolean, hasLogo = false) {
  const parts: string[] = [];
  let n = 1;
  if (hasUniform) parts.push(`Reference image ${n++} shows the CHILDREN's daycare uniform. Every child wears this same uniform with the same colors and shape. ${hasLogo ? 'Ignore any logo or letters in this photo; the chest logo comes from the logo reference image.' : 'Do NOT copy any logo, badge or letters from the photo.'}`);
  if (hasRoom) parts.push(`Reference image ${n++} shows the daycare classroom. Draw a similar bright room (colors, furniture and toy style), but do not copy any text, posters, photos or people from it.`);
  if (hasLogo) parts.push(`Reference image ${n++} is the daycare LOGO. Put it as one small patch on the LEFT CHEST of every child's uniform, keeping its shape and colors as close as possible. Do not put it anywhere else and do not add any other letters.`);
  return parts.length ? `${parts.join(' ')} Use the reference images only for the uniforms and the room; draw a new scene as described below. ` : '';
}

// 얼굴 없이 그리라는 낱말만 뺌 (a → an 바꾸기는 하지 않음: "a unicorn"이 "an unicorn"이 되던 문제 · 2026-10-27 버그 점검)
export const daycareSafeScene = (scene: string) =>
  scene.replace(/\b(faceless|featureless)\b\s*/gi, '').replace(/\s{2,}/g, ' ').trim();

// 장소는 장면을 따름 (2026-10-27 요요유치원 시험: 공원 소풍 카드에 교실 · 블록 그림이 나옴 — 교실을 기본으로 적어 둔 탓)
// 실내 낱말이 있으면 실내 ("walking around the classroom", "field trip to a museum"이 바깥이 되던 문제)
const INDOOR = /\b(classroom|indoors?|inside|room|hall|kitchen|museum|library|theater|theatre|gym|nap|lunch table)\b/i;
const OUTDOOR = /\b(park|playground|forest|woods?|outdoors?|outside|garden|picnic|trail|yard|beach|farm|meadow|lawn|grass(y)?|street|zoo)\b/i;
export const daycareSetting = (scene: string) => !INDOOR.test(scene) && OUTDOOR.test(scene)
  ? 'Setting: exactly the outdoor place described in the scene (for example a park, playground or forest path), safe and green, with teachers close to the children. Do not draw a classroom.'
  : 'Setting: a bright, tidy and safe Korean daycare classroom or play area with soft flooring, low wooden shelves and simple toys, matching the activity in the scene.';

export function daycareBackgroundPrompt(scene: string, style: CardStyle, layout: Layout, age: AgeBand = 'mixed', uniformRef = false, logo = false) {
  return [
    `${layout === 'split' ? 'Landscape' : 'Vertical'} illustration for a Korean daycare center parent newsletter. Scene: ${daycareSafeScene(scene)}.`,
    daycareSetting(scene),
    STYLE[style],
    uniformRef
      ? `Children wear the daycare uniform from the reference image.${logo ? ' The only decoration is one small logo patch on the left chest.' : ''}`
      : 'Children wear comfortable everyday clothes in soft colors, with no logos or letters.',
    AGE[age],
    KID_ANATOMY,
    'Children are fictional characters, not resembling any real person, with calm, happy and natural expressions.',
    'Any adult is a kind daycare teacher in neat, simple clothes (for example a plain apron over a cardigan), often at the children\'s eye level. Parents, if shown, wear everyday clothes.',
    'Everything looks safe: no child climbing high furniture, no small objects near mouths, no sharp tools, no hot food within reach, no child near water without an adult.',
    FACES,
    spaceFor(layout),
    logo
      ? 'Absolutely no text, no letters, no numbers, no signs, no watermarks anywhere, including on walls, clothes and toys; the only exception is the one small logo patch on each child uniform chest.'
      : 'Absolutely no text, no letters, no Korean or English characters, no numbers, no logos, no signs, no watermarks anywhere, including on walls, clothes and toys.',
  ].join(' ');
}
