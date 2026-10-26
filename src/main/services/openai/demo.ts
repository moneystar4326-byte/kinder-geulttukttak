// 샘플 자료: 시험 코드가 쓰는 가짜 AI · 샘플 입력 (앱의 데모 모드는 태권 글뚝딱 2.1에서 없앰)
// 모든 결과는 미리 써 둔 샘플 · 가상 값. "새싹예시어린이집"은 실제 어린이집이 아님 (시험용 가상 이름)
import type { ArticleDoc, ArticleInput, DojoProfile, KeywordRow } from '../../../shared/types';
import type { ImageAI, TextAI } from './index';

export const DEMO_PROFILE: DojoProfile = {
  id: 'default',
  name: '새싹예시어린이집',
  region: '시연용 가정 지역',
  audiences: ['유아 (만 3~5세)'],
  philosophy: '(시연용 예시 문구) 놀이 속에서 스스로 해 보는 경험을 소중히 여깁니다.',
  classFeatures: '(시연용 예시 문구) 날씨가 좋은 날에는 오전에 바깥놀이를 합니다.',
  brand: { main: '#3E8E6E', accent: '#F2A541' },
  tone: '따뜻한 설명형',
  avoidWords: '최고, 무조건',
};

export const DEMO_INPUT: ArticleInput = {
  kind: '수업 후기',
  audience: '유아 (만 3~5세)',
  region: '시연용 가정 지역',
  topic: '가을 낙엽 놀이',
  facts: {
    activities: '바깥놀이터에서 낙엽 모으기, 모은 낙엽으로 왕관 만들기',
    coachingPoints: '낙엽을 손끝으로 먼저 만져 보게 하기',
    scenes: '한 친구가 처음에는 낙엽 만지기를 망설이다가 끝에는 가장 큰 잎을 골라 왕관에 붙임',
    values: '호기심, 자신감',
    extra: '',
    photoNotes: '낙엽 왕관을 쓴 뒷모습 사진',
  },
  mainKeyword: '어린이집 낙엽 놀이',
  subKeywords: ['유아 바깥놀이'],
  tone: '따뜻한 설명형',
  ending: '어린이집 소개로 마무리',
  includeProfile: { philosophy: true, classFeatures: true, credentials: false, contact: false, address: false },
  withCards: true,
};

// 가상 키워드 (실제 검색량 아님 — 화면에 "데모 · 가상 값" 표시)
export function demoKeywords(): KeywordRow[] {
  const at = new Date().toISOString();
  return [
    ['어린이집 낙엽 놀이', '가상 300', '가상 2,100', '가상 낮음'],
    ['유아 바깥놀이', '가상 200', '가상 1,500', '가상 낮음'],
    ['가을 놀이', '가상 900', '가상 5,100', '가상 중간'],
  ].map(([keyword, pc, mobile, competition]) => ({ keyword, pc, mobile, competition, source: 'demo' as const, fetchedAt: at }));
}

