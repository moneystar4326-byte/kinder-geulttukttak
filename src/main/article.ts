// 글 생성 파이프라인 (기획서 6장)
// 입력 검증 → 지침 조립 → AI 초안 → 로컬 길이 · 반복 검사 → 지어낸 문장 검사 → AI 사실 비교(보조 점검) → 새 버전 저장
import type { Db } from './db';
import type { ArticleDoc, ArticleInput, DojoProfile, RevisionKind } from '../shared/types';
import { bodyText, countDoc, minCharsForInput } from '../shared/count';
import { styleIssues } from '../shared/overused';
import { factsBlock } from './services/openai/prompts';
import { localFlags, missingInputs, regionWarning } from '../shared/validation';
import { areaTags, dongOf, locationLine, mentionsNearby } from '../shared/areas';
import { decorateHeadings } from '../shared/format';
import { hideSceneNames, keepPhotoLinks, photoLinkErrors } from '../shared/photos';
import type { CallOpts, Fix, TextAI, VerifyIssue } from './services/openai';

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

// 본문(+ 첫인사 · 끝인사)에 유치원 이름이 한 번도 없으면 마지막 섹션 끝에 한 줄 (2026-10-22 파일럿: 글에 상호명이 안 나옴)
export function withDojoName(doc: ArticleDoc, profile: DojoProfile, extra = ''): ArticleDoc {
  const name = profile.name.trim();
  const flat = (t: string) => t.replace(/\s+/g, '');
  if (!name || !doc.sections.length || flat(bodyText(doc) + extra).includes(flat(name))) return doc;
  const last = name.charCodeAt(name.length - 1) - 0xac00;
  const josa = last >= 0 && last < 11172 && last % 28 ? '은' : '는';
  const where = dongOf(profile.region) || profile.region.trim();
  return appendLine(doc, `${name}${josa} ${where ? `${where}에서 ` : ''}아이들과 함께하고 있어요.`);
}

// 연락처를 넣기로 한 글(모집 · 행사 한 줄 쓰기, 자세히 쓰기에서 고른 글)인데 본문에 연락처가 없으면 마지막 섹션 끝에 한 줄
// (2026-10-29 유치원 정보 점검: 연락처를 넘겨도 AI가 "유치원으로 문의해 주세요"만 쓰고 번호를 빼먹음)
export function contactLine(input: ArticleInput, profile: DojoProfile) {
  if (!input.includeProfile.contact) return '';
  const items = [profile.contact?.trim(), profile.consultLink?.trim()].filter(Boolean) as string[];
  return items.length ? `상담 문의: ${items.join(' · ')}` : '';
}
export function withContact(doc: ArticleDoc, input: ArticleInput, profile: DojoProfile, extra = ''): ArticleDoc {
  const line = contactLine(input, profile);
  if (!line || !doc.sections.length) return doc;
  const flat = (t: string) => t.replace(/[\s-]/g, '');
  const text = flat(bodyText(doc) + extra);
  const items = [profile.contact?.trim(), profile.consultLink?.trim()].filter(Boolean) as string[];
  if (items.every((x) => text.includes(flat(x)))) return doc;
  return appendLine(doc, line);
}

// 유치원: 글 끝 글쓴이 한 줄 (고른 경우만, 적어 준 이름 · 반 그대로 — 기획안 v0.2 4장)
export function writerSignLine(input: ArticleInput, profile: DojoProfile) {
  const w = input.writer;
  if (!w || !input.writerSign) return '';
  const name = w.name.trim();
  if (w.role === '원장') return `${profile.name.trim()} 원장${name ? ` ${name}` : ''} 드림`;
  return `${w.className?.trim() ? `${w.className.trim()} ` : ''}담임${name ? ` ${name}` : ''} 선생님 드림`;
}
// 맨 끝 문단이 글쓴이 줄이면 떼어 냄: 다시 다듬을 때 끝인사를 찾고, 끝인사 → 글쓴이 줄 순서를 지키려고
export function stripWriterSign(doc: ArticleDoc, input: ArticleInput, profile: DojoProfile): ArticleDoc {
  const line = writerSignLine(input, profile);
  const end = doc.sections[doc.sections.length - 1];
  if (!line || !end || end.paragraphs[end.paragraphs.length - 1]?.trim() !== line) return doc;
  return { ...doc, sections: [...doc.sections.slice(0, -1), { ...end, paragraphs: end.paragraphs.slice(0, -1) }] };
}
export function withWriterSign(doc: ArticleDoc, input: ArticleInput, profile: DojoProfile): ArticleDoc {
  const line = writerSignLine(input, profile);
  if (!line || !doc.sections.length || bodyText(doc).includes(line)) return doc;
  return appendLine(doc, line);
}

