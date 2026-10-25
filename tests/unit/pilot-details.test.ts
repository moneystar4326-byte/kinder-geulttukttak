// 2026-10-22 파일럿에서 나온 것: 글에 도장 이름 · 카드 로고 크기 · 그림 속 도복 로고
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withDojoName } from '../../src/main/article';
import { articlePrompt } from '../../src/main/services/openai/prompts';
import { backgroundPrompt, refLead } from '../../src/main/services/openai/image-prompt';
import { cardHtml, logoHeight } from '../../src/main/services/card-renderer/template';
import { DEMO_INPUT, DEMO_PROFILE } from '../../src/main/services/openai/demo';
import type { ArticleDoc, DojoProfile } from '../../src/shared/types';

const doc = (text: string): ArticleDoc => ({
  titleCandidates: ['제목'], tags: [], photoSuggestions: [], reviewFlags: [],
  sections: [{ id: 's1', heading: '', paragraphs: ['첫 문단이에요.'] }, { id: 's2', heading: '마무리', paragraphs: [text] }],
} as ArticleDoc);
const prof = (p: Partial<DojoProfile> = {}): DojoProfile => ({ ...DEMO_PROFILE, name: '글뚝딱태권도', region: '서울 마포구 망원동', nearbyAreas: [], ...p });

test('글에 도장 이름이 없으면 마지막 문단 뒤에 한 줄 붙임 (받침 따라 은/는)', () => {
  const out = withDojoName(doc('오늘도 고마웠어요.'), prof());
  assert.equal(out.sections[1].paragraphs.at(-1), '글뚝딱태권도는 망원동에서 아이들과 함께하고 있어요.');
  const out2 = withDojoName(doc('x'), prof({ name: '강담 태권도장' }));
  assert.match(out2.sections[1].paragraphs.at(-1)!, /^강담 태권도장은 /);
});

test('이미 도장 이름이 있으면 (띄어쓰기가 달라도) 그대로', () => {
  const d = doc('글뚝딱 태권도에서 함께해요.');
  assert.equal(withDojoName(d, prof()), d);
});

test('글 지시문에 도장 이름을 1~2번 넣으라고 적음', () => {
  assert.match(articlePrompt(prof(), DEMO_INPUT, null), /\[도장 이름\] "글뚝딱태권도"/);
});

test('도복 로고: 끄면 로고 금지, 켜면 왼쪽 가슴 패치 · 참고 그림 번호는 도복 → 사범님 → 로고', () => {
  assert.match(backgroundPrompt('x', '따뜻한 일러스트', 'split'), /No badge, emblem, logo/);
  const on = backgroundPrompt('x', '따뜻한 일러스트', 'split', undefined, 'poom', true);
  assert.match(on, /LEFT CHEST/);
  assert.doesNotMatch(on, /No badge, emblem, logo/);
  const lead = refLead(true, true, 'poom', true);
  assert.match(lead, /Reference image 1 is a product photo/);
  assert.match(lead, /Reference image 2 shows the INSTRUCTOR/);
  assert.match(lead, /Reference image 3 is the school LOGO/);
  assert.match(refLead(false, false, 'poom', true), /Reference image 1 is the school LOGO/);
});

test('카드 로고 높이: 기본 120% = 77px, 60~200% 안으로', () => {
  assert.equal(logoHeight(), 77);
  assert.equal(logoHeight(200), 128);
  assert.equal(logoHeight(999), 128);
  assert.equal(logoHeight(10), 38);
  const base = { copy: { title: 't', sub: 's', scene: 'x' }, index: 0, style: '따뜻한 일러스트' as const, size: '1080x1350' as const, brand: { main: '#1F4E9A', accent: '#C8241C' }, dojoName: 'd', fontDir: 'C:/fonts', logoFile: 'C:/logo.png' };
  // AI 그림 카드: 로고가 커지면 글 상자 높이가 그만큼 줄어 겹치지 않음
  const small = cardHtml({ ...base, backgroundFile: 'C:/bg.png', logoScale: 60 });
  const big = cardHtml({ ...base, backgroundFile: 'C:/bg.png', logoScale: 200 });
  assert.match(big, /#logo\{height:128px/);
  const boxH = (html: string) => Number(html.match(/#box\{[^}]*max-height:(\d+)px/)![1]);
  assert.equal(boxH(small) - boxH(big), 128 - 38);
  // 템플릿 카드 (아래 글 상자형): 큰 로고면 글 상자를 위로 올림
  const tpl = cardHtml({ ...base, style: '깔끔한 정보형', logoScale: 200 });
  assert.match(tpl, /#box\{[^}]*bottom:184px/);
});
