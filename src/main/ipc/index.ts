// 화면(Renderer) ↔ 메인 통로. 모든 입력은 zod 로 검사. API 키 원문은 화면으로 돌려주지 않음
import fs from 'node:fs';
import path from 'node:path';
import { app, clipboard, dialog, ipcMain, nativeImage, shell, type BrowserWindow } from 'electron';
import { z } from 'zod';
import type { Db } from '../db';
import type { Vault, SecretName } from '../credentials';
import { checkFormat, SECRET_NAMES } from '../credentials';
import type { JobRunner } from '../jobs';
import { generateArticle, reviseArticle, titleWithPrefix } from '../article';
import { ArticleInputSchema, DocSchema, ProfileInput } from '../../shared/schemas';
import { countDoc } from '../../shared/count';
import { childNames, factsText, hideChildNames, plainBody, thinFacts, withKeywordFallback } from '../../shared/validation';
import type { ArticleDoc, ArticleInput, CardSet, KeywordRow } from '../../shared/types';
import { IND, isDaycare } from '../../shared/industry';
import { CARD_STYLES } from '../../shared/types';
import { loadSettings, saveSettings, type AppSettings } from '../settings';
import { composeClassFeatures } from '../../shared/strengths';
import { createOpenAI, listenHint, type ImageAI, type Listen, type TextAI } from '../services/openai';
import { hintOf, lookupKeywords } from '../services/naver-keywords';
import { collectNearby, prefixOptions } from '../services/nearby';
import { createCardService, type Shooter } from '../services/card-renderer';
import { buildBlocks, STEP_LABEL, type BrowserDraft } from '../services/browser-draft';
import { findBrowser } from '../services/browser-draft/browser';
import { exportFiles, makeBackup, readBackupManifest } from '../backup';
import { ApiError, toApiError } from '../services/errors';
import { log } from '../log';
import { SERVER, type License } from '../license';

export interface AppCtx {
  db: Db;
  vault: Vault;
  runner: JobRunner;
  shooter: Shooter;
  browser: BrowserDraft;
  license: License;
  dataDir: string;
  assetsDir: string;
  fontDir: string;
  win: () => BrowserWindow | null;
  requestRestore: (file: string) => void;
  takeJarvisQuick: () => string;
}

const S = z.string().max(4000);
const Id = z.string().min(1).max(64);

// 오류는 사용자 문장으로만 돌려줌 (API 원문 오류를 주 화면에 그대로 노출하지 않음)
function handle<A extends z.ZodTypeAny>(channel: string, schema: A, fn: (arg: z.infer<A>) => unknown) {
  ipcMain.handle(channel, async (_e, raw) => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? '입력이 올바르지 않아요' };
    try { return { ok: true, data: await fn(parsed.data) }; } catch (e) {
      const err = e instanceof ApiError ? e : null;
      log(`ipc-${channel}`, e instanceof Error ? e.message : String(e));
      return { ok: false, error: err ? err.message : e instanceof Error ? e.message : '문제가 생겼어요', code: err?.code };
    }
  });
}

