// 샘플 자료: 시험 코드가 쓰는 가짜 AI · 샘플 입력 (앱의 데모 모드는 2.1에서 없앰 · 2026-10-22)
// 모든 결과는 미리 써 둔 샘플 · 가상 값이며, 화면에 "데모" 배지가 붙음. 네이버 실조회 · AI 실생성이 아님.
import type { ArticleDoc, ArticleInput, DojoProfile, KeywordRow } from '../../../shared/types';
import type { ImageAI, TextAI } from './index';

// 강담태권도 · 용인대 석사는 사용자 확인 사실(2026-10-17). 지역 · 문구는 시연용 가정
export const DEMO_PROFILE: DojoProfile = {
  id: 'default',
  name: '강담태권도',
  region: '시연용 가정 지역',
  audiences: ['초등 저학년'],
  philosophy: '(시연용 예시 문구) 기술보다 다시 해 보는 마음을 먼저 가르칩니다.',
  classFeatures: '(시연용 예시 문구) 품새 수업 끝에 친구들 앞에서 짧게 발표하는 시간을 둡니다.',
  credentials: '용인대 석사',
  brand: { main: '#1F4E9A', accent: '#C8241C' },
  tone: '따뜻한 설명형',
  avoidWords: '최고, 무조건',
};

export const DEMO_INPUT: ArticleInput = {
  kind: '수업 후기',
  audience: '초등 저학년',
  region: '시연용 가정 지역',
  topic: '태극 1·2장 품새 발표 수업',
  facts: {
    activities: '태극 1장 · 2장 복습, 시선 처리 연습, 친구들 앞에서 품새 발표',
    coachingPoints: '움직이기 전에 가는 방향을 먼저 보기',
    scenes: '한 친구가 발표 순서에서 망설이다가 다시 줄에 서서 끝까지 해냄',
    values: '도전, 끈기',
    extra: '',
    photoNotes: '발표 연습 사진',
  },
  mainKeyword: '태권도 품새 발표',
  subKeywords: ['초등 태권도'],
  tone: '따뜻한 설명형',
  ending: '도장 소개로 마무리',
  includeProfile: { philosophy: true, classFeatures: true, credentials: false, contact: false, address: false },
  withCards: true,
};

// 가상 키워드 (실제 검색량 아님 — 화면에 "데모 · 가상 값" 표시)
export function demoKeywords(): KeywordRow[] {
  const at = new Date().toISOString();
  return [
    ['태권도 품새', '가상 1,200', '가상 6,800', '가상 낮음'],
    ['태극 1장', '가상 900', '가상 5,100', '가상 낮음'],
    ['태권도 품새 발표', '가상 < 10', '가상 40', '가상 낮음'],
    ['초등 태권도', '가상 300', '가상 2,400', '가상 중간'],
    ['어린이 발표 연습', '가상 150', '가상 700', '가상 낮음'],
  ].map(([keyword, pc, mobile, competition]) => ({ keyword, pc, mobile, competition, source: 'demo' as const, fetchedAt: at }));
}

