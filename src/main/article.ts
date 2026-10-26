// 글 생성 파이프라인 (기획서 6장)
// 입력 검증 → 지침 조립 → AI 초안 → 로컬 길이 · 반복 검사 → 모자라면 최대 2회 보완 → AI 사실 비교(보조 점검) → 새 버전 저장
import type { Db } from './db';
import type { ArticleDoc, ArticleInput, DojoProfile, RevisionKind } from '../shared/types';
import { bodyText, countDoc, minCharsFor } from '../shared/count';
import { localFlags, missingInputs, regionWarning } from '../shared/validation';
import { areaTags, dongOf, locationLine, mentionsNearby } from '../shared/areas';
import { decorateHeadings } from '../shared/format';
import type { CallOpts, TextAI } from './services/openai';
import { isDaycare } from '../shared/industry';

export const MAX_EXPAND = 2;

// 마지막 섹션 끝에 문단 한 줄 (위치 · 이름 · 글쓴이 줄이 같이 씀)
const appendLine = (doc: ArticleDoc, line: string): ArticleDoc => {
  const end = doc.sections[doc.sections.length - 1];
  return { ...doc, sections: [...doc.sections.slice(0, -1), { ...end, paragraphs: [...end.paragraphs, line] }] };
};

// 본문에 주변 학교 · 역 이름이 없으면 마지막 섹션 끝에 위치 한 줄
export function withLocation(doc: ArticleDoc, profile: DojoProfile): ArticleDoc {
  const areas = profile.nearbyAreas ?? [];
  if (!doc.sections.length || mentionsNearby(bodyText(doc), areas)) return doc;
  const line = locationLine(profile.name, profile.region, areas);
  if (!line) return doc;
  return appendLine(doc, line);
}

// 본문에 도장 이름이 한 번도 없으면 마지막 섹션 끝에 한 줄 (2026-10-22 파일럿: 글에 상호명이 안 나옴)
export function withDojoName(doc: ArticleDoc, profile: DojoProfile): ArticleDoc {
  const name = profile.name.trim();
  const flat = (t: string) => t.replace(/\s+/g, '');
  if (!name || !doc.sections.length || flat(bodyText(doc)).includes(flat(name))) return doc;
  const last = name.charCodeAt(name.length - 1) - 0xac00;
  const josa = last >= 0 && last < 11172 && last % 28 ? '은' : '는';
  const where = dongOf(profile.region) || profile.region.trim();
  return appendLine(doc, `${name}${josa} ${where ? `${where}에서 ` : ''}아이들과 함께하고 있어요.`);
}

// 어린이집: 글 끝 글쓴이 한 줄 (고른 경우만, 적어 준 이름 · 반 그대로 — 기획안 v0.2 4장)
export function writerSignLine(input: ArticleInput, profile: DojoProfile) {
  const w = input.writer;
  if (!isDaycare || !w || !input.writerSign) return '';
  const name = w.name.trim();
  if (w.role === '원장') return `${profile.name.trim()} 원장${name ? ` ${name}` : ''} 드림`;
  return `${w.className?.trim() ? `${w.className.trim()} ` : ''}담임${name ? ` ${name}` : ''} 선생님 드림`;
}
export function withWriterSign(doc: ArticleDoc, input: ArticleInput, profile: DojoProfile): ArticleDoc {
  const line = writerSignLine(input, profile);
  if (!line || !doc.sections.length || bodyText(doc).includes(line)) return doc;
  return appendLine(doc, line);
}

export function titleWithPrefix(title: string, prefix?: string) {
  const p = prefix?.trim();
  if (!p || title.startsWith(p)) return title;
  return `${p} ${title}`;
}