export function registerIpc(ctx: AppCtx) {
  const { db, vault, runner } = ctx;
  const settings = () => loadSettings(db);
  const onUsage = (jobId?: string) => (u: { model: string; kind: string; reported: unknown }) =>
    db.addUsage({ jobId, provider: 'openai', model: u.model, kind: u.kind, reported: u.reported, estimate: { note: '실제 청구액 아님. 단가는 OpenAI 가격표 확인 필요', basis: null } });

  // AI로 새로 만드는 일은 모두 여기를 지남 → 이용권 확인 (AI를 안 쓰는 다시 맞춤은 gate: false)
  function ai(opts: { gate?: boolean } = {}): { text: TextAI; image: ImageAI | null; listen: Listen } {
    const s = settings();
    if (opts.gate !== false && !(process.env.GTD_LICENSE_OFF === '1' && !app.isPackaged)) ctx.license.assertCanCreate();
    const key = vault.get('openai');
    if (!key) throw new ApiError('auth', '설정에서 OpenAI API 키를 먼저 등록해 주세요.', 'OpenAI');
    const o = createOpenAI({ apiKey: key, textModel: s.textModel, imageModel: s.imageModel });
    return { text: o.text, image: o.image, listen: o.listen };
  }
  const profileOrThrow = () => {
    const p = db.getProfile();
    if (p) return p;
    throw new Error(`${IND.place} 정보를 먼저 저장해 주세요`);
  };
  // 어린이집: 카드 문구에서 메모 속 아이 이름을 "한 친구"로 (본문은 점검 결과로 알림 — validation.ts)
  const safeCopy = <T extends { title: string; sub: string }>(c: T, input?: ArticleInput): T => {
    const p = db.getProfile();
    if (!isDaycare || !input || !p) return c;
    const names = childNames(factsText(input, p));
    return names.length ? { ...c, title: hideChildNames(c.title, names), sub: hideChildNames(c.sub, names) } : c;
  };
  const cardService = (image: ImageAI | null, jobId?: string) => createCardService({
    db, image, shooter: ctx.shooter, assetsDir: ctx.assetsDir, fontDir: ctx.fontDir, profile: () => db.getProfile(),
    autoRetry: settings().imageAutoRetry, monthlyImageLimit: settings().monthlyImageLimit, onUsage: onUsage(jobId),
  });

  // ---------- 앱 · 설정 ----------
  handle('app:info', z.undefined(), () => ({
    version: app.getVersion(), dataDir: ctx.dataDir, settings: settings(), hasProfile: !!db.getProfile(),
    secrets: vault.masked(), browser: findBrowser(settings().browserPath)?.name ?? null,
  }));
  // ---------- 계정 연결 · 이용권 · 새 버전 ----------
  handle('jarvis:take', z.undefined(), () => ctx.takeJarvisQuick());
  handle('license:status', z.undefined(), () => ctx.license.status());
  handle('license:connect', z.undefined(), () => ctx.license.connect());
  handle('license:refresh', z.undefined(), () => ctx.license.refresh());
  handle('license:unlink', z.undefined(), () => ctx.license.unlink());
  handle('app:latest', z.undefined(), async () => {
    // 어린이집판: 홈페이지가 아직 업종별 최신 버전을 따로 알려 주지 않아 (태권도판 2.x 를 새 버전으로 안내하게 됨) 묻지 않음 — 서버에 product 구분이 생기면 켬
    if (isDaycare) return null;
    const r = await fetch(`${SERVER}/api/app/version`, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { latest?: string; minimum?: string; notes?: string[]; download?: string };
    const cur = app.getVersion();
    if (!j.latest || newer(j.latest, cur) <= 0) return null;
    return { latest: j.latest, must: !!j.minimum && newer(j.minimum, cur) > 0, notes: (j.notes ?? []).slice(0, 5), download: j.download ?? `${SERVER}/my` };
  });
  handle('settings:save', z.object({
    setupDone: z.boolean(), textModel: S, imageModel: S, saveDir: S, typingSpeed: z.number(), imageAutoRetry: z.number(),
    monthlyImageLimit: z.number(), browserPath: S, keywordCacheHours: z.number(),
  }).partial(), (p) => saveSettings(db, p as Partial<AppSettings>));
  handle('settings:pickDir', z.undefined(), async () => {
    const r = await dialog.showOpenDialog(ctx.win()!, { properties: ['openDirectory', 'createDirectory'], defaultPath: settings().saveDir });
    return r.canceled ? null : saveSettings(db, { saveDir: r.filePaths[0] }).saveDir;
  });

  // ---------- 비밀키: 등록 · 마스킹 보기 · 삭제 · 원격 확인(사용자 실행) ----------
  const SecretSchema = z.enum(SECRET_NAMES as [SecretName, ...SecretName[]]);
  handle('secrets:set', z.object({ name: SecretSchema, value: z.string().max(500) }), ({ name, value }) => {
    const bad = checkFormat(name, value);
    if (bad) throw new Error(bad);
    vault.set(name, value);
    return vault.masked();
  });
  handle('secrets:remove', SecretSchema, (name) => { vault.remove(name); return vault.masked(); });
  // 전담 비서 [담당자 부르기]: 막힌 단계 문구를 카톡에 붙여 넣게 복사 (화면 쪽 클립보드 권한은 막아 둠)
  handle('guide:copy', z.string().min(1).max(300), async (text) => { await clipboard.writeText(text); return true; });
  // 설치 도우미 [복사한 키 가져오기]: 관장님이 버튼을 누를 때만 클립보드를 한 번 읽음 (몰래 지켜보지 않음)
  // 키 모양이 맞으면 암호화 저장 후 클립보드를 비움 · 키 원문은 화면으로 돌려주지 않음
  handle('secrets:fromClipboard', z.enum(['openai', 'naverApiKey', 'naverSecret', 'kakao']), async (name) => {
    const v = (await clipboard.readText()).trim();
    if (!v) throw new Error('복사된 글자가 없어요. 키 옆 복사 버튼을 먼저 눌러 주세요.');
    const bad = checkFormat(name, v);
    if (bad) throw new Error(name === 'openai' ? `복사된 글자가 OpenAI 키 모양이 아니에요 (sk- 로 시작하는 긴 글자). ${bad}` : `복사된 글자가 이 칸에 넣을 키 모양이 아니에요. ${bad}`);
    vault.set(name, v);
    await clipboard.writeText('');
    return vault.masked();
  });
  handle('secrets:test', z.enum(['openai', 'naver', 'kakao']), async (kind) => {
    if (kind === 'openai') {
      const key = vault.get('openai');
      if (!key) throw new Error('OpenAI 키가 없어요');
      const s = settings();
      await createOpenAI({ apiKey: key, textModel: s.textModel, imageModel: s.imageModel, timeoutMs: 20_000 }).ping();
      return `연결됨: 글 모델 ${s.textModel} · 이미지 모델 ${s.imageModel} 확인 (모델 정보 조회만, 생성 비용 없음)`;
    }
    if (kind === 'naver') {
      const r = await lookupKeywords(naverCreds(), [IND.term]);
      return `연결됨: "${IND.term}" 관련 ${r.rows.length}개 받음`;
    }
    const key = vault.get('kakao');
    if (!key) throw new Error('카카오 키가 없어요');
    await collectNearbyCheck(key);
    return '연결됨';
  });
  async function collectNearbyCheck(key: string) {
    const r = await fetch('https://dapi.kakao.com/v2/local/search/address.json?query=%EC%84%9C%EC%9A%B8', { headers: { Authorization: `KakaoAK ${key}` }, signal: AbortSignal.timeout(8000) }).catch((e) => { throw toApiError('카카오', e); });
    if (!r.ok) throw toApiError('카카오', { status: r.status, message: await r.text() });
  }
  function naverCreds() {
    const apiKey = vault.get('naverApiKey'), secret = vault.get('naverSecret'), customerId = vault.get('naverCustomer');
    if (!apiKey || !secret || !customerId) throw new ApiError('auth', '네이버 검색광고 API Key · Secret Key · Customer ID 를 설정에서 등록해 주세요. 키워드는 직접 입력으로도 진행할 수 있어요.', '네이버 검색광고');
    return { apiKey, secret, customerId };
  }

  // ---------- 도장 프로필 ----------
  handle('profile:get', z.undefined(), () => db.getProfile());
  handle('profile:save', ProfileInput, (p) => {
    const classFeatures = p.strengths ? composeClassFeatures(p) : p.classFeatures; // 칸으로 나눈 자료면 칸을 모아서
    if (!classFeatures.trim()) throw new Error(isDaycare ? '운영 시간 · 반 구성 · 강점 중 하나 이상 적어 주세요' : '수업 시간 · 반 구성 · 강점 중 하나 이상 적어 주세요');
    return db.saveProfile({ ...p, classFeatures, id: p.id || 'default' } as any);
  });
  handle('profile:pickLogo', z.undefined(), async () => {
    const r = await dialog.showOpenDialog(ctx.win()!, { filters: [{ name: '로고 (PNG · JPG)', extensions: ['png', 'jpg', 'jpeg'] }], properties: ['openFile'] });
    if (r.canceled) return null;
    const src = r.filePaths[0];
    if (fs.statSync(src).size > 10 * 1024 * 1024) throw new Error('로고 파일이 너무 커요 (10MB 이하)');
    const dir = path.join(ctx.assetsDir, 'brand');
    fs.mkdirSync(dir, { recursive: true });
    // 둘레 빈 여백을 잘라 PNG 로 저장 (여백째 넣으면 카드에서 로고가 아주 작게 보임 · 2026-10-22 파일럿)
    const trimmed = trimLogo(src);
    const dest = path.join(dir, `logo-${Date.now()}${trimmed ? '.png' : path.extname(src).toLowerCase()}`);
    if (trimmed) fs.writeFileSync(dest, trimmed); else fs.copyFileSync(src, dest);
    return dest;
  });
  handle('profile:pickRef', z.enum(['dobok', 'coach']), async (kind) => {
    const r = await dialog.showOpenDialog(ctx.win()!, { title: isDaycare ? (kind === 'dobok' ? '원복 사진' : '교실 사진') : kind === 'dobok' ? '아이 도복 · 품띠 사진' : '사범님 도복 사진', filters: [{ name: '사진 (PNG · JPG)', extensions: ['png', 'jpg', 'jpeg'] }], properties: ['openFile'] });
    if (r.canceled) return null;
    const src = r.filePaths[0];
    if (fs.statSync(src).size > 20 * 1024 * 1024) throw new Error('사진이 너무 커요 (20MB 이하)');
    const dir = path.join(ctx.assetsDir, 'brand');
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, `${kind}-ref-${Date.now()}${path.extname(src).toLowerCase()}`);
    fs.copyFileSync(src, dest);
    return dest;
  });
  handle('profile:nearby', z.undefined(), async () => {
    const key = vault.get('kakao');
    if (!key) throw new Error('설정에서 카카오 REST API 키를 먼저 등록해 주세요. 키 없이 동네 이름을 직접 적어도 돼요.');
    const p = db.getProfile();
    if (!p) throw new Error(`${IND.place} 정보를 먼저 저장해 주세요`);
    const dong = p.region.trim().split(/\s+/).pop() ?? '';
    const areas = await collectNearby(key, p.address ?? '', [dong, dong.replace(/동$/, '')].filter(Boolean));
    const manual = (p.nearbyAreas ?? []).filter((a) => a.source === 'manual');
    return db.saveProfile({ ...p, nearbyAreas: [...manual, ...areas] });
  });
  handle('profile:prefixOptions', z.object({ region: S }), ({ region }) => prefixOptions(region, db.getProfile()?.nearbyAreas ?? []));

  // ---------- 키워드 ----------
  handle('keywords:naver', z.array(z.string().max(60)).min(1).max(5), async (words) => {
    const query = hintOf(words); // 실제로 보내는 힌트와 같은 값으로 저장된 결과를 찾음
    const cached = db.cachedLookup(query, 'naver', settings().keywordCacheHours * 3600_000);
    if (cached) return { rows: cached.rows.map((r) => ({ ...r, cached: true })), demo: false, cachedAt: cached.fetchedAt };
    const r = await lookupKeywords(naverCreds(), words);
    db.saveLookup(query, 'naver', r.raw, r.rows);
    return { rows: r.rows, demo: false };
  });
  handle('keywords:ai', z.object({ region: S, topic: S, kind: S }), async ({ region, topic, kind }) => {
    const a = ai();
    const words = await a.text.keywordIdeas(region, topic, kind, { onUsage: onUsage() });
    return words.map((keyword): KeywordRow => ({ keyword, source: 'ai' }));
  });

  // 메모 말로 넣기: 화면에서 녹음한 소리(최대 약 1분)를 글자로. 녹음 파일은 저장하지 않음
  handle('voice:transcribe', z.object({ audio: z.instanceof(Uint8Array).refine((a) => a.byteLength > 1000, '녹음이 너무 짧아요. 버튼을 누르고 말씀해 주세요.').refine((a) => a.byteLength < 8_000_000, '녹음이 너무 길어요. 1분 안으로 나눠서 말씀해 주세요.'), mime: z.string().max(60) }), async ({ audio, mime }) => {
    const p = db.getProfile();
    const hint = listenHint(p ? [p.name, p.region, ...(p.nearbyAreas ?? []).map((a) => a.name)] : []);
    const text = await ai().listen(audio, mime, { onUsage: onUsage(), hint });
    if (!text) throw new Error('말소리를 알아듣지 못했어요. 마이크 가까이에서 다시 말씀해 주세요.');
    return text;
  });
  handle('facts:fromMemo', z.object({ memo: z.string().min(1, '메모를 적어 주세요').max(3000), kind: S, topic: S }), async ({ memo, kind, topic }) => {
    const a = ai();
    return a.text.splitMemo(memo, kind, topic, { onUsage: onUsage() });
  });

  // ---------- 글 ----------
  handle('article:list', z.undefined(), () => db.listArticles());
  handle('article:create', z.object({ input: ArticleInputSchema, keywords: z.array(z.any()).max(50) }), ({ input, keywords }) => {
    const p = profileOrThrow();
    return db.createArticle(p.id, withKeywordFallback(input as any), keywords as KeywordRow[], false);
  });
  handle('article:updateInput', z.object({ id: Id, input: ArticleInputSchema, keywords: z.array(z.any()).max(50) }), ({ id, input, keywords }) => {
    db.updateArticleInput(id, input as any, keywords as KeywordRow[]);
    return db.getArticle(id);
  });
  handle('article:get', Id, (id) => {
    const article = db.getArticle(id);
    if (!article) throw new Error('글을 찾지 못했어요');
    const version = article.currentVersionId ? db.getVersion(article.currentVersionId) : null;
    return { article, version, versions: db.listVersions(id).map((v) => ({ id: v.id, note: v.note, createdAt: v.createdAt, title: v.title, counts: v.counts })), cardSet: db.latestCardSet(id), jobs: db.recentJobs(id) };
  });
  handle('article:delete', Id, (id) => db.deleteArticle(id));
  handle('article:generate', Id, (id) => {
    const a = ai();
    const profile = profileOrThrow();
    return runner.start('article', id, '글 생성 중', ({ signal, step, jobId }) => generateArticle({ db, ai: a.text, profile, onUsage: onUsage(jobId) }, id, { signal, step })).job;
  });
  handle('article:revise', z.object({ id: Id, kind: z.enum(['warmer', 'professional', 'less-promo', 'titles', 'paragraph']), baseVersionId: Id, sectionId: z.string().max(40).optional(), paragraphIndex: z.number().int().min(0).optional(), instruction: z.string().max(300).optional() }), (req) => {
    const a = ai();
    const profile = profileOrThrow();
    return runner.start('revise', req.id, '고치는 중', ({ signal, step, jobId }) => reviseArticle({ db, ai: a.text, profile, onUsage: onUsage(jobId) }, req.id, req, { signal, step })).job;
  });
  // 사용자 편집 저장: 사용자가 쓴 내용은 항상 새 현재 버전 (AI 결과가 그동안 도착했어도 이력에 남고 덮어쓰지 않음)
  handle('article:saveEdit', z.object({ id: Id, title: z.string().max(200), doc: DocSchema }), ({ id, title, doc }) => {
    const v = db.saveUserEdit(id, title, doc as ArticleDoc, countDoc(doc as ArticleDoc));
    if (db.getArticle(id)!.status !== 'ready') db.setArticleStatus(id, 'review');
    return v;
  });
  handle('article:setCurrent', z.object({ id: Id, versionId: Id }), ({ id, versionId }) => { db.setCurrentVersion(id, versionId); return db.getVersion(versionId); });
  handle('article:getVersion', Id, (vid) => db.getVersion(vid));
  handle('article:markReady', Id, (id) => db.setArticleStatus(id, 'ready'));
  handle('article:copy', z.object({ versionId: Id, part: z.enum(['body', 'title', 'tags', 'all']) }), async ({ versionId, part }) => {
    const v = db.getVersion(versionId);
    if (!v) throw new Error('버전을 찾지 못했어요');
    const tags = v.doc.tags.map((t) => `#${t}`).join(' ');
    const text = part === 'title' ? v.title : part === 'tags' ? tags : part === 'body' ? plainBody(v.doc) : `${v.title}\n\n${plainBody(v.doc)}\n\n${tags}`;
    await clipboard.writeText(text);
    return text.length;
  });
  handle('article:applyPrefix', z.object({ title: S, prefix: z.string().max(60).optional() }), ({ title, prefix }) => titleWithPrefix(title, prefix));

  // ---------- 카드 ----------
  // 카드 작업은 글 하나에 하나만 (같은 카드를 두 작업이 동시에 그려 두 번 과금되던 문제 — 2026-10-18 버그 점검)
  const noCardJob = (articleId: string) => { if (runner.runningOf(['cards', 'card'], articleId)) throw new Error('카드를 만드는 중이에요. 끝난 뒤 다시 눌러 주세요.'); };
  const articleOfCard = (cardId: string) => { const c = db.getCard(cardId); const cs = c && db.getCardSet(c.cardSetId); const v = cs && db.getVersion(cs.articleVersionId); if (!v) throw new Error('카드를 찾지 못했어요'); return v.articleId; };
  const StyleSchema = z.object({ style: z.enum(CARD_STYLES), size: z.enum(['1080x1350', '1080x1080']), mode: z.enum(['ai', 'template']) });
  handle('cards:plan', z.object({ articleId: Id, style: StyleSchema }), ({ articleId, style }) => {
    const a = ai();
    const art = db.getArticle(articleId)!;
    if (!art.currentVersionId) throw new Error('글을 먼저 만들어 주세요');
    const mode = style.mode;
    noCardJob(articleId);
    return runner.start('cards', articleId, '카드 문구 만드는 중', async ({ signal, step, jobId }) => {
      const v = db.getVersion(art.currentVersionId!)!;
      const copies = (await a.text.cardCopies(v.doc, v.title, art.input.kind, { signal, onUsage: onUsage(jobId) }, art.input.writer, isDaycare && thinFacts(art.input))).map((c) => safeCopy(c, art.input));
      const cs = db.createCardSet(v.id, { ...style, mode }, copies);
      await cardService(a.image, jobId).renderSet(cs.id, { signal, onStep: step });
    }).job;
  });
  handle('cards:renderFailed', z.object({ articleId: Id, cardSetId: Id }), ({ articleId, cardSetId }) => {
    const a = ai();
    noCardJob(articleId);
    return runner.start('cards', articleId, '실패한 카드 다시', ({ signal, step, jobId }) => cardService(a.image, jobId).renderSet(cardSetId, { signal, onStep: step, onlyFailed: true })).job;
  });
  handle('cards:renderOne', z.object({ articleId: Id, cardId: Id, newBackground: z.boolean() }), ({ cardId, newBackground }) => {
    const a = ai({ gate: newBackground }); // 배경을 그대로 두고 문구만 다시 합성하면 AI를 안 씀
    const articleId = articleOfCard(cardId);
    noCardJob(articleId);
    const n = (db.getCard(cardId)?.index ?? 0) + 1;
    return runner.start('cards', articleId, `카드 ${n}/3 다시 만드는 중`, async ({ signal, jobId }) => { await cardService(a.image, jobId).renderOne(cardId, { newBackground, signal }); }).job;
  });
  // 카드 한 장 문구만 AI로 새로 제안 (저장하지 않음 — 칸에 넣어 주고 [문구 적용]으로 저장, 그림 비용 없음)
  handle('cards:suggestCopy', z.object({ cardId: Id }), async ({ cardId }) => {
    const articleId = articleOfCard(cardId);
    noCardJob(articleId);
    const c = db.getCard(cardId)!;
    const cs = db.getCardSet(c.cardSetId)!;
    const v = db.getVersion(cs.articleVersionId)!;
    const others = cs.cards.filter((x) => x.id !== cardId).map((x) => x.copy.title);
    const input = db.getArticle(articleId)?.input;
    return safeCopy(await ai().text.cardOne(v.doc, v.title, c.index, c.copy, others, input?.kind, { onUsage: onUsage() }, input?.writer, isDaycare && !!input && thinFacts(input)), input);
  });
  handle('cards:updateCopy', z.object({ cardId: Id, copy: z.object({ title: z.string().max(80), sub: z.string().max(200), scene: z.string().max(500) }) }), ({ cardId, copy }) => { noCardJob(articleOfCard(cardId)); return cardService(null).updateCopy(cardId, copy); });
  // 스타일 · 크기만 바꿈 (템플릿 모드면 API 없이 다시 합성, AI 배경은 있던 그림을 새 비율로 다시 자름)
  handle('cards:restyle', z.object({ articleId: Id, cardSetId: Id, style: StyleSchema }), ({ articleId, cardSetId, style }) => {
    const cs = db.getCardSet(cardSetId)!;
    const mode = style.mode;
    const needNew = mode === 'ai' && (cs.style.mode !== 'ai' || cs.style.style !== style.style);
    const a = ai({ gate: needNew }); // 새 배경을 안 그리면 AI를 안 씀
    noCardJob(articleId);
    return runner.start('cards', articleId, '카드 다시 그리는 중', async ({ signal, step, jobId }) => {
      db.setCardSetStyle(cardSetId, { ...style, mode }); // 작업이 실제로 시작된 뒤에만 스타일을 바꿈
      const svc = cardService(a.image, jobId);
      for (const c of db.getCardSet(cardSetId)!.cards) {
        if (signal.aborted) break;
        step(`카드 ${c.index + 1}/3 생성 중`);
        await svc.renderOne(c.id, { newBackground: needNew, signal });
      }
    }).job;
  });

  // ---------- 내보내기 · 백업 ----------
  handle('export:run', z.object({ versionId: Id, cardSetId: z.string().max(64).nullable(), kinds: z.object({ txt: z.boolean(), md: z.boolean(), cards: z.boolean(), zip: z.boolean() }) }), async ({ versionId, cardSetId, kinds }) => {
    const v = db.getVersion(versionId)!;
    const cs: CardSet | null = cardSetId ? db.getCardSet(cardSetId) : null;
    const files = exportFiles(settings().saveDir, v, cs, kinds);
    if (files[0]) shell.showItemInFolder(files[0]);
    return files;
  });
  handle('backup:create', z.undefined(), async () => {
    const r = await dialog.showSaveDialog(ctx.win()!, { defaultPath: path.join(settings().saveDir, `${IND.backupName}_${new Date().toISOString().slice(0, 10)}.zip`), filters: [{ name: '백업 (zip)', extensions: ['zip'] }] });
    if (r.canceled || !r.filePath) return null;
    return makeBackup(db, ctx.dataDir, r.filePath, app.getVersion());
  });
  handle('backup:restore', z.undefined(), async () => {
    const r = await dialog.showOpenDialog(ctx.win()!, { filters: [{ name: '백업 (zip)', extensions: ['zip'] }], properties: ['openFile'] });
    if (r.canceled) return null;
    const m = readBackupManifest(r.filePaths[0]);
    const ok = await dialog.showMessageBox(ctx.win()!, { type: 'warning', buttons: ['복원하기', '그만두기'], cancelId: 1, defaultId: 1, message: `${m.createdAt.slice(0, 10)} 백업으로 복원할까요?`, detail: '지금 자료는 데이터 폴더의 backups 안에 따로 보관한 뒤 바꿔요. API 키와 네이버 로그인은 백업에 없어서 그대로 유지돼요. 복원 후 프로그램이 다시 시작돼요.' });
    if (ok.response !== 0) return null;
    ctx.requestRestore(r.filePaths[0]);
    return true;
  });

  // ---------- 네이버 ----------
  handle('naver:status', z.undefined(), async () => ({ open: ctx.browser.isOpen(), loggedIn: await ctx.browser.loggedIn(), browser: findBrowser(settings().browserPath)?.name ?? null }));
  const noNaverJob = () => { if (runner.runningOf(['naver'])) throw new Error('지금 네이버에 글을 넣는 중이에요. 끝난 뒤 다시 눌러 주세요.'); };
  handle('naver:openLogin', z.undefined(), () => { noNaverJob(); return ctx.browser.openLogin(); });
  handle('naver:close', z.undefined(), () => ctx.browser.close());
  handle('naver:clearSession', z.undefined(), () => ctx.browser.clearSession());
  handle('naver:fill', z.object({ articleId: Id, onExisting: z.enum(['stop', 'new']), typing: z.boolean().optional(), map: z.boolean().optional() }), ({ articleId, onExisting, typing, map }) => {
    noNaverJob();
    noCardJob(articleId); // 카드를 만드는 중에 넣으면 사진 없이 들어감 (2026-10-23 사진 빠짐 점검)
    const art = db.getArticle(articleId)!;
    const v = art.currentVersionId ? db.getVersion(art.currentVersionId) : null;
    if (!v) throw new Error('글을 먼저 만들어 주세요');
    const p = db.getProfile();
    if (!p?.blogUrl) throw new Error(`${IND.place} 정보에 네이버 블로그 주소를 적어 주세요 (예: https://blog.naver.com/아이디)`);
    const cs = db.latestCardSet(articleId);
    const cards = (cs?.cards ?? []).filter((c) => c.status === 'done' && c.outputPath);
    if (cs && cards.some((c) => c.overflow)) throw new Error('글자가 넘친 카드가 있어요. 카드 문구를 줄인 뒤 넣어 주세요.');
    // 사진이 빠지는 이유를 끝 안내에 같이 알려 줌: 카드가 아예 없거나, 만들기에 실패한 카드
    const missing = (cs?.cards ?? []).filter((c) => !(c.status === 'done' && c.outputPath)).map((c) => c.index + 1);
    const cardNote = !cs ? '카드를 아직 만들지 않아 사진 없이 넣었어요 (카드를 만든 뒤 넣으면 사진도 같이 들어가요)' : missing.length ? `카드 ${missing.join(', ')}번은 만들어지지 않아 빠졌어요 (카드 화면에서 다시 만들기)` : '';
    const blocks = buildBlocks(v.doc.sections, cards.map((c) => ({ title: c.copy.title, afterSectionId: c.afterSectionId, index: c.index })), v.doc.tags);
    return runner.start('naver', articleId, STEP_LABEL.open, async ({ signal, step }) => {
      const r = await ctx.browser.fill({ blogUrl: p.blogUrl!, title: v.title, blocks, headings: v.doc.sections.map((s) => s.heading).filter(Boolean) as string[], cardFiles: cards.map((c) => ({ index: c.index, file: c.outputPath! })), onExisting, typing: typing ? settings().typingSpeed : undefined, place: map ? (p.mapName?.trim() || p.name) : undefined }, (s) => step(STEP_LABEL[s]), signal);
      if (r.state === 'need-login') throw new Error('네이버 로그인이 끝나지 않았어요. 열린 창에서 직접 로그인한 뒤 다시 눌러 주세요.');
      if (r.state === 'existing-draft') throw Object.assign(new Error('네이버 편집기에 작성 중인 글이 있어 덮어쓰지 않았어요. 새 글로 시작할지 골라 주세요.'), { code: 'existing-draft' });
      if (r.state === 'not-owner') throw new Error(`글쓰기 화면을 열지 못했어요. 로그인한 네이버 아이디가 blog.naver.com/${r.blogId} 의 주인인지 확인해 주세요.`);
      const c = r.check;
      const msg = [`제목 ${c.titleOk ? '확인' : '다름 — 직접 확인 필요'}`, `이미지 ${c.images}장`, cardNote, r.map === true ? `${IND.place} 지도 넣음` : r.map === false ? `${IND.place} 지도는 못 찾아서 빠짐 (${IND.place} 정보의 지도 검색 이름 확인)` : '', c.leftMarks.length ? `카드 ${c.leftMarks.join(', ')}번은 올리지 못해 자리 글자가 남아 있어요 (네이버 창에서 그 자리에 직접 올려 주세요 · 저장 폴더에 카드 파일이 있어요)` : '', '발행 · 저장은 직접 눌러 주세요'].filter(Boolean).join(' · ');
      return `입력 끝: ${msg}`;
    }).job;
  });

  // ---------- 공통 ----------
  handle('job:cancel', Id, (id) => runner.cancel(id));
  handle('job:get', Id, (id) => db.getJob(id));
  handle('usage:summary', z.undefined(), () => {
    const d = new Date();
    return { since: new Date(d.getFullYear(), d.getMonth(), 1).toISOString(), rows: db.usageSummary(new Date(d.getFullYear(), d.getMonth(), 1).toISOString()) };
  });
  // 외부 링크: 정해 둔 공식 주소만
  const ALLOWED = /^https:\/\/(growmoment\.co\.kr|pf\.kakao\.com|naver\.github\.io|github\.com\/naver|searchad\.naver\.com|manage\.searchad\.naver\.com|platform\.openai\.com|developers\.kakao\.com|blog\.naver\.com|searchadvisor\.naver\.com)(\/|$)/;
  handle('shell:open', z.string().url().max(300), (url) => {
    if (!ALLOWED.test(url)) throw new Error('열 수 없는 주소예요');
    return shell.openExternal(url);
  });
  handle('shell:showFile', z.string().max(600), (file) => {
    const inside = (dir: string) => path.resolve(file).startsWith(path.resolve(dir) + path.sep);
    if (!inside(ctx.dataDir) && !inside(settings().saveDir)) throw new Error('열 수 없는 위치예요');
    shell.showItemInFolder(file);
  });
  handle('cards:saveAs', z.object({ file: z.string().max(600) }), async ({ file }) => {
    if (!path.resolve(file).startsWith(path.resolve(ctx.assetsDir) + path.sep)) throw new Error('열 수 없는 위치예요');
    const r = await dialog.showSaveDialog(ctx.win()!, { defaultPath: path.join(settings().saveDir, path.basename(path.dirname(file)) + '_card.png'), filters: [{ name: 'PNG', extensions: ['png'] }] });
    if (r.canceled || !r.filePath) return null;
    fs.copyFileSync(file, r.filePath);
    return r.filePath;
  });
}