const DEMO_DOC: ArticleDoc = {
  titleCandidates: [
    '어린이집 낙엽 놀이, 손끝으로 만나는 가을',
    '바깥놀이터에서 낙엽을 모으고 왕관을 만들었어요',
    '낙엽 한 장에서 시작된 유아들의 작은 자신감',
  ],
  sections: [
    { id: 's1', paragraphs: [
      '아이가 바깥에서 무엇을 하며 노는지 궁금하신 적 있으신가요. 계절이 바뀌는 지금은 놀이터 바닥에 떨어진 낙엽 하나도 아이들에게 좋은 놀잇감이 됩니다.',
      '이번 바깥놀이 시간에는 유아반 친구들과 함께 낙엽을 모으고, 모은 낙엽으로 왕관을 만들어 보았습니다. 손으로 만지고 고르고 붙이는 과정 하나하나가 모두 놀이였습니다.',
    ] },
    { id: 's2', heading: '낙엽을 모으는 시간', paragraphs: [
      '놀이터 한쪽에는 색도 모양도 다른 낙엽이 가득했습니다. 아이들은 노란 잎, 빨간 잎, 갈색 잎을 하나씩 주우며 서로 다른 점을 찾아보았습니다.',
      '어떤 잎은 바스락 소리가 크게 나고, 어떤 잎은 아직 부드러웠습니다. 아이들은 소리를 들어 보고 냄새도 맡아 보며 가을을 몸으로 느꼈습니다.',
      '모으는 양을 정해 두지 않았기 때문에 아이마다 마음에 드는 만큼 천천히 모을 수 있었습니다. 서두르지 않아도 되는 시간이 아이들에게 여유를 주었습니다.',
      '친구가 고른 잎을 구경하며 "이건 손바닥보다 커" 하고 비교하는 모습도 자연스럽게 이어졌습니다. 같은 놀이 안에서도 아이마다 눈길이 가는 곳은 조금씩 달랐습니다.',
    ] },
    { id: 's3', heading: '손끝으로 먼저 만져 봐요', paragraphs: [
      '이번 놀이에서 가장 신경 쓴 점은 낙엽을 손끝으로 먼저 만져 보게 하는 것이었습니다. 처음 보는 감촉이 낯선 아이에게는 손바닥 전체보다 손끝이 훨씬 편하기 때문입니다.',
      '선생님은 아이 옆에서 먼저 잎을 살짝 만져 보이며 기다려 주었습니다. 억지로 쥐게 하기보다 아이가 스스로 손을 뻗을 때까지 시간을 두었습니다.',
      '작은 시도가 쌓이면 아이는 다음 놀이에도 조금 더 쉽게 다가갑니다. 손끝으로 시작한 경험이 손바닥 전체로 이어지는 과정을 곁에서 지켜보았습니다.',
    ] },
    { id: 's4', heading: '낙엽 왕관을 만들었어요', paragraphs: [
      '모은 낙엽은 종이 띠에 붙여 왕관으로 만들었습니다. 아이들은 어떤 잎을 앞에 붙일지, 몇 장을 붙일지 스스로 정했습니다.',
      '처음에는 낙엽 만지기를 망설이던 한 친구가 있었습니다. 그 친구는 놀이가 끝나갈 무렵 가장 큰 잎을 직접 골라 왕관 한가운데에 붙였습니다.',
      '처음부터 씩씩하게 다가가는 것만이 용기는 아닙니다. 망설인 뒤에 스스로 한 걸음 다가가는 순간도 아이에게는 소중한 도전입니다.',
    ] },
    { id: 's5', heading: '놀이로 자라는 마음', paragraphs: [
      '낙엽 놀이는 특별한 준비물이 없어도 아이들의 호기심을 깨워 줍니다. 보고 듣고 만지는 경험이 한데 모여 계절을 이해하는 바탕이 됩니다.',
      '내가 고른 잎으로 무언가를 완성해 보는 경험은 작은 자신감으로 이어집니다. 결과가 멋진지보다 스스로 정하고 해냈다는 기억이 아이에게 오래 남습니다.',
      '새싹예시어린이집은 날씨가 좋은 날 오전에 바깥놀이를 하며, 계절마다 달라지는 자연을 놀이로 만나고 있습니다. 같은 놀이터도 계절에 따라 전혀 다른 놀이터가 됩니다.',
      '친구들과 함께 낙엽을 모으는 동안 서로의 잎을 구경하고 나누는 모습도 보였습니다. 함께 노는 시간 속에서 친구를 바라보는 마음도 함께 자랍니다.',
    ] },
    { id: 's5b', heading: '선생님이 지켜본 모습', paragraphs: [
      '낙엽을 고를 때 아이들은 저마다 기준이 달랐습니다. 색이 고운 잎을 찾는 친구도 있었고, 바스락 소리가 큰 잎만 모으는 친구도 있었습니다.',
      '선생님은 어떤 잎이 더 좋은지 정해 주지 않았습니다. 대신 "이 잎은 어떤 소리가 나?" 하고 물으며 아이가 스스로 고른 이유를 말로 꺼내 볼 수 있게 도왔습니다.',
      '왕관에 잎을 붙이는 동안에는 풀이 손에 묻어 끈적한 느낌이 들기도 했습니다. 처음에는 손을 털던 아이들도 금세 익숙해져 다음 잎을 집어 들었습니다.',
      '놀이가 끝난 뒤에는 각자 만든 왕관을 쓰고 둥글게 모여 앉아 서로의 왕관을 구경했습니다. 누구의 것이 더 멋진지가 아니라, 어떤 잎을 왜 골랐는지를 이야기하는 시간이었습니다.',
      '교실로 돌아와서는 손을 깨끗이 씻고 따뜻한 물을 마시며 쉬었습니다. 바깥에서 느낀 차가운 바람과 바스락 소리를 떠올리며 오늘 놀이를 함께 돌아보았습니다.',
      '왕관은 교실 창가에 나란히 걸어 두었습니다. 아이들은 하원 전에 자기 왕관을 찾아보며 친구에게 자랑하듯 손가락으로 가리켰습니다.',
    ] },
    { id: 's6', heading: '가정에서 함께해 주세요', paragraphs: [
      '산책길에 떨어진 낙엽을 아이와 함께 주워 보세요. 어떤 색이 마음에 드는지, 어떤 소리가 나는지 이야기 나누는 것만으로도 충분합니다.',
      '아이가 낯선 것을 망설일 때는 먼저 보여 주고 조금 기다려 주세요. 스스로 손을 뻗는 순간이 아이에게는 큰 걸음이 됩니다.',
      '집에 가져온 낙엽을 책 사이에 끼워 두었다가 며칠 뒤 함께 꺼내 보는 것도 좋습니다. 달라진 모습을 보며 나누는 대화가 또 하나의 놀이가 됩니다.',
    ] },
  ],
  tags: ['어린이집낙엽놀이', '유아바깥놀이', '가을놀이', '낙엽왕관', '어린이집놀이', '새싹예시어린이집'],
  photoSuggestions: [{ afterSectionId: 's4', caption: '낙엽 왕관을 쓴 뒷모습 사진' }],
  reviewFlags: [],
};