// 첫인사 · 끝인사 (태권 글뚝딱 2.2.11에서 옮김): 유치원 정보에 적은 그대로 첫 문단 앞 · 마지막 문단 뒤에 코드가 붙임
// 이미 붙어 있으면 떼고 다시 붙여서 두 번 들어가지 않음 (다시 다듬기 등)
export function greetingsOf(profile: DojoProfile, input: Pick<ArticleInput, 'greetings'>) {
  if (input.greetings === false) return { greeting: '', closing: '' };
  return { greeting: profile.greeting?.trim() ?? '', closing: profile.closing?.trim() ?? '' };
}
export function stripGreetings(doc: ArticleDoc, profile: DojoProfile): ArticleDoc {
  const g = profile.greeting?.trim();
  const c = profile.closing?.trim();
  const sections = doc.sections.map((s, i) => {
    let ps = s.paragraphs;
    if (g && i === 0 && ps[0]?.trim() === g) ps = ps.slice(1);
    if (c && i === doc.sections.length - 1 && ps[ps.length - 1]?.trim() === c) ps = ps.slice(0, -1);
    return ps === s.paragraphs ? s : { ...s, paragraphs: ps };
  });
  return { ...doc, sections };
}
export function withGreetings(doc: ArticleDoc, profile: DojoProfile, input: Pick<ArticleInput, 'greetings'>): ArticleDoc {
  const { greeting, closing } = greetingsOf(profile, input);
  const base = stripGreetings(doc, profile);
  if (!base.sections.length || (!greeting && !closing)) return base;
  const n = base.sections.length;
  const sections = base.sections.map((s, i) => ({
    ...s,
    paragraphs: [...(greeting && i === 0 ? [greeting] : []), ...s.paragraphs, ...(closing && i === n - 1 ? [closing] : [])],
  }));
  return { ...base, sections };
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
  let input = art.input;
  const photoIds = input.photoScenes?.map((s) => s.id);
  const miss = missingInputs(input);
  if (miss.length) throw new Error(`먼저 채워 주세요: ${miss.join(', ')}`);
  const baseVersionId = art.currentVersionId;
  const o: CallOpts = { signal: ctx.signal, onUsage: deps.onUsage };
  db.setArticleStatus(articleId, 'generating');
  try {
    // 사진 글: 장면 칸에서 글 성격 · 주제 설명 글감을 먼저 정함 (자세히 쓰기와 같은 길 — 태권 글뚝딱 2.5.0에서 옮김). 실패해도 글은 만듦
    if (photoIds && !input.brief) {
      ctx.step('장면 정리 중');
      try {
        const brief = await ai.brief({ kind: input.kind, topic: input.topic, story: input.facts.story ?? '' }, o);
        input = { ...input, brief };
        db.updateArticleInput(articleId, input, art.keywords);
      } catch (e: any) { if (ctx.signal.aborted || e?.name === 'AbortError' || e?.code === 'cancelled') throw e; }
    }
    ctx.step('글 생성 중');
    let doc = await ai.generate(profile, input, regionWarning(input, profile), o);
    if (photoIds && photoLinkErrors(doc, photoIds).length) { // 사진 연결이 틀리면 한 번만 다시, 그래도 틀리면 글을 넘기지 않음
      ctx.step('사진 연결 다시 맞추는 중');
      doc = await ai.generate(profile, input, regionWarning(input, profile), o);
      const errs = photoLinkErrors(doc, photoIds);
      if (errs.length) throw new Error(`글과 사진을 연결하지 못했어요. 다시 시도해 주세요. (${errs[0]})`);
    }
    // 사진 글: 검사 · 다듬기가 섹션을 없애 사진 연결이 깨지면 그 단계 전 글을 씀
    const linked = (next: ArticleDoc, prev: ArticleDoc) => {
      if (!photoIds) return next;
      const kept = keepPhotoLinks(prev, next);
      return photoLinkErrors(kept, photoIds).length ? prev : kept;
    };
    const expands = 0;
    ctx.step('검증 중');
    db.setArticleStatus(articleId, 'validating');
    const min = minCharsForInput(input);
    // 2026-11-05 사용자: 다시 쓸수록 표현이 평평해짐 → 분량 보완 · 전체 다듬기 · 2차 점검을 빼고, 사실과 다른 문장만 고침
    ctx.step('지어낸 문장 검사 중');
    doc = linked(await verifyDoc(ai, doc, profile, input, o, ctx.signal), doc);
    ctx.step('문장 호흡 다듬는 중');
    doc = linked(await warmDoc(ai, doc, profile, input, o, ctx.signal), doc);
    // 사진 글: 장면 칸에 적힌 아이 이름이 글에 들어가면 코드가 "한 친구"로 바꿈 (안내를 해도 들어가는 일이 있음)
    if (input.photoScenes) doc = hideSceneNames(doc, input.photoScenes.map((s) => s.title));
    ctx.step('사실 비교 점검 중');
    // 점검 실패는 표시만 하고 넘어가되, 멈추기를 눌렀으면 저장하지 않고 멈춤 (2026-10-18 버그 점검)
    const aiFlags = await ai.review(doc, profile, input, o).catch((e) => {
      if (ctx.signal.aborted || e?.name === 'AbortError' || e?.code === 'cancelled') throw e;
      return [{ code: 'review-failed', message: 'AI 사실 점검을 하지 못했어요. 직접 확인해 주세요.' }];
    });
    ctx.signal.throwIfAborted();
    // 지역 태그는 코드가 붙임 (동네 · 가까운 아파트 + 유치원)
    const tags = [...new Set([...areaTags(profile.region, profile.nearbyAreas ?? []), ...doc.tags])].slice(0, 15);
    const gr = greetingsOf(profile, input);
    // 순서: 위치 · 유치원 이름 → 첫인사 · 끝인사 → 글쓴이 줄 (끝인사 다음에 "○○ 드림")
    doc = decorateHeadings(withWriterSign(withGreetings(withContact(withDojoName(withLocation({ ...doc, tags }, profile), profile, gr.greeting + gr.closing), input, profile, gr.greeting + gr.closing), profile, input), input, profile)); // 소제목 이모지는 코드가 같은 모양으로
    doc = { ...doc, reviewFlags: mergeFlags(doc, profile, input, aiFlags) };
    const counts = countDoc(doc);
    const short = counts.withoutSpaces < min;
    const title = titleWithPrefix(doc.titleCandidates[0] ?? input.topic, input.titlePrefix);
    const r = db.addVersion({ articleId, title, doc, counts, note: 'AI 생성' }, { baseVersionId });
    db.setArticleStatus(articleId, 'review');
    return { version: r.version, current: r.current, short, expands };
  } catch (e) {
    db.setArticleStatus(articleId, db.getArticle(articleId)?.currentVersionId ? 'review' : 'draft');
    throw e;
  }
}