// 버전 비교: a 가 b 보다 높으면 양수 (2.1.0 > 2.0.12)
function newer(a: string, b: string) {
  const p = (v: string) => v.split('.').map((n) => parseInt(n, 10) || 0);
  const [x, y] = [p(a), p(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}

// 로고 둘레의 투명 · 흰 여백을 잘라 냄. 자를 게 없거나 못 읽으면 null (원본 그대로 씀)
function trimLogo(file: string): Buffer | null {
  const img = nativeImage.createFromPath(file);
  if (img.isEmpty()) return null;
  const { width: w, height: h } = img.getSize();
  const px = img.toBitmap(); // BGRA
  const ink = (x: number, y: number) => { const i = (y * w + x) * 4; return px[i + 3] > 24 && !(px[i] > 235 && px[i + 1] > 235 && px[i + 2] > 235); };
  let top = h, bottom = -1, left = w, right = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ink(x, y)) { if (y < top) top = y; if (y > bottom) bottom = y; if (x < left) left = x; if (x > right) right = x; }
  if (bottom < 0) return null; // 전부 흰색 · 투명
  const pad = Math.round(Math.max(right - left, bottom - top) * 0.03);
  const rect = { x: Math.max(0, left - pad), y: Math.max(0, top - pad), width: 0, height: 0 };
  rect.width = Math.min(w, right + pad + 1) - rect.x;
  rect.height = Math.min(h, bottom + pad + 1) - rect.y;
  if (rect.width >= w * 0.97 && rect.height >= h * 0.97) return null; // 여백이 거의 없음
  let out = img.crop(rect);
  if (out.getSize().width > 1200) out = out.resize({ width: 1200, quality: 'best' });
  return out.toPNG();
}