const DEMO_DOC: ArticleDoc = {
  titleCandidates: [
    '태권도 품새 발표, 친구들 앞에서 한 번 더 해 보는 용기',
    '태극 1장 · 2장 품새 발표 수업, 시선이 먼저 가는 연습',
    '초등 태권도 품새 발표 시간에 배우는 도전과 끈기',
  ],
  sections: [
    { id: 's1', paragraphs: [
      '아이가 친구들 앞에 서면 평소보다 작아지는 모습을 본 적 있으신가요. 집에서는 잘하던 것도 여러 사람의 눈이 모이면 머뭇거리게 되는 것은 아주 자연스러운 일입니다.',
      '이번 품새 수업에서는 그 머뭇거림을 어떻게 넘어서는지 함께 연습했습니다. 초등 저학년 친구들이 태극 1장과 2장을 복습하고, 마지막에는 친구들 앞에서 품새를 발표하는 시간을 가졌습니다.',
    ] },
    { id: 's2', heading: '🥋 태극 1장 · 2장을 다시 다지는 시간', paragraphs: [
      '태극 1장과 2장은 처음 품새를 배우는 아이들이 만나는 기본 동작들로 이루어져 있습니다. 서기와 막기, 지르기가 차례로 이어지기 때문에 순서를 외우는 것만으로도 아이들에게는 작은 도전이 됩니다.',
      '이번 시간에는 새로운 동작을 더 배우기보다 이미 배운 순서를 천천히 다시 밟아 보았습니다. 빠르게 끝내는 것보다 한 동작 한 동작을 또렷하게 하는 것을 목표로 삼았습니다.',
      '복습은 지루할 것 같지만, 아이들은 익숙한 동작을 다시 할 때 오히려 자신감을 얻습니다. 알고 있는 것을 정확하게 해내는 경험이 다음 동작을 배울 힘이 되기 때문입니다.',
      '같은 품새라도 처음 외울 때와 다시 다질 때 보이는 것이 다릅니다. 처음에는 다음 동작이 무엇인지 떠올리느라 바쁘지만, 순서가 익숙해지면 손의 높이와 발의 방향처럼 작은 부분까지 신경 쓸 여유가 생깁니다.',
    ] },
    { id: 's3', heading: '👀 움직이기 전에 방향을 먼저 보기', paragraphs: [
      '이번 수업에서 가장 강조한 지도 포인트는 시선 처리였습니다. 품새는 방향을 바꾸며 이어지는데, 몸이 먼저 돌고 눈이 늦게 따라가면 동작이 흔들리고 순서도 헷갈리기 쉽습니다.',
      '그래서 아이들에게 움직이기 전에 가야 할 방향을 먼저 보도록 안내했습니다. 눈이 먼저 가고 몸이 따라가면 자세가 안정되고, 다음 동작을 미리 준비할 여유도 생깁니다.',
      '시선 처리는 품새만을 위한 기술이 아닙니다. 어디를 볼지 스스로 정하고 움직이는 연습은 아이가 자기 행동을 차분히 준비하는 습관과도 이어집니다.',
      '저학년 아이들에게는 말로 길게 설명하기보다 짧은 신호를 반복해 주는 것이 도움이 됩니다. 방향을 바꾸기 전에 눈으로 먼저 가 보자는 약속을 정해 두면, 아이들은 동작을 할 때마다 그 약속을 스스로 떠올리게 됩니다.',
    ] },
    { id: 's4', heading: '🙋 친구들 앞에서 품새 발표', paragraphs: [
      '수업의 마지막은 품새 발표 시간이었습니다. 한 사람씩 앞에 나와 친구들이 지켜보는 가운데 태극 1장 또는 2장을 처음부터 끝까지 해 보았습니다.',
      '발표 순서를 기다리던 한 친구는 자기 차례가 되자 잠시 망설였습니다. 앞에 나서기가 쉽지 않았던 그 친구는 다시 줄에 섰고, 다음 차례에 앞으로 나와 품새를 끝까지 해냈습니다.',
      '처음부터 씩씩하게 나서는 것만 용기가 아닙니다. 망설인 뒤에 다시 한 번 해 보기로 마음먹는 것도 아이가 스스로 만들어 낸 소중한 도전입니다.',
    ] },
    { id: 's5', heading: '💪 도전과 끈기는 이렇게 자랍니다', paragraphs: [
      '태권도 수업에서 이야기하는 도전과 끈기는 거창한 것이 아닙니다. 어려운 순간에 그만두지 않고 한 번 더 해 보는 작은 경험이 차곡차곡 쌓이며 만들어집니다.',
      '발표 시간은 그 경험을 하기에 좋은 자리입니다. 실수할 수도 있고 순서를 잊을 수도 있지만, 끝까지 해냈다는 기억은 아이에게 오래 남습니다.',
      '그래서 도장에서는 결과보다 과정에 집중해 이야기해 줍니다. 동작이 완벽했는지보다 다시 해 보려고 한 마음을 먼저 알아봐 주려고 합니다.',
      '친구들이 지켜보는 자리에서 해 보는 경험은 혼자 연습할 때와는 또 다른 배움을 줍니다. 떨리는 마음을 안고도 준비한 것을 끝까지 보여 주는 연습이 쌓이면, 아이는 다음에 비슷한 자리에 섰을 때 조금 더 편안하게 시작할 수 있습니다.',
      '지켜보는 친구들에게도 배움이 있습니다. 앞에 선 친구가 망설일 때 기다려 주고, 끝까지 해냈을 때 함께 박수를 보내는 경험은 서로를 응원하는 수련 분위기를 만들어 줍니다.',
    ] },
    { id: 's6', heading: '🏠 가정에서 함께해 주세요', paragraphs: [
      '아이가 도장에서 있었던 일을 이야기하면 잘했는지보다 어떤 마음이었는지를 물어봐 주세요. 떨렸는데 해냈다는 이야기가 나오면 그 순간을 함께 기뻐해 주시면 충분합니다.',
      '집에서 품새를 보여 달라고 부탁해 보시는 것도 좋습니다. 가족 앞에서 해 보는 짧은 발표가 다음 수업에서 앞에 서는 힘이 되어 줄 수 있습니다.',
      '혹시 순서를 헷갈리거나 중간에 멈추더라도 바로 고쳐 주기보다 다시 처음부터 해 볼 수 있게 기다려 주세요. 스스로 다시 시작해 보는 경험이 도장에서 연습한 것과 자연스럽게 이어집니다.',
    ] },
    { id: 's7', heading: '마무리하며', paragraphs: [
      '강담태권도는 기술보다 다시 해 보는 마음을 먼저 가르치려고 합니다. 품새 수업 끝의 짧은 발표 시간도 그 마음을 연습하는 자리입니다.',
      '오늘 망설이다 다시 앞에 선 친구처럼, 모든 아이가 자기 속도로 한 걸음씩 나아갈 수 있도록 곁에서 함께하겠습니다.',
    ] },
  ],
  tags: ['태권도품새', '태극1장', '태극2장', '품새발표', '초등태권도', '태권도수업', '강담태권도'],
  photoSuggestions: [{ afterSectionId: 's4', caption: '발표 연습 사진' }],
  reviewFlags: [],
};