// 흐름 다듬기 (2026-10-18). 실패하거나 분량 · 섹션이 줄면 다듬기 전 글을 그대로 씀 — 멈추기만 그대로 던짐
export async function polishDoc(ai: TextAI, doc: ArticleDoc, input: ArticleInput, o: CallOpts, signal: AbortSignal, min = minCharsForInput(input)): Promise<ArticleDoc> {
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

// 흐름 2차 점검의 고칠 문장을 글에 적용. 글에 그대로 있는 문장만, 사실에 없던 숫자가 생기거나 분량이 기준 아래로 내려가면 건너뜀
export function applyFixes(doc: ArticleDoc, fixes: Fix[], min: number): { doc: ArticleDoc; count: number } {
  let out = doc;
  let count = 0;
  const digits = (t: string): string[] => t.match(/\d+/g) ?? [];
  for (const f of fixes) {
    const before = f.before.trim();
    const after = f.after.trim();
    if (!before || before === after || digits(after).some((d) => !digits(before).includes(d))) continue;
    // 섹션 id 가 틀려도 글 전체에서 찾음 (그 섹션 먼저)
    const order = [...out.sections.filter((s) => s.id === f.sectionId), ...out.sections.filter((s) => s.id !== f.sectionId)];
    const sec = order.find((s) => s.paragraphs.some((p) => p.includes(before)));
    if (!sec) continue;
    const sections = out.sections.map((s) => (s !== sec ? s : {
      ...s,
      paragraphs: s.paragraphs.map((p) => (p.includes(before) ? p.replace(before, after).replace(/\s{2,}/g, ' ').trim() : p)).filter(Boolean),
    }));
    const next = { ...out, sections };
    if (countDoc(next).withoutSpaces < min && countDoc(next).withoutSpaces < countDoc(out).withoutSpaces) continue;
    out = next;
    count++;
  }
  return { doc: out, count };
}

export async function proofreadDoc(ai: TextAI, doc: ArticleDoc, input: ArticleInput, o: CallOpts, signal: AbortSignal, min = minCharsForInput(input)) {
  try {
    return applyFixes(doc, await ai.proofread(doc, input, o), min);
  } catch (e: any) {
    if (signal.aborted || e?.name === 'AbortError' || e?.code === 'cancelled') throw e;
    return { doc, count: 0 };
  }
}

// 재료 낱말이 글에 남았는지 보려고 뽑음 (조사는 끝 글자를 빼고 비교)
const factWords = (text: string) => [...new Set(text.split(/[\s,.!?·()]+/).filter((w) => /^[가-힣A-Za-z]{2,}$/.test(w)).map((w) => (w.length > 2 ? w.slice(0, -1) : w)))];

// 호흡 다듬기 결과를 쓸지 판단 (2026-11-05): 소제목 수가 같고, 없던 숫자가 없고, 숫자 · 검색어 · 재료 낱말을 잃지 않고, 분량이 너무 줄지 않을 때만
export function acceptWarm(before: ArticleDoc, after: ArticleDoc['sections'], keywords: string[] = [], facts = ''): ArticleDoc | null {
  if (after.length !== before.sections.length) return null;
  const next: ArticleDoc = { ...before, sections: after.map((s, i) => ({ ...s, id: before.sections[i].id, heading: before.sections[i].heading })) };
  const a = bodyText(before);
  const b = bodyText(next);
  const nums = (t: string) => new Set(t.match(/\d+/g) ?? []);
  const na = nums(a);
  const nb = nums(b);
  if ([...nb].some((x) => !na.has(x)) || [...na].some((x) => !nb.has(x))) return null;
  const flat = (t: string) => t.replace(/\s+/g, '');
  if (keywords.map(flat).filter((k) => k && flat(a).includes(k)).some((k) => !flat(b).includes(k))) return null;
  // 반복을 지우므로 분량은 줄어도 되지만, 재료 낱말은 지켜야 함
  const had = factWords(facts).filter((w) => a.includes(w));
  if (had.filter((w) => !b.includes(w)).length > had.length * 0.15) return null;
  if (countDoc(next).withoutSpaces < countDoc(before).withoutSpaces * 0.5) return null;
  return next;
}

// 말투를 입히고, 프로그램이 센 문제가 남으면 한 번만 더 (실패하거나 조건에 맞지 않으면 앞 글 그대로, 멈추기만 던짐)
export async function warmDoc(ai: TextAI, doc: ArticleDoc, profile: DojoProfile, input: ArticleInput, o: CallOpts, signal: AbortSignal): Promise<ArticleDoc> {
  const keywords = [input.mainKeyword, ...input.subKeywords];
  const facts = bodyTextOfFacts(input);
  try {
    const first = acceptWarm(doc, await ai.warm(doc, profile, input, o), keywords, facts) ?? doc;
    const issues = styleIssues(first, input.kind);
    if (!issues.length) return first;
    return acceptWarm(first, await ai.warm(first, profile, input, o, issues.join(' ')), keywords, facts) ?? first;
  } catch (e: any) {
    if (signal.aborted || e?.name === 'AbortError' || e?.code === 'cancelled') throw e;
    return doc;
  }
}
const bodyTextOfFacts = (input: ArticleInput) => factsBlock(input).replace(/^[^:\n]*:\s*/gm, '').replace(/\(없음[^)]*\)/g, '');