export async function generateArticle(deps: { db: Db; ai: TextAI; profile: DojoProfile; onUsage?: CallOpts['onUsage'] }, articleId: string, ctx: { signal: AbortSignal; step: (s: string) => void }) {
  const { db, ai, profile } = deps;
  const art = db.getArticle(articleId);
  if (!art) throw new Error('글을 찾지 못했어요');
  const input = art.input;
  const miss = missingInputs(input);
  if (miss.length) throw new Error(`먼저 채워 주세요: ${miss.join(', ')}`);
  const baseVersionId = art.currentVersionId;
  const o: CallOpts = { signal: ctx.signal, onUsage: deps.onUsage };
  db.setArticleStatus(articleId, 'generating');
  try {
    ctx.step('글 생성 중');
    let doc = await ai.generate(profile, input, regionWarning(input, profile), o);
    let expands = 0;
    ctx.step('검증 중');
    db.setArticleStatus(articleId, 'validating');
    const min = minCharsFor(input.kind);
    while (countDoc(doc).withoutSpaces < min && expands < MAX_EXPAND) {
      expands++;
      ctx.step(`분량 보완 중 (${expands}/${MAX_EXPAND})`);
      doc = await ai.expand(doc, countDoc(doc).withoutSpaces, o, min);
    }
    ctx.step('흐름 다듬는 중');
    doc = await polishDoc(ai, doc, input, o, ctx.signal, min);
    ctx.step('사실 비교 점검 중');
    // 점검 실패는 표시만 하고 넘어가되, 멈추기를 눌렀으면 저장하지 않고 멈춤 (2026-10-18 버그 점검)
    const aiFlags = await ai.review(doc, profile, input, o).catch((e) => {
      if (ctx.signal.aborted || e?.name === 'AbortError' || e?.code === 'cancelled') throw e;
      return [{ code: 'review-failed', message: 'AI 사실 점검을 하지 못했어요. 직접 확인해 주세요.' }];
    });
    ctx.signal.throwIfAborted();
    // 지역 태그는 코드가 붙임 (동네 · 가까운 초등학교 · 역 + 태권도 / 어린이집판은 동네 · 아파트 + 어린이집)
    const tags = [...new Set([...areaTags(profile.region, profile.nearbyAreas ?? []), ...doc.tags])].slice(0, 15);
    doc = decorateHeadings(withWriterSign(withDojoName(withLocation({ ...doc, tags }, profile), profile), input, profile)); // 소제목 이모지는 코드가 같은 모양으로
    doc = { ...doc, reviewFlags: mergeFlags(doc, profile, input, aiFlags) };
    const counts = countDoc(doc);
    const short = counts.withoutSpaces < min;
    const title = titleWithPrefix(doc.titleCandidates[0] ?? input.topic, input.titlePrefix);
    const r = db.addVersion({ articleId, title, doc, counts, note: expands ? `AI 생성 (분량 보완 ${expands}회)` : 'AI 생성' }, { baseVersionId });
    db.setArticleStatus(articleId, 'review');
    return { version: r.version, current: r.current, short, expands };
  } catch (e) {
    db.setArticleStatus(articleId, db.getArticle(articleId)?.currentVersionId ? 'review' : 'draft');
    throw e;
  }
}

// 흐름 다듬기 (2026-10-18). 실패하거나 분량 · 섹션이 줄면 다듬기 전 글을 그대로 씀 — 멈추기만 그대로 던짐
export async function polishDoc(ai: TextAI, doc: ArticleDoc, input: ArticleInput, o: CallOpts, signal: AbortSignal, min = minCharsFor(input.kind)): Promise<ArticleDoc> {
  try {
    const p = await ai.polish(doc, input, o);
    const before = countDoc(doc).withoutSpaces;
    const after = countDoc(p).withoutSpaces;
    // 인사만 담은 마지막 섹션을 앞에 합치는 것(한 개 줄어듦)까지는 허용
    if (p.sections.length < doc.sections.length - 1 || (after < min && after < before)) return doc;
    // 제목 후보 · 태그 · 사진 자리 · 점검 메모는 다듬기 대상이 아님
    return { ...p, titleCandidates: doc.titleCandidates, tags: doc.tags, photoSuggestions: doc.photoSuggestions, reviewFlags: doc.reviewFlags };
  } catch (e: any) {
    if (signal.aborted || e?.name === 'AbortError' || e?.code === 'cancelled') throw e;
    return doc;
  }
}