const ALT_TITLES = [
  ['품새 발표 수업, 망설임 뒤에 다시 서는 연습', '태극 1장 · 2장 복습과 시선 처리, 그리고 발표', '태권도 품새 발표로 배우는 작은 용기'],
  ['친구들 앞 품새 발표, 다시 해 보는 마음', '초등 태권도 수업 후기: 태극 1 · 2장과 발표', '눈이 먼저, 몸이 다음: 품새 시선 처리 수업'],
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
      { title: '친구들 앞에서 망설이는 우리 아이', sub: '여러 사람의 눈이 모이면 머뭇거리는 것은 자연스러운 일이에요. 그 순간을 함께 넘는 연습을 했어요.', scene: 'a child standing at the edge of a mat looking a little hesitant while classmates sit and watch kindly', afterSectionId: 's1' },
      { title: '품새 발표로 연습하는 작은 도전', sub: '태극 1장 · 2장을 복습하고, 움직이기 전에 방향을 먼저 보는 시선 처리를 연습했어요.', scene: 'a child performing a taekwondo poomsae front stance with a low block, eyes looking ahead, instructor watching calmly', afterSectionId: 's3' },
      { title: '완벽한 한 번보다 다시 해보는 경험', sub: '망설인 뒤에 다시 앞에 선 마음, 그 작은 용기가 도전과 끈기를 키워요.', scene: 'a child bowing at the end of a performance while classmates gently clap', afterSectionId: 's5' },
    ];
  },
  // 데모: AI 대신 메모를 그대로 진행 활동 칸에 (나누지 않음)
  async splitMemo(memo, _k, _t, o) { await wait(300, o?.signal); return { activities: memo.trim() }; },
  async keywordIdeas(region, topic, _k, o) {
    await wait(300, o?.signal);
    const r = region.replace(/\s/g, '');
    return [`${r} 태권도`, '품새 발표', '태극 2장 순서', '초등 발표 연습', `${topic.split(/\s/)[0]} 수업`];
  },
};

// 데모 배경: 이미지 API 대신 null → 카드 합성기가 템플릿 배경을 씀
export const demoImage: ImageAI = {
  async background() { throw Object.assign(new Error('데모 모드에서는 AI 그림을 만들지 않아요. 템플릿 배경을 써요.'), { demo: true }); },
};