// 이야기 글 지어낸 문장 검사 (태권 글뚝딱 2026-10-28에서 옮김): 지어낸 문장 · 틀린 숫자 · 해설 · 되풀이를 그 문장만 고침. 검사가 실패하면 고치지 않은 글 그대로 (멈추기만 던짐)
export async function verifyDoc(ai: TextAI, doc: ArticleDoc, profile: DojoProfile, input: ArticleInput, o: CallOpts, signal: AbortSignal): Promise<ArticleDoc> {
  try {
    return applyVerifyFixes(doc, await ai.verify(doc, profile, input, o), [input.mainKeyword, ...input.subKeywords]);
  } catch (e: any) {
    if (signal.aborted || e?.name === 'AbortError' || e?.code === 'cancelled') throw e;
    return doc;
  }
}

// 문단 안에서 그 문장만 바꾸거나 지움. 검색어가 든 문장은 지우지 않음 (태권 글뚝딱 2026-10-28 시험: 검사가 검색어 문장을 지움)
// 흐름 2차 점검의 applyFixes 와 달리 분량 기준은 보지 않음 (이야기 글은 짧아도 됨). 비게 된 문단 · 섹션은 뺌 (첫 섹션 도입은 남김)
export function applyVerifyFixes(doc: ArticleDoc, issues: VerifyIssue[], keywords: string[] = []): ArticleDoc {
  const flat = (t: string) => t.replace(/\s+/g, '');
  const kws = keywords.map(flat).filter(Boolean);
  let sections = doc.sections.map((s) => ({ ...s, paragraphs: [...s.paragraphs] }));
  for (const it of issues) {
    const from = it.sentence.trim();
    if (from.length < 4) continue;
    const to = it.fix.trim();
    if (!to && kws.some((k) => flat(from).includes(k))) continue;
    for (const s of sections) {
      const i = s.paragraphs.findIndex((p) => p.includes(from));
      if (i < 0) continue;
      s.paragraphs[i] = s.paragraphs[i].replace(from, to).replace(/ {2,}/g, ' ').trim();
      break;
    }
  }
  // 문장을 지우고 이모지만 남은 문단도 뺌 (2026-11-05 시험)
  sections = sections.map((s) => ({ ...s, paragraphs: s.paragraphs.filter((p) => /[^\s\p{Extended_Pictographic}\u{FE0F}\u{200D}]/u.test(p)) })).filter((s, i) => i === 0 || s.paragraphs.length);
  return { ...doc, sections };
}

