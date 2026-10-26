// 어린이집 글뚝딱 규칙 시험 (2026-10-27 기획안 v0.2 · 버그 점검 · 요요유치원 시험에서 나온 것)
// 앱 모듈은 아래 before 에서 불러옴
import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { ArticleDoc, ArticleInput, DojoProfile, NearbyArea } from '../../src/shared/types';
import type { Writer } from '../../src/shared/daycare';

let I: typeof import('../../src/shared/daycare');
let T: typeof import('../../src/shared/types');
let P: typeof import('../../src/main/services/openai/prompts');
let IMG: typeof import('../../src/main/services/openai/image-prompt');
let A: typeof import('../../src/shared/areas');
let K: typeof import('../../src/shared/keywords');
let Q: typeof import('../../src/shared/quick');
let QI: typeof import('../../src/shared/quickInput');
let V: typeof import('../../src/shared/validation');
let S: typeof import('../../src/shared/strengths');
let C: typeof import('../../src/shared/cardRoles');
let F: typeof import('../../src/shared/format');
let N: typeof import('../../src/main/services/nearby');
let TPL: typeof import('../../src/main/services/card-renderer/template');
let ART: typeof import('../../src/main/article');

before(async () => {
  I = await import('../../src/shared/daycare');
  T = await import('../../src/shared/types');
  P = await import('../../src/main/services/openai/prompts');
  IMG = await import('../../src/main/services/openai/image-prompt');
  A = await import('../../src/shared/areas');
  K = await import('../../src/shared/keywords');
  Q = await import('../../src/shared/quick');
  QI = await import('../../src/shared/quickInput');
  V = await import('../../src/shared/validation');
  S = await import('../../src/shared/strengths');
  C = await import('../../src/shared/cardRoles');
  F = await import('../../src/shared/format');
  N = await import('../../src/main/services/nearby');
  TPL = await import('../../src/main/services/card-renderer/template');
  ART = await import('../../src/main/article');
});

// 가상 어린이집 (실제 어린이집 아님 — 시험용)
const AREAS: NearbyArea[] = [
  { name: '롯데낙천대', kind: '아파트', distance: 200, source: 'kakao' },
  { name: '보라매삼성', kind: '아파트', distance: 350, source: 'kakao' },
  { name: '먼아파트', kind: '아파트', distance: 900, source: 'kakao' }, // 500m 밖 → 쓰지 않음
  { name: '보라매초', kind: '학교', distance: 300, source: 'kakao' },
  { name: '신대방역', kind: '지하철역', distance: 400, source: 'kakao' },
];
const prof = (p: Partial<DojoProfile> = {}): DojoProfile => ({
  id: 'default', name: '새싹예시어린이집', region: '서울 동작구 신대방동', audiences: ['영아 (만 0~2세)', '유아 (만 3~5세)'],
  philosophy: '놀이 속에서 스스로 자라는 아이', classFeatures: '운영 시간: 07:30~19:30', brand: { main: '#3E8E6E', accent: '#F2A541' },
  tone: '따뜻한 설명형', avoidWords: '최고', nearbyAreas: AREAS, facilityType: '가정', ...p,
});
const TEACHER: Writer = { id: 'w1', role: '교사', name: '김하늘', className: '햇님반' };
const input = (p: Partial<ArticleInput> = {}): ArticleInput => ({
  ...QI.emptyInput(prof()), topic: '밀가루 반죽 촉감놀이', mainKeyword: '신대방동어린이집', subKeywords: ['촉감놀이'],
  facts: { ...QI.emptyInput().facts, activities: '민준이가 밀가루 반죽을 조물조물 만졌어요. 필요경비 월 3만 원', scenes: '' }, ...p,
});
const doc = (text: string): ArticleDoc => ({
  titleCandidates: ['a', 'b', 'c'], tags: [], photoSuggestions: [], reviewFlags: [],
  sections: [{ id: 's1', heading: '', paragraphs: ['도입이에요.'] }, { id: 's2', heading: '오늘 놀이', paragraphs: [text] }],
});
const TKD = /태권|도장|관장|사범|품새|도복|승급|국기원|dojang|taekwondo|dobok|belt/i;