const ALT_TITLES = [
  ['낙엽 왕관 만들기, 손끝에서 시작된 가을 놀이', '바깥놀이터 낙엽 놀이로 만난 작은 자신감', '어린이집 가을 낙엽 놀이 이야기'],
  ['가을 낙엽으로 왕관을 만든 날', '유아 바깥놀이: 낙엽 모으기와 왕관 만들기', '낙엽 한 장으로 자라는 호기심'],
];

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const flag = { code: 'demo', message: '데모 모드: 입력과 관계없이 준비된 샘플 글이에요. 실제 AI 생성이 아니에요.' };
const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((ok, fail) => {
  const t = setTimeout(ok, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); fail(Object.assign(new Error('멈춤'), { name: 'AbortError' })); });
});

let titleTurn = 0;
export const demoText: TextAI = {
  async generate(_p, _i, _r, o) { await wait(900, o?.signal); const d = clone(DEMO_DOC); d.reviewFlags = [flag]; return d; },
  async expand(doc, _c, o) { await wait(300, o?.signal); return clone(doc); },
  async polish(doc, _i, o) { await wait(300, o?.signal); return clone(doc); },
  async review(_d, _p, _i, o) { await wait(400, o?.signal); return []; },
  async revise(_k, doc, o) { await wait(600, o?.signal); const d = clone(doc); d.reviewFlags = [{ code: 'demo', message: '데모 모드에서는 문체가 실제로 바뀌지 않아요 (같은 글을 새 버전으로 저장).' }]; return d; },
  async titles(_d, _i, o) { await wait(400, o?.signal); return ALT_TITLES[titleTurn++ % ALT_TITLES.length]; },
  async paragraph(doc, sectionId, index, _ins, o) { await wait(400, o?.signal); return doc.sections.find((s) => s.id === sectionId)?.paragraphs[index] ?? ''; },
  async cardOne(_d, _t, _i, cur, _o, _k, o) { await wait(400, o?.signal); return { title: `${cur.title.replace(/ \(새 문구\)$/, '')} (새 문구)`.slice(0, 28), sub: cur.sub }; },
  async cardCopies(_d, _t, _k, o) {
    await wait(500, o?.signal);
    return [
      { title: '바깥놀이터에서 무엇을 했나요?', sub: '놀이터에 떨어진 낙엽을 모았어요. 노란 잎, 빨간 잎을 하나씩 주우며 소리와 감촉을 느꼈어요.', scene: 'preschoolers gathering colorful autumn leaves on a safe playground, a teacher kneeling beside them', afterSectionId: 's1' },
      { title: '모은 낙엽으로 왕관을 만들었어요', sub: '종이 띠에 마음에 드는 잎을 골라 붙였어요. 망설이던 친구도 끝에는 가장 큰 잎을 골랐어요.', scene: 'preschoolers sitting at a low table outdoors gluing autumn leaves onto paper crowns, a teacher nearby', afterSectionId: 's4' },
      { title: '산책길 낙엽 하나로도 충분해요', sub: '가정에서도 낙엽을 주우며 색과 소리를 이야기해 보세요. 낯설어하면 먼저 보여 주고 기다려 주세요.', scene: 'a parent and a young child picking up autumn leaves on a park path', afterSectionId: 's6' },
    ];
  },
  // 데모: AI 대신 메모를 그대로 활동 칸에 (나누지 않음)
  async splitMemo(memo, _k, _t, o) { await wait(300, o?.signal); return { activities: memo.trim() }; },
  async keywordIdeas(region, topic, _k, o) {
    await wait(300, o?.signal);
    const r = region.replace(/\s/g, '');
    return [`${r} 어린이집`, '유아 바깥놀이', '어린이집 가을 놀이', '낙엽 놀이', `${topic.split(/\s/)[0]} 놀이`];
  },
};

// 데모 배경: 이미지 API 대신 null → 카드 합성기가 템플릿 배경을 씀
export const demoImage: ImageAI = {
  async background() { throw Object.assign(new Error('데모 모드에서는 AI 그림을 만들지 않아요. 템플릿 배경을 써요.'), { demo: true }); },
};