// AI 메모 + 코드 점검을 합침 (중복 제거). 분량 부족은 추가 재료 요청으로
export function mergeFlags(doc: ArticleDoc, profile: DojoProfile, input: ArticleInput, aiFlags: ArticleDoc['reviewFlags']) {
  // 2026-11-05: 분량 보완을 하지 않으므로 모든 글을 이야기 글처럼 재료 안내만
  const story = true;
  // 이야기 글은 짧아도 실패가 아님 → "짧아요" 경고 대신 아래 재료 안내 하나만
  const flags = [...doc.reviewFlags, ...aiFlags, ...localFlags(doc, profile, input).filter((f) => !(story && f.code === 'too-short'))];
  const min = minCharsForInput(input);
  // 사진 글: 장면 칸이 짧으면 글도 짧게 씀 (태권 글뚝딱 2026-11-05에서 옮김)
  if (input.photoScenes && input.photoScenes.some((s) => s.title.replace(/\s/g, '').length < 15)) flags.push({ code: 'need-more-facts', message: '장면이 짧은 사진이 있어 글도 짧게 썼어요. 찍을 때 있었던 일을 한 줄 더 적으면 글이 더 따뜻해져요.' });
  else if (input.photoScenes && countDoc(doc).withoutSpaces < min) flags.push({ code: 'need-more-facts', message: `지어내지 않으려고 글을 짧게 썼어요. 사진마다 장면 칸을 조금 더 자세히 적으면 ${min.toLocaleString()}자 넘게 쓸 수 있어요.` });
  else if (countDoc(doc).withoutSpaces < min) flags.push({ code: 'need-more-facts', message: story
    ? `재료가 짧아 글도 짧게 썼어요 (지어내지 않으려고요). ② 단계 물음에 답하거나 "어떤 일이 있었나요?"에 장면 · 아이들 모습을 한 줄 더 적으면 ${min.toLocaleString()}자 넘게 쓸 수 있어요.`
    : `보완해도 ${min.toLocaleString()}자에 모자라요. 한 놀이 · 활동, 선생님이 도운 점, 관찰 장면을 조금 더 적어 주시면 다시 만들 수 있어요.` });
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
    // 원래 글에 지금 인사 문장이 있을 때만 다시 붙임 (인사를 바꾼 뒤 옛 글을 다듬어도 두 번 들어가지 않게)
    // 유치원: 글쓴이 줄을 먼저 떼야 끝인사가 마지막 문단으로 보임 (글쓴이 줄은 아래에서 다시 붙임)
    const noSign = stripWriterSign(base.doc, art.input, profile);
    const bare = stripGreetings(noSign, profile);
    const revised = decorateHeadings(await ai.revise(req.kind, bare, o, minCharsForInput(art.input)));
    // AI가 다시 쓰면 연락처 줄이 빠질 수 있어 다시 확인 (끝인사보다 앞에)
    const withC = withContact(revised, art.input, profile);
    doc = bodyText(bare) !== bodyText(noSign) ? withGreetings(withC, profile, art.input) : withC;
    doc = { ...doc, titleCandidates: base.doc.titleCandidates };
    note = label;
  }
  // AI가 글 전체를 다시 쓰면 고른 글쓴이 줄이 빠질 수 있어 다시 붙임 (유치원 · 2026-10-27 버그 점검)
  doc = withWriterSign(doc, art.input, profile);
  doc = { ...doc, reviewFlags: mergeFlags({ ...doc, reviewFlags: [] }, profile, art.input, doc.reviewFlags.filter((f) => f.code === 'demo')) };
  if (art.input.photoScenes) { // 다듬기 AI가 섹션을 없애 사진 연결이 깨지면 저장하지 않음
    doc = keepPhotoLinks(base.doc, doc);
    if (photoLinkErrors(doc, art.input.photoScenes.map((s) => s.id)).length) throw new Error('고치는 중에 글과 사진 연결이 깨져서 저장하지 않았어요. 다시 시도해 주세요.');
  }
  // 사용자가 그동안 고쳐 저장했다면 base 와 현재가 달라 → 새 버전은 남기되 현재 글을 덮어쓰지 않음
  ctx.signal.throwIfAborted();
  return db.addVersion({ articleId, title, doc, counts: countDoc(doc), note }, { baseVersionId: req.baseVersionId });
}