// AI 메모 + 코드 점검을 합침 (중복 제거). 분량 부족은 추가 재료 요청으로
export function mergeFlags(doc: ArticleDoc, profile: DojoProfile, input: ArticleInput, aiFlags: ArticleDoc['reviewFlags']) {
  const flags = [...doc.reviewFlags, ...aiFlags, ...localFlags(doc, profile, input)];
  const min = minCharsFor(input.kind);
  if (countDoc(doc).withoutSpaces < min) flags.push({ code: 'need-more-facts', message: `보완해도 ${min.toLocaleString()}자에 모자라요. 진행 활동 · 지도 포인트 · 관찰 장면을 조금 더 적어 주시면 다시 만들 수 있어요.` });
  const seen = new Set<string>();
  return flags.filter((f) => { const k = `${f.code}|${f.message}`; return seen.has(k) ? false : (seen.add(k), true); });
}

export async function reviseArticle(deps: { db: Db; ai: TextAI; profile: DojoProfile; onUsage?: CallOpts['onUsage'] }, articleId: string, req: { kind: RevisionKind; baseVersionId: string; sectionId?: string; paragraphIndex?: number; instruction?: string }, ctx: { signal: AbortSignal; step: (s: string) => void }) {
  const { db, ai, profile } = deps;
  const art = db.getArticle(articleId)!;
  const base = db.getVersion(req.baseVersionId);
  if (!base || base.articleId !== articleId) throw new Error('고칠 버전을 찾지 못했어요');
  const o: CallOpts = { signal: ctx.signal, onUsage: deps.onUsage };
  let doc: ArticleDoc;
  let title = base.title;
  let note: string;
  if (req.kind === 'titles') {
    ctx.step('제목 다시 만드는 중');
    const t = await ai.titles(base.doc, art.input, o);
    doc = { ...base.doc, titleCandidates: t };
    title = titleWithPrefix(t[0], art.input.titlePrefix);
    note = '제목 재생성';
  } else if (req.kind === 'paragraph') {
    if (!req.sectionId || req.paragraphIndex == null) throw new Error('고칠 문단을 골라 주세요');
    ctx.step('문단 고치는 중');
    const para = await ai.paragraph(base.doc, req.sectionId, req.paragraphIndex, req.instruction ?? '', o);
    doc = { ...base.doc, sections: base.doc.sections.map((s) => s.id !== req.sectionId ? s : { ...s, paragraphs: s.paragraphs.map((x, i) => (i === req.paragraphIndex ? para : x)) }) };
    note = '선택 문단 수정';
  } else {
    ctx.step('글 다듬는 중');
    const label = { warmer: '더 따뜻하게', professional: '더 전문적으로', 'less-promo': '홍보 줄이기' }[req.kind];
    doc = decorateHeadings(await ai.revise(req.kind, base.doc, o, minCharsFor(art.input.kind)));
    doc = { ...doc, titleCandidates: base.doc.titleCandidates };
    note = label;
  }
  // AI가 글 전체를 다시 쓰면 고른 글쓴이 줄이 빠질 수 있어 다시 붙임 (어린이집 · 2026-10-27 버그 점검)
  doc = withWriterSign(doc, art.input, profile);
  doc = { ...doc, reviewFlags: mergeFlags({ ...doc, reviewFlags: [] }, profile, art.input, doc.reviewFlags.filter((f) => f.code === 'demo')) };
  // 사용자가 그동안 고쳐 저장했다면 base 와 현재가 달라 → 새 버전은 남기되 현재 글을 덮어쓰지 않음
  ctx.signal.throwIfAborted();
  return db.addVersion({ articleId, title, doc, counts: countDoc(doc), note }, { baseVersionId: req.baseVersionId });
}