test('기본 설정: 어린이집 이름 · 글 종류 이름 · 나이 · 글쓴이', () => {
  assert.equal(I.PRODUCT, 'daycare');
  assert.equal(I.APP.appName, '어린이집 글뚝딱');
  assert.equal(I.kindLabel('수업 후기'), '놀이 · 활동 이야기');
  assert.equal(I.kindLabel('모집 안내'), '입소 안내');
  assert.equal(I.kindLabel('교육 정보'), '보육 정보');
  assert.equal(I.kindLabel('행사 안내'), '행사 안내');
  assert.deepEqual(T.AUDIENCES, ['영아 (만 0~2세)', '유아 (만 3~5세)']);
  assert.equal(T.ENDINGS[0], '어린이집 소개로 마무리');
  assert.equal(I.writerLabel(TEACHER), '햇님반 김하늘 선생님');
  assert.equal(I.writerLabel({ role: '원장', name: '' }), '원장님');
});

test('글 지시문 어디에도 태권도 말이 없음 (글 종류 5개 · 다듬기 · 점검 · 카드 · 메모 · 키워드)', () => {
  const d = doc('오늘 놀이를 했어요.');
  for (const kind of T.ARTICLE_KINDS) {
    const i = input({ kind, writer: TEACHER });
    for (const [name, text] of Object.entries({
      article: P.articlePrompt(prof(), i, null), polish: P.polishPrompt(d, i), review: P.reviewPrompt(d, prof(), i),
      card: P.cardCopyPrompt(d, '제목', kind, TEACHER), cardOne: P.cardOnePrompt(d, '제목', 1, { title: 't', sub: 's', scene: 'x' }, [], kind, TEACHER),
      memo: P.memoPrompt('메모', kind, '주제'), ideas: P.keywordIdeasPrompt('서울', '낮잠', kind),
    })) assert.doesNotMatch(text, TKD, `${kind} · ${name}`);
  }
  for (const text of [P.SYSTEM_RULES, P.MEMO_RULES, ...(['warmer', 'professional', 'less-promo'] as const).map((k) => P.revisePrompt(k, d))]) assert.doesNotMatch(text, TKD);
});

test('글 지시문: 어린이집 이름 · 유형 · 글쓴이 시점 · 보육 말', () => {
  const t = P.articlePrompt(prof(), input({ writer: TEACHER }), null);
  assert.match(t, /\[글 종류\] 놀이 · 활동 이야기/);
  assert.match(t, /\[어린이집 이름\] "새싹예시어린이집"/);
  assert.match(t, /어린이집 유형: 가정/);
  assert.match(t, /\[글쓴이\] 햇님반 김하늘 선생님 — 담임 선생님 시점으로, "저희 햇님반"/);
  assert.match(t, /한 놀이 · 활동: 민준이가/);
  assert.match(t, /어린이집 주변 \(실제로 가까운 곳\): 롯데낙천대아파트, 보라매삼성아파트, 보라매초, 신대방역/);
  assert.match(P.articlePrompt(prof(), input({ writer: { id: 'd', role: '원장', name: '' } }), null), /원장님 시점으로 쓴다 \("저희 어린이집"\)/);
  assert.doesNotMatch(P.articlePrompt(prof(), input(), null), /\[글쓴이\]/); // 글쓴이를 안 고른 옛 글
  assert.match(P.SYSTEM_RULES, /입소 가능 여부 · 순위 · 대기 기간을 약속하지 않는다/);
  assert.match(P.SYSTEM_RULES, /아이를 진단하거나 평가하지 않는다/);
});

test('흐름 다듬기 · 사실 점검에 어린이집 확인 항목이 더해짐 (태권도판 4단계 그대로)', () => {
  const pol = P.polishPrompt(doc('x'), input({ writer: TEACHER }));
  assert.match(pol, /7\. 글쓴이 시점이 처음부터 끝까지 같게 한다 \(글쓴이: 햇님반 김하늘 선생님\)/);
  assert.match(pol, /8\. 아이를 평가 · 진단하는 말/);
  assert.match(pol, /9\. 영아 · 유아 나이에 맞지 않는 말/);
  assert.match(pol, /사실\(어린이집 이름, 지역, 요일, 시간, 반 이름/);
  const rev = P.reviewPrompt(doc('x'), prof(), input());
  assert.match(rev, /보육료 · 필요경비 금액/);
  assert.match(rev, /child-identify \/ fee \/ admission \/ evaluation \/ diagnosis/);
  assert.match(rev, /\[사실 — 어린이집\]/);
});

test('카드 문구: 장면은 안전 · 생활 장면, 선생님 글은 반 시점, 카드 역할은 어린이집 흐름', () => {
  const t = P.cardCopyPrompt(doc('x'), '제목', '모집 안내', TEACHER);
  assert.match(t, /toddlers stacking soft blocks/);
  assert.match(t, /위험해 보이는 장면/);
  assert.match(t, /카드 문구 시점: "햇님반 친구들"처럼 반 시점/);
  assert.match(t, /카드3 = 글에 적힌 입소 상담 · 대기 신청 방법/);
  assert.deepEqual(C.cardRoles('수업 후기').map((r) => r.label), ['학부모의 궁금함 · 답', '오늘 한 놀이 장면', '놀이로 자라는 것']);
  assert.match(t, /sub 는 꼭 2문장/); // 2.2.7 카드 글 규칙도 같이 씀
  assert.match(t, /블록은 쌓고 무너뜨리며 놀아요/);
});

test('카드 제목 · 답 맞추기 + 만든 뒤 한 번 더 점검 (요요유치원 시험에서 나온 카드)', () => {
  // 실제로 나온 카드: 질문에 막연한 답 · 카드끼리 같은 문장 · 공원 글에 교실 그림
  const bad = [
    { title: '아이들은 밖에서 무엇을 하나요?', sub: '아이들은 소풍을 떠나 평소와 다른 바깥 풍경을 만나요. 장미반 아이들과 함께 보라매공원으로 소풍을 다녀왔어요.', scene: 'children and teachers together in a leafy park', afterSectionId: 's1' },
    { title: '보라매공원으로 소풍을 다녀왔어요', sub: '보라매공원으로 소풍을 가 일상과 다른 바깥 풍경을 만났어요. 아이의 눈길이 어디에 머무는지에 마음을 둡니다.', scene: 'children looking around a green park', afterSectionId: 's2' },
    { title: '자기 관심을 표현하며 함께 지내요', sub: '소풍은 자기 관심을 표현하는 경험이에요. 각자의 관심을 따라갈 수 있어요.', scene: 'children on a grassy park', afterSectionId: 's4' },
  ];
  const make = P.cardCopyPrompt(doc('공원에서 낙엽을 모았어요.'), '장미반 소풍', '수업 후기');
  assert.match(make, /제목과 답 맞추기/);
  assert.match(make, /"무엇을" → 한 일 · 놀이 이름/);
  assert.match(make, /"풍경을 만나요" · "경험을 해요"/);
  assert.match(make, /title 을 글 제목 그대로 옮기지 않는다/);
  assert.match(P.cardOnePrompt(doc('x'), 't', 0, bad[0], [], '수업 후기'), /제목과 답 맞추기/);
  const chk = P.cardCheckPrompt(doc('공원에서 낙엽을 모았어요.'), '장미반 소풍', bad, '수업 후기', TEACHER);
  assert.match(chk, /틀린 곳만 고쳐 같은 JSON 형식으로 3장 모두/);
  assert.match(chk, /카드1: title="아이들은 밖에서 무엇을 하나요\?"/);
  assert.match(chk, /scene 이 그 카드 문구와 같은 장소/);
  assert.match(chk, /afterSectionId 는 바꾸지 않는다/);
  assert.match(chk, /\[글\]\n\(s1\)/);
  assert.doesNotMatch(chk, TKD);
});

test('재료가 주제 한 줄뿐이면 카드 제목을 질문으로 쓰지 않음', () => {
  const memo = '장미반 아이들과 함께 보라매공원으로 소풍갔어요';
  const thin = input({ topic: memo, facts: { ...QI.emptyInput().facts, activities: memo } });
  assert.equal(V.thinFacts(thin), true);
  assert.equal(V.thinFacts(input({ topic: '소풍', facts: { ...QI.emptyInput().facts, activities: '보라매공원에서 낙엽을 모아 왕관을 만들고, 돗자리에 앉아 도시락을 먹었어요' } })), false);
  assert.match(P.cardCopyPrompt(doc('x'), 't', '수업 후기', undefined, true), /세 장 모두 title 을 물음표 없는 문장으로/);
  assert.doesNotMatch(P.cardCopyPrompt(doc('x'), 't', '수업 후기'), /물음표 없는 문장으로 쓴다 \(카드1도\)/);
  assert.match(P.cardCheckPrompt(doc('x'), 't', [], '수업 후기', undefined, true), /카드1도/);
  assert.match(P.cardOnePrompt(doc('x'), 't', 0, { title: 'a', sub: 'b', scene: 'c' }, [], '수업 후기', undefined, true), /카드1도/);
});

test('카드 그림 장소는 장면을 따름: 공원이면 공원, 아니면 교실', () => {
  assert.match(IMG.daycareSetting('children and teachers together in a leafy park'), /outdoor place.*Do not draw a classroom/);
  assert.match(IMG.daycareSetting('toddlers on a picnic mat under trees'), /outdoor/);
  assert.match(IMG.daycareSetting('toddlers stacking soft blocks on a classroom rug'), /daycare classroom/);
  const p = IMG.daycareBackgroundPrompt('children walking in a park', '따뜻한 일러스트', 'split');
  assert.doesNotMatch(p, /low wooden shelves/);
});

test('카드 그림: 도복 · 띠 규칙 없이 영유아 · 교실 · 안전, 얼굴은 그림체로', () => {
  for (const age of ['infant', 'preschool', 'mixed'] as const) {
    const t = IMG.daycareBackgroundPrompt('toddlers playing with dough, faceless', '따뜻한 일러스트', 'split', age, false, false);
    assert.doesNotMatch(t, TKD);
    assert.doesNotMatch(t, /faceless/);
    assert.match(t, /Korean daycare center/);
    assert.match(t, /Everything looks safe/);
    assert.match(t, /Draw clear, friendly facial features/);
  }
  assert.match(IMG.daycareBackgroundPrompt('x', '깔끔한 정보형', 'split', 'infant'), /1 to 2 years old/);
  assert.equal(IMG.ageFor('영아 (만 0~2세) 낮잠'), 'infant');
  assert.equal(IMG.ageFor('유아 (만 3~5세) 숲 체험'), 'preschool');
  assert.equal(IMG.ageFor('영아 (만 0~2세) · 유아 (만 3~5세)'), 'mixed');
  assert.match(IMG.daycareRefLead(true, true, true), /Reference image 1 shows the CHILDREN's daycare uniform.*Reference image 2 shows the daycare classroom.*Reference image 3 is the daycare LOGO/);
  assert.equal(IMG.daycareRefLead(false, false), '');
  assert.match(IMG.daycareBackgroundPrompt('x', '교육 잡지형', 'split', 'mixed', true, true), /only exception is the one small logo patch/);
});

test('카드 디자인: 띠 모양 줄 · 굵은 붓글씨 제목을 쓰지 않음, 기본 색은 어린이집 색', () => {
  for (const style of T.CARD_STYLES) for (const bg of [undefined, 'C:/x.png']) {
    const h = TPL.cardHtml({ copy: { title: '제목', sub: '부제', scene: '' }, index: 1, style, size: '1080x1350', brand: { main: 'bad', accent: 'bad' }, dojoName: '새싹예시어린이집', backgroundFile: bg, fontDir: 'C:/fonts' });
    assert.doesNotMatch(h, /#111 0 50%/);
    assert.doesNotMatch(h, /#title\{font-family:BHS/);
    assert.match(h, /#3E8E6E|#F2A541/);
  }
});

test('제목 머리말은 아파트 기준: [○○아파트 어린이집], 동 이름은 세 편에 한 번', () => {
  const r = A.prefixRotation('서울 동작구 신대방동', [...AREAS, { name: '보라매공원', kind: '직접 입력', source: 'manual' }, { name: '한빛단지', kind: '직접 입력', source: 'manual' }]);
  assert.deepEqual(r, ['[신대방동 어린이집]', '[롯데낙천대아파트 어린이집]', '[보라매삼성아파트 어린이집]', '[신대방동 어린이집]', '[보라매공원 근처 어린이집]', '[한빛단지 어린이집]']);
  assert.ok(!r.some((x) => /먼아파트|보라매초|신대방역/.test(x))); // 500m 밖 아파트 · 학교 · 역은 돌리지 않음
  assert.equal(A.autoPrefix('서울 동작구 신대방동', AREAS, 1), '[롯데낙천대아파트 어린이집]');
  assert.deepEqual(A.areaTags('서울 동작구 신대방동', AREAS), ['신대방동어린이집', '롯데낙천대아파트어린이집', '보라매삼성아파트어린이집']);
  assert.equal(A.locationLine('새싹예시어린이집', '서울 동작구 신대방동', AREAS), '새싹예시어린이집은 신대방동, 롯데낙천대아파트 · 보라매삼성아파트 · 보라매초 가까이에 있어요.');
  assert.ok(A.mentionsNearby('롯데낙천대 옆에 있어요', AREAS));
  assert.equal(A.dongOf('서울 동작구 신대방동어린이집'), '신대방동');
  const opts = N.prefixOptions('서울 동작구 신대방동', AREAS);
  assert.deepEqual(opts.slice(0, 4), ['[신대방동 어린이집]', '[롯데낙천대아파트 어린이집]', '[보라매삼성아파트 어린이집]', '[먼아파트 어린이집]']); // 이름이 이미 "아파트"로 끝나면 더 붙이지 않음
  assert.ok(opts.includes('[보라매초 근처 어린이집]'));
});

test('키워드: 어린이집 말로 조회 · 고르기', () => {
  assert.deepEqual(K.topicTerms('적응기간 동안 낮잠을 잘 잤어요'), ['적응기간', '낮잠']);
  assert.deepEqual(K.hintWords('생일잔치 했어요', '서울 동작구 신대방동'), ['어린이집', '신대방동어린이집', '생일잔치', '어린이집생일잔치']);
  const rows = [
    { keyword: '어린이집', source: 'naver' as const, pc: '9000', mobile: '40000' },
    { keyword: '어린이집낮잠', source: 'naver' as const, pc: '30', mobile: '300' },
    { keyword: '신대방동어린이집', source: 'naver' as const, pc: '40', mobile: '200' },
    { keyword: '낮잠', source: 'naver' as const, pc: '9000', mobile: '20000' }, // 넓은 말 (아이 · 어린이집 말이 없음)
  ];
  assert.deepEqual(K.pickKeywords(rows, '낮잠 시간', '서울 동작구 신대방동'), { main: '어린이집낮잠', subs: ['신대방동어린이집'] });
  assert.equal(K.pickKeywords([{ keyword: '무관', source: 'naver', pc: '10', mobile: '10' }], '배변훈련', '서울').main, '어린이집 배변훈련');
  assert.equal(V.spacedKeyword('신대방동어린이집'), '신대방동 어린이집');
  assert.equal(V.spacedKeyword('신대방동국공립어린이집'), '신대방동 국공립어린이집');
});

test('한 줄 메모: 입소 · 행사 · 나이 · 선생님 글 마무리', () => {
  assert.equal(Q.quickKind('2027년 3월 입소 상담 안내'), '모집 안내');
  assert.equal(Q.quickKind('10월 30일 생일잔치 안내'), '행사 안내');
  assert.equal(Q.quickKind('낮잠을 안 자는 아이 어떻게 하나요?'), '교육 정보');
  assert.equal(Q.quickKind('햇님반 친구들이랑 낙엽 밟기 놀이를 했어요'), '수업 후기');
  assert.equal(Q.quickEnding('수업 후기'), '어린이집 소개로 마무리');
  assert.equal(Q.quickEnding('수업 후기', true), '가정에서 해 볼 것으로 마무리');
  assert.equal(Q.quickEnding('모집 안내', true), '입소 상담 안내로 마무리');
  assert.equal(QI.quickAudience('만 1세 아기 적응', prof()), '영아 (만 0~2세)');
  assert.equal(QI.quickAudience('6살 숲 체험', prof()), '유아 (만 3~5세)');
  assert.equal(QI.quickAudience('모두 함께 놀이', prof()), '영아 (만 0~2세) · 유아 (만 3~5세)');
  const q = QI.buildQuickInput({ memo: '햇님반 친구들이 촉감놀이를 했어요', profile: prof(), withCards: true, titlePrefix: '', writer: TEACHER, writerSign: true });
  assert.equal(q.writer?.className, '햇님반');
  assert.equal(q.writerSign, true);
  assert.equal(q.ending, '가정에서 해 볼 것으로 마무리');
  assert.equal(QI.emptyInput().audience, '유아 (만 3~5세)');
  assert.equal(QI.buildQuickInput({ memo: 'x', profile: prof(), withCards: true, titlePrefix: '' }).writer, undefined);
});

test('점검: 입소 약속 · 진단 · 발달 효과 · 사실에 없는 금액 · 메모 속 아이 이름', () => {
  const i = input();
  const codes = (text: string) => V.localFlags(doc(text), prof(), i).map((f) => f.code);
  assert.ok(codes('대기 없이 바로 입소할 수 있어요.').includes('banned'));
  assert.ok(codes('발달 지연이 있는 아이도 괜찮아요.').includes('banned'));
  assert.ok(codes('언어 발달이 빨라져요.').includes('banned'));
  assert.ok(codes('보육료는 월 20만 원이에요.').includes('fee'));
  assert.ok(!codes('필요경비는 월 3만 원이에요.').includes('fee')); // 메모에 있는 금액
  assert.ok(codes('민준이가 웃었어요.').includes('child-name'));
  assert.ok(!codes('한 친구가 웃었어요.').includes('child-name'));
  assert.deepEqual(V.childNames('민준이가 왔고 서연이는 울었어요. 아이가 놀이를 하고 선생님이 친구들이랑 어린이가 물놀이를 했어요'), ['민준', '서연']);
  assert.equal(V.hideChildNames('민준이가 반죽을 만졌어요', ['민준']), '한 친구가 반죽을 만졌어요');
  assert.deepEqual(V.unknownAmounts('월 15만 원, 30,000원', '30000원'), ['15만 원']); // 쉼표 · 띄어쓰기가 달라도 같은 금액
});

test('버그 점검 (2026-10-27): 아이 이름 오탐 · 놓침 · 조사', () => {
  assert.deepEqual(V.childNames('낙엽이 바스락거렸어요, 기분이 좋아 보였어요. 간식이 맛있었어요. 급식이 따뜻했어요. 아이가 웃었어요. 다시 해 봤어요'), []);
  assert.deepEqual(V.childNames('채원이가 블록을 쌓았어요. 지우가 웃었어요. 서아는 울었어요. 민준을 안아 줬어요').sort(), ['민준', '서아', '지우', '채원']);
  assert.deepEqual(V.childNames('김민준이가 왔어요'), ['김민준']);
  assert.equal(V.hideChildNames('민준을 안아 줬어요. 지우는 웃었고 채원이가 박수를 쳤어요. 민준이 웃었어요.', ['민준', '지우', '채원']),
    '한 친구를 안아 줬어요. 한 친구는 웃었고 한 친구가 박수를 쳤어요. 한 친구가 웃었어요.');
  assert.equal(V.hideChildNames('기분이 좋아지는 낙엽 놀이', V.childNames('낙엽이 바스락, 기분이 좋아요')), '기분이 좋아지는 낙엽 놀이'); // 카드가 망가지지 않음
  // 어린이집 정보("자체 조리 급식이 …")는 이름을 찾는 곳이 아님
  assert.ok(!V.localFlags(doc('급식이 맛있어요.'), prof({ otherFacts: '자체 조리 급식이 자랑이에요' }), input()).some((f) => f.code === 'child-name' && /급식/.test(f.message)));
});

test('버그 점검 (2026-10-27): 금액 · 키워드 띄어쓰기 · 중복 경고 · 재료 판단', () => {
  assert.deepEqual(V.unknownAmounts('월 5천 원, 3만 원', '30,000원'), ['5천 원']); // 3만 원 = 30,000원, 천 원도 셈
  assert.equal(V.spacedKeyword('물놀이'), '물놀이');
  assert.equal(V.spacedKeyword('신대방동어린이집'), '신대방동 어린이집');
  const adhd = V.localFlags(doc('ADHD 이야기와 면역력 이야기'), prof(), input()).filter((f) => f.code === 'banned');
  assert.equal(adhd.length, 1); // 같은 섹션에 같은 말 경고 한 번 (BANNED 한 줄에 둘 다 걸림)
  const recruit = input({ kind: '모집 안내', topic: '입소 안내', facts: { ...QI.emptyInput().facts, activities: '', recruit: { who: '2027년 3월 만 1세 · 만 2세', trial: '아이사랑 포털 대기 신청 후 원으로 상담 전화' } } });
  assert.equal(V.thinFacts(recruit), false);
});

test('버그 점검 (2026-10-27): 나이 · 그림 장소 · 장면 영어', () => {
  assert.equal(QI.quickAudience('아기상어 율동 놀이를 했어요', prof()), '영아 (만 0~2세) · 유아 (만 3~5세)');
  assert.equal(IMG.ageFor('아기상어 율동'), 'mixed');
  assert.equal(I.daycareAge('3살 친구들'), 'infant');
  assert.equal(I.daycareAge('만 4세 숲 체험'), 'preschool');
  assert.match(IMG.daycareSetting('a teacher walking around the classroom while toddlers paint'), /daycare classroom/);
  assert.match(IMG.daycareSetting('a field trip to a museum'), /daycare classroom/);
  assert.match(IMG.daycareSetting('children walking in a park'), /outdoor/);
  assert.equal(IMG.daycareSafeScene('a unicorn puppet show'), 'a unicorn puppet show');
  assert.equal(IMG.daycareSafeScene('a faceless child painting'), 'a child painting');
});

test('강점: 어린이집 목록 · 체크 안 한 서비스 경고', () => {
  assert.ok(S.STRENGTHS.some((s) => s.id === 'extended' && s.label === '연장보육'));
  assert.ok(!S.STRENGTHS.some((s) => /시범단|국기원|줄넘기/.test(s.label)));
  const m = S.uncheckedMentions('연장보육도 하고 셔틀도 있어요', { strengths: ['extended'] });
  assert.deepEqual(m, ['어린이집 정보에서 체크하지 않은 "차량 운행" 이야기가 글에 있어요. 실제로 하는 게 아니면 빼고 올려 주세요.']);
  assert.match(S.composeClassFeatures({ promoDay: '매달 생일잔치', strengths: ['meal'] }), /정기 행사: 매달 생일잔치\n우리 어린이집에서 실제로 하는 것 .*자체 조리 급식/);
});

test('글쓴이 한 줄 · 소제목 이모지', () => {
  assert.equal(ART.writerSignLine(input({ writer: TEACHER, writerSign: true }), prof()), '햇님반 담임 김하늘 선생님 드림');
  assert.equal(ART.writerSignLine(input({ writer: { id: 'd', role: '원장', name: '이봄' }, writerSign: true }), prof()), '새싹예시어린이집 원장 이봄 드림');
  assert.equal(ART.writerSignLine(input({ writer: TEACHER, writerSign: false }), prof()), '');
  const out = ART.withWriterSign(doc('끝이에요.'), input({ writer: TEACHER, writerSign: true }), prof());
  assert.equal(out.sections.at(-1)!.paragraphs.at(-1), '햇님반 담임 김하늘 선생님 드림');
  assert.equal(ART.withWriterSign(out, input({ writer: TEACHER, writerSign: true }), prof()), out); // 두 번 붙이지 않음
  assert.equal(F.decorateHeadings(doc('x')).sections[1].heading, '🌱 오늘 놀이');
});
