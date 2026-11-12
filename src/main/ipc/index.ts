// 화면(Renderer) ↔ 메인 통로. 모든 입력은 zod 로 검사. API 키 원문은 화면으로 돌려주지 않음
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { app, clipboard, ClipboardItem, dialog, ipcMain, nativeImage, shell, type BrowserWindow } from 'electron';
import { z } from 'zod';
import type { Db } from '../db';
import type { Vault, SecretName } from '../credentials';
import { checkFormat, SECRET_NAMES } from '../credentials';
import type { JobRunner } from '../jobs';
import { generateArticle, reviseArticle, titleWithPrefix } from '../article';
import { ArticleInputSchema, DocSchema, ProfileInput } from '../../shared/schemas';
import { countDoc } from '../../shared/count';
import { headingLines } from '../../shared/format';
import { cardCountOf, cardNo, resolveCardCount } from '../../shared/cardRoles';
import { childNames, hideChildNames, memoText, plainBody, thinFacts, withKeywordFallback } from '../../shared/validation';
import { planCandidates } from '../../shared/keywords';
import type { ArticleDoc, ArticleInput, CardSet, KeywordRow } from '../../shared/types';
import { APP } from '../../shared/kinder';
import { issueMessage } from './messages';
import { CARD_STYLES } from '../../shared/types';
import { loadSettings, saveSettings, type AppSettings } from '../settings';
import { composeClassFeatures } from '../../shared/strengths';
import { createOpenAI, listenHint, type ImageAI, type Listen, type TextAI } from '../services/openai';
import { hintOf, lookupKeywords } from '../services/naver-keywords';
import { collectNearby, lookupAddress, prefixOptions } from '../services/nearby';
import type { PlaceResult } from '../services/browser-draft/editor';
import { createCardService, type Shooter } from '../services/card-renderer';
import { blogIdOf, buildBlocks, STEP_LABEL, type BrowserDraft } from '../services/browser-draft';
import { GIF_CARD, PHOTO_BASE } from '../services/browser-draft/editor';
import { pasteSteps } from '../services/paste-helper';
import { PASTE_STALE } from '../../shared/paste';
import { NAVER_AUTO_OFF_MSG, NAVER_AUTO_TERMS_VERSION, naverAutoOn } from '../../shared/naverAuto';
import { findBrowser } from '../services/browser-draft/browser';
import { exportFiles, makeBackup, readBackupManifest } from '../backup';
import { ApiError, toApiError } from '../services/errors';
import { log } from '../log';
import { SERVER, type License } from '../license';
import { photoDraft, registerPhotoIpc, removePhotoWork } from './photos';

// 1.0.2부터 유치원 전용 서버(kinder.growmoment.co.kr)가 유치원 글뚝딱 최신 버전만 알려 줌
const LATEST_FOR_KINDER = true;

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
export function handle<A extends z.ZodTypeAny>(channel: string, schema: A, fn: (arg: z.infer<A>) => unknown) {
  ipcMain.handle(channel, async (_e, raw) => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: issueMessage(parsed.error.issues[0]) };
    try { return { ok: true, data: await fn(parsed.data) }; } catch (e) {
      const err = e instanceof ApiError ? e : null;
      log(`ipc-${channel}`, e instanceof Error ? e.message : String(e));
      return { ok: false, error: err ? err.message : e instanceof Error ? e.message : '문제가 생겼어요', code: err?.code };
    }
  });
}

const placeNote = (m: PlaceResult) => m.ok ? `${APP.place} 지도 넣음: ${m.title} (맞는 곳인지 확인해 주세요)`
  : m.why === 'no-basis' ? `${APP.place} 지도를 넣지 않았어요: ${APP.place} 정보에 상세 주소를 적으면 주소가 맞는 곳을 찾아 넣어요`
  : m.why === 'no-match' ? `주소가 맞는 ${APP.place} 지도를 찾지 못해 넣지 않았어요 (${APP.place} 정보의 지도 검색 이름 · 상세 주소를 확인하거나, 네이버 창의 [장소]에서 직접 넣어 주세요)`
  : `${APP.place} 지도를 넣지 못했어요 (${APP.place} 정보의 지도 검색 이름을 확인하거나, 네이버 창의 [장소]에서 직접 넣어 주세요)`;

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
    throw new Error(`${APP.place} 정보를 먼저 저장해 주세요`);
  };
  // 카드 문구에서 메모 속 아이 이름을 "한 친구"로 (본문은 점검 결과로 알림 — validation.ts)
  const safeCopies = <T extends { title: string; sub: string }>(cards: T[], input?: ArticleInput): T[] => {
    if (!input) return cards;
    const names = childNames(memoText(input)); // 이름은 한 번만 찾음
    return names.length ? cards.map((c) => ({ ...c, title: hideChildNames(c.title, names), sub: hideChildNames(c.sub, names) })) : cards;
  };
  const cardService = (image: ImageAI | null, jobId?: string) => createCardService({
    db, image, shooter: ctx.shooter, assetsDir: ctx.assetsDir, fontDir: ctx.fontDir, profile: () => db.getProfile(),
    autoRetry: settings().imageAutoRetry, monthlyImageLimit: settings().monthlyImageLimit, onUsage: onUsage(jobId),
  });
  // 카드 글자가 넘치면 작은 글씨만 AI로 줄여 다시 얹어요 (그림은 그대로 · 그림 비용 없음). 한 장에 최대 2번, 그래도 넘치면 지금처럼 안내
  // 태권 글뚝딱 2.4.1에서 옮김. 만들기 · 실패 다시 · 스타일 바꾸기 뒤에만 (원장님 · 선생님이 [문구 적용]한 직후는 그대로 두고 안내만)
  // 줄인 글도 아이 이름 가리기(safeCopies)를 한 번 더 거침
  async function fixOverflow(text: TextAI, cardSetId: string, input: ArticleInput | undefined, o: { signal: AbortSignal; step: (s: string) => void; jobId: string }) {
    const svc = cardService(null);
    for (const first of db.getCardSet(cardSetId)?.cards ?? []) {
      let c = first;
      for (let k = 0; k < 2 && c.overflow && c.status === 'done'; k++) {
        if (o.signal.aborted) return;
        o.step('카드 글자가 넘쳐 짧게 고치는 중');
        const len = [...c.copy.sub].length;
        const raw = await text.cardShorten(c.copy.title, c.copy.sub, Math.max(40, Math.floor(len * (k ? 0.6 : 0.75))), { signal: o.signal, onUsage: onUsage(o.jobId) }).catch(() => '');
        const sub = raw ? safeCopies([{ title: c.copy.title, sub: raw }], input)[0].sub : '';
        if (!sub || [...sub].length >= len) break;
        c = await svc.updateCopy(c.id, { ...c.copy, sub });
      }
    }
  }

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
    // 1.0.1까지는 태권 글뚝딱과 같은 서버라 태권 2.x 를 새 버전으로 안내하게 돼서 꺼 뒀음
    if (!LATEST_FOR_KINDER) return null;
    const r = await fetch(`${SERVER}/api/app/version`, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { latest?: string; minimum?: string; notes?: string[]; download?: string };
    const cur = app.getVersion();
    if (!j.latest || newer(j.latest, cur) <= 0) return null;
    return { latest: j.latest, must: !!j.minimum && newer(j.minimum, cur) > 0, notes: (j.notes ?? []).slice(0, 5), download: j.download ?? `${SERVER}/my` };
  });
  handle('settings:save', z.object({
    setupDone: z.boolean(), textModel: S, imageModel: S, saveDir: S, typingSpeed: z.number(), imageAutoRetry: z.number(),
    monthlyImageLimit: z.number(), browserPath: S, keywordCacheHours: z.number(), cardCount: z.union([z.literal('auto'), z.literal(1), z.literal(2), z.literal(3)]),
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
  // 설치 도우미 [복사한 키 가져오기]: 원장님 · 선생님이 버튼을 누를 때만 클립보드를 한 번 읽음 (몰래 지켜보지 않음)
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
      const r = await lookupKeywords(naverCreds(), [APP.term]);
      return `연결됨: "${APP.term}" 관련 ${r.rows.length}개 받음`;
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

  // ---------- 유치원 프로필 ----------
  handle('profile:get', z.undefined(), () => db.getProfile());
  handle('profile:save', ProfileInput, (p) => {
    const classFeatures = p.strengths ? composeClassFeatures(p) : p.classFeatures; // 칸으로 나눈 자료면 칸을 모아서
    if (!classFeatures.trim()) throw new Error('운영 시간 · 반 구성 · 강점 중 하나 이상 적어 주세요');
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
    const r = await dialog.showOpenDialog(ctx.win()!, { title: kind === 'dobok' ? '원복 사진' : '교실 사진', filters: [{ name: '사진 (PNG · JPG)', extensions: ['png', 'jpg', 'jpeg'] }], properties: ['openFile'] });
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
    if (!p) throw new Error(`${APP.place} 정보를 먼저 저장해 주세요`);
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
  // 자세히 쓰기 검색어 확인: 네이버 조회 결과(없어도 됨)에서 우리와 맞지 않는 것을 거르고, AI가 이야기에 맞는 것 + 넣을 문장 예시를 고름
  handle('keywords:plan', z.object({ kind: S, topic: S, story: z.string().max(3000), rows: z.array(z.any()).max(200) }), async ({ kind, topic, story, rows }) => {
    const p = db.getProfile();
    const region = p?.region ?? '';
    const cands = planCandidates(rows as KeywordRow[], `${topic} ${story}`, region, p);
    const r = await ai().text.keywordPlan({ region, kind, topic, story, candidates: cands }, { onUsage: onUsage() });
    // 유치원판: 넣을 문장 예시에 이야기 속 아이 이름이 나오면 "한 친구"로 (화면에 보이고 글에 그대로 쓰일 수 있음)
    const names = childNames(`${topic}\n${story}`);
    if (!names.length) return r;
    const hide = (x: typeof r.main) => ({ ...x, sentence: hideChildNames(x.sentence, names) });
    return { main: hide(r.main), subs: r.subs.map(hide), others: r.others.map(hide) };
  });
  // 자세히 쓰기 ① → ②: 글 성격 · 사실 · 애매한 숫자 확인 · 주제 설명 글감 (화면에서 검색어 고르기와 같이 부름)
  handle('article:brief', z.object({ kind: S, topic: S, story: z.string().max(3000) }), async (q) => {
    const b = await ai().text.brief(q, { onUsage: onUsage() });
    // 유치원판: 정리한 사실 · 확인 질문에 아이 이름이 나오면 "한 친구"로 (원문 인용 quote 는 그대로)
    const names = childNames(`${q.topic}\n${q.story}`);
    if (!names.length) return b;
    const hide = (t: string) => hideChildNames(t, names);
    return { ...b, facts: b.facts.map((f) => ({ ...f, text: hide(f.text) })), check: b.check && { ...b.check, question: hide(b.check.question) } };
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
  handle('article:delete', Id, (id) => { db.deleteArticle(id); removePhotoWork(ctx, id); });
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
  // 장수: 화면에서 고른 것 → 글 설정 → 설정의 기본 장수 (태권 글뚝딱 2.4.0에서 옮김). 글만으로 만든 글도 카드 칸에서 만들 수 있게
  handle('cards:plan', z.object({ articleId: Id, style: StyleSchema, count: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional() }), ({ articleId, style, count }) => {
    const a = ai();
    const art = db.getArticle(articleId)!;
    if (!art.currentVersionId) throw new Error('글을 먼저 만들어 주세요');
    const mode = style.mode;
    noCardJob(articleId);
    const n = (count ?? (cardCountOf(art.input) || resolveCardCount(settings().cardCount, art.input.kind))) as 1 | 2 | 3;
    return runner.start('cards', articleId, '카드 문구 만드는 중', async ({ signal, step, jobId }) => {
      const v = db.getVersion(art.currentVersionId!)!;
      const copies = safeCopies(await a.text.cardCopies(v.doc, v.title, art.input, { signal, onUsage: onUsage(jobId) }, art.input.writer, thinFacts(art.input), n), art.input);
      const cs = db.createCardSet(v.id, { ...style, mode }, copies);
      await cardService(a.image, jobId).renderSet(cs.id, { signal, onStep: step });
      await fixOverflow(a.text, cs.id, art.input, { signal, step, jobId });
    }).job;
  });
  handle('cards:renderFailed', z.object({ articleId: Id, cardSetId: Id }), ({ articleId, cardSetId }) => {
    const a = ai();
    noCardJob(articleId);
    return runner.start('cards', articleId, '실패한 카드 다시', async ({ signal, step, jobId }) => {
      await cardService(a.image, jobId).renderSet(cardSetId, { signal, onStep: step, onlyFailed: true });
      await fixOverflow(a.text, cardSetId, db.getArticle(articleId)?.input, { signal, step, jobId });
    }).job;
  });
  handle('cards:renderOne', z.object({ articleId: Id, cardId: Id, newBackground: z.boolean() }), ({ cardId, newBackground }) => {
    const a = ai({ gate: newBackground }); // 배경을 그대로 두고 문구만 다시 합성하면 AI를 안 씀
    const articleId = articleOfCard(cardId);
    noCardJob(articleId);
    const card = db.getCard(cardId);
    const set = card ? db.getCardSet(card.cardSetId)!.cards.map((x) => x.index) : [0];
    return runner.start('cards', articleId, `카드 ${cardNo(set, card?.index ?? 0)}/${set.length} 다시 만드는 중`, async ({ signal, jobId }) => { await cardService(a.image, jobId).renderOne(cardId, { newBackground, signal }); }).job;
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
    return safeCopies([await ai().text.cardOne(v.doc, v.title, c.index, c.copy, others, input, { onUsage: onUsage() }, input?.writer, !!input && thinFacts(input), cs.cards.length, cardNo(cs.cards.map((x) => x.index), c.index))], input)[0];
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
      const all = db.getCardSet(cardSetId)!.cards;
      for (const c of all) {
        if (signal.aborted) break;
        step(`카드 ${cardNo(all.map((x) => x.index), c.index)}/${all.length} 생성 중`);
        await svc.renderOne(c.id, { newBackground: needNew, signal });
      }
      await fixOverflow(a.text, cardSetId, db.getArticle(articleId)?.input, { signal, step, jobId }); // 크기 · 스타일이 바뀌어 넘칠 수 있음
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
    const r = await dialog.showSaveDialog(ctx.win()!, { defaultPath: path.join(settings().saveDir, `${APP.backupName}_${new Date().toISOString().slice(0, 10)}.zip`), filters: [{ name: '백업 (zip)', extensions: ['zip'] }] });
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

  registerPhotoIpc(ctx);

  // ---------- 네이버 ----------
  handle('naver:status', z.undefined(), async () => ({ open: ctx.browser.isOpen(), loggedIn: await ctx.browser.loggedIn(), browser: findBrowser(settings().browserPath)?.name ?? null }));
  const noNaverJob = () => { if (runner.runningOf(['naver'])) throw new Error('지금 네이버에 글을 넣는 중이에요. 끝난 뒤 다시 눌러 주세요.'); };
  // 자동 입력 (예전 방식): 지금 문구에 동의해 켠 경우만. 화면에서 숨기는 것과 별개로 여기서도 막음 (태권 글뚝딱 2.8.0에서 옮김)
  const needAuto = () => { if (!naverAutoOn(settings().naverAuto)) throw new Error(NAVER_AUTO_OFF_MSG); };
  handle('naverAuto:consent', z.object({ version: z.literal(NAVER_AUTO_TERMS_VERSION), checks: z.tuple([z.literal(true), z.literal(true), z.literal(true)]) }), ({ version }) => {
    const consent = { version, at: new Date().toISOString(), appVersion: app.getVersion() };
    log('naver-auto-on', `${version} · 앱 ${consent.appVersion}`); // 동의 기록 (이 PC의 로그에만)
    return saveSettings(db, { naverAuto: consent });
  });
  handle('naverAuto:off', z.undefined(), async () => {
    if (runner.runningOf(['naver'])) throw new Error('지금 네이버에 글을 넣는 중이에요. 끝난 뒤 꺼 주세요.');
    log('naver-auto-off', '');
    await ctx.browser.close().catch(() => {});
    return saveSettings(db, { naverAuto: null });
  });
  handle('naver:openLogin', z.undefined(), () => { needAuto(); noNaverJob(); return ctx.browser.openLogin(); });
  handle('naver:close', z.undefined(), () => ctx.browser.close());
  handle('naver:clearSession', z.undefined(), () => ctx.browser.clearSession());
  // 초안 재료: 네이버 초안 입력과 붙여넣기 도우미가 같은 순서 · 같은 파일을 쓰게 한 곳에서 만듦
  function draftInputs(articleId: string, forPaste = false) {
    // 카드를 만드는 중에 넣으면 사진 없이 들어감 (2026-10-23 사진 빠짐 점검)
    if (forPaste && runner.runningOf(['cards', 'card'], articleId)) throw new Error('카드를 만드는 중이에요. 다 만들어지면 붙여넣기 도우미를 다시 시작해 주세요.');
    noCardJob(articleId);
    const art = db.getArticle(articleId);
    if (!art) throw new Error('글을 찾지 못했어요');
    const v = art.currentVersionId ? db.getVersion(art.currentVersionId) : null;
    if (!v) throw new Error('글을 먼저 만들어 주세요');
    const p = db.getProfile();
    if (!p) throw new Error(`${APP.place} 정보를 먼저 저장해 주세요`);
    const photo = art.input.photoScenes ? photoDraft(ctx, articleId, v.doc) : null; // 얼굴 가림을 확인하지 않은 사진 · 끊어진 연결 · 본문의 아이 이름이 있으면 여기서 멈춤
    const cs = db.latestCardSet(articleId);
    const cards = (cs?.cards ?? []).filter((c) => c.status === 'done' && c.outputPath);
    if (cs && cards.some((c) => c.overflow)) throw new Error('글자가 넘친 카드가 있어요. 카드 문구를 줄인 뒤 넣어 주세요.');
    // 사진이 빠지는 이유를 끝 안내에 같이 알려 줌: 카드가 아예 없거나, 만들기에 실패한 카드
    const slots = (cs?.cards ?? []).map((c) => c.index); // 보여 주는 번호는 묶음 안 순서 (2장 묶음이면 카드 1 · 2)
    const missing = (cs?.cards ?? []).filter((c) => !(c.status === 'done' && c.outputPath)).map((c) => cardNo(slots, c.index));
    const cardNote = photo ? '' : !cs ? '카드를 아직 만들지 않아 사진 없이 넣었어요 (카드를 만든 뒤 넣으면 사진도 같이 들어가요)' : missing.length ? `카드 ${missing.join(', ')}번은 만들어지지 않아 빠졌어요 (카드 화면에서 다시 만들기)` : '';
    // 글쓴이 줄("○○반 담임 선생님 드림")은 본문 끝 문단에 이미 들어 있어서 따로 넣지 않음
    const blocks = buildBlocks(v.doc.sections, cards.map((c) => ({ title: c.copy.title, afterSectionId: c.afterSectionId, index: c.index })), v.doc.tags, photo?.marks, photo?.gif?.at);
    const cardFiles = [...(photo?.files ?? []), ...cards.map((c) => ({ index: c.index, file: c.outputPath! })), ...(photo?.gif ? [{ index: GIF_CARD, file: photo.gif.file }] : [])]; // GIF는 맨 나중에 (못 올라가도 다른 사진은 멈추지 않게)
    return { v, p, photo, slots, cardNote, blocks, cardFiles, noCards: !photo && !cs, missingCards: photo ? [] : missing };
  }
  handle('naver:fill', z.object({ articleId: Id, onExisting: z.enum(['stop', 'new']), typing: z.boolean().optional(), map: z.boolean().optional() }), ({ articleId, onExisting, typing, map }) => {
    needAuto();
    noNaverJob();
    const { v, p, photo, slots, cardNote, blocks, cardFiles } = draftInputs(articleId);
    if (!p.blogUrl) throw new Error(`${APP.place} 정보에 네이버 블로그 주소를 적어 주세요 (예: https://blog.naver.com/아이디)`);
    return runner.start('naver', articleId, STEP_LABEL.open, async ({ signal, step }) => {
      // 카카오 키가 있으면 주소의 도로명 · 지번을 받아 지도 대조에 씀. 실패해도 입력은 그대로
      const kakao = map && p.address?.trim() ? vault.get('kakao') : null;
      const known = kakao ? await lookupAddress(kakao, p.address!, signal).catch(() => null) : null;
      const r = await ctx.browser.fill({ blogUrl: p.blogUrl!, title: v.title, blocks, headings: v.doc.sections.flatMap((s) => (s.heading ? headingLines(s.heading) : [])), cardFiles, onExisting, typing: typing ? settings().typingSpeed : undefined, place: map ? { name: p.mapName?.trim() || p.name, address: p.address, region: p.region, known: known ?? undefined } : undefined, photoAnchors: photo?.anchors }, (s) => step(STEP_LABEL[s]), signal);
      if (r.state === 'need-login') throw new Error('네이버 로그인이 끝나지 않았어요. 열린 창에서 직접 로그인한 뒤 다시 눌러 주세요.');
      if (r.state === 'existing-draft') throw Object.assign(new Error('네이버 편집기에 작성 중인 글이 있어 덮어쓰지 않았어요. 새 글로 시작할지 골라 주세요.'), { code: 'existing-draft' });
      if (r.state === 'not-owner') throw new Error(`글쓰기 화면을 열지 못했어요. 로그인한 네이버 아이디가 blog.naver.com/${r.blogId} 의 주인인지 확인해 주세요.`);
      const c = r.check;
      const photoNote = photo ? photo.finish(c.leftMarks, r.order) : ''; // 사진을 다 못 넣었으면 여기서 멈춤 (이어 넣기)
      const leftCards = c.leftMarks.filter((n) => n !== GIF_CARD + 1 && n <= PHOTO_BASE).map((n) => cardNo(slots, n - 1));
      const gifNote = photo?.gifGone ? '사진이 바뀌어 GIF는 빠졌어요 (넣으려면 다시 만들어 주세요)' : photo?.gif ? (c.leftMarks.includes(GIF_CARD + 1) ? 'GIF를 올리지 못해 자리 글자가 남아 있어요 (처리본 폴더의 animated.gif를 그 자리에 직접 올려 주세요)' : 'GIF 넣음 (네이버 창에서 움직이는지 확인해 주세요)') : '';
      const msg = [`제목 ${c.titleOk ? '확인' : '다름 — 직접 확인 필요'}`, `이미지 ${c.images}장`, photoNote, cardNote, gifNote, r.map ? placeNote(r.map) : '', leftCards.length ? `카드 ${leftCards.join(', ')}번은 올리지 못해 자리 글자가 남아 있어요 (네이버 창에서 그 자리에 직접 올려 주세요 · 저장 폴더에 카드 파일이 있어요)` : '', '발행 · 저장은 직접 눌러 주세요'].filter(Boolean).join(' · ');
      return `입력 끝: ${msg}`;
    }).job;
  });

  // ---------- 붙여넣기 도우미 (태권 글뚝딱 2.8.0에서 옮김) ----------
  // 앱은 클립보드에 담고 파일 위치를 열기만 함. 네이버 창을 조작하거나 대신 붙여 넣지 않음 (Ctrl+V는 원장님 · 선생님이)
  const PasteOpts = z.object({ articleId: Id, map: z.boolean().optional() });
  // stamp: 준비할 때의 단계 · 파일을 요약한 값. 복사할 때 다시 계산해 다르면 복사하지 않음
  // (도중에 글을 고치거나 카드를 다시 만들면 '5번'이 다른 내용을 가리킬 수 있어서)
  function pastePlan({ articleId, map }: z.infer<typeof PasteOpts>) {
    const d = draftInputs(articleId, true);
    const plan = pasteSteps({ title: d.v.title, blocks: d.blocks, files: d.cardFiles, place: map ? { name: d.p.mapName?.trim() || d.p.name, address: d.p.address?.trim() } : undefined });
    const stamp = createHash('sha1').update(JSON.stringify(plan)).digest('hex');
    return { ...plan, stamp, d };
  }
  const fresh = (o: z.infer<typeof PasteOpts> & { stamp: string }) => {
    const { stamp, ...rest } = o;
    const p = pastePlan(rest);
    if (p.stamp !== stamp) throw new Error(PASTE_STALE);
    return p;
  };
  handle('paste:plan', PasteOpts, (o) => {
    const { steps, stamp, d } = pastePlan(o);
    const notes = [
      d.noCards ? '카드를 아직 만들지 않아 그림 단계가 없어요. 카드를 만든 뒤 [다시 준비]를 눌러 주세요.' : '',
      d.missingCards.length ? `카드 ${d.missingCards.join(', ')}번은 만들어지지 않아 빠져요 (카드 화면에서 다시 만들기)` : '',
      d.photo?.gifGone ? '사진이 바뀌어 GIF는 빠졌어요 (넣으려면 다시 만들어 주세요)' : '',
    ].filter(Boolean);
    return { steps, stamp, notes, canOpen: !!d.p.blogUrl && !!blogIdOf(d.p.blogUrl) };
  });
  const PasteAt = PasteOpts.extend({ stamp: z.string().max(64), step: z.number().int().min(0).max(500), item: z.number().int().min(0).max(100).optional() });
  // rich: 소제목을 꾸며서 (글자 + HTML 을 함께 담음 → 네이버는 HTML, 메모장 등은 글자를 씀). 끄면 글자만 (자동 입력과 같은 방식)
  handle('paste:copy', PasteAt.extend({ rich: z.boolean().optional() }), async ({ step, item, rich, ...o }) => {
    const { steps, files } = fresh(o);
    const s = steps[step];
    if (!s) throw new Error(PASTE_STALE);
    if (s.kind === 'text' && rich) { await clipboard.write([new ClipboardItem({ 'text/plain': s.text, 'text/html': `<meta charset="utf-8">${s.html}` })]); return true; }
    if (s.kind === 'title' || s.kind === 'text') { await clipboard.writeText(s.text); return true; }
    if (s.kind === 'place') { await clipboard.writeText(s.name); return true; }
    const f = files[step][item ?? 0];
    if (s.kind !== 'media' || !f || !s.items[item ?? 0]?.image) throw new Error('이 파일은 그림으로 복사할 수 없어요. [파일 위치 열기]로 올려 주세요.');
    if (!fs.existsSync(f)) throw new Error('그림 파일이 없어졌어요. 카드나 사진을 다시 만들어 주세요.');
    const buf = /\.png$/i.test(f) ? fs.readFileSync(f) : nativeImage.createFromPath(f).toPNG();
    if (!buf.length) throw new Error('그림을 읽지 못했어요. [파일 위치 열기]로 올려 주세요.');
    await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(buf)], { type: 'image/png' }) })]);
    return true;
  });
  handle('paste:show', PasteAt, ({ step, item, ...o }) => {
    const f = fresh(o).files[step]?.[item ?? 0];
    if (!f || !fs.existsSync(f)) throw new Error('파일을 찾지 못했어요. 다시 만들어 주세요.');
    shell.showItemInFolder(f);
    return true;
  });
  // 끝까지 했을 때: 사진 글이면 '사용한 사진'으로 기록 (자동 입력과 같게 — 다음에 같은 사진을 고르면 알려 줌)
  handle('paste:finish', PasteOpts.extend({ stamp: z.string().max(64) }), (o) => {
    const { d } = fresh(o);
    if (d.photo) db.markPhotosUsed(o.articleId, d.photo.hashes);
    return true;
  });
  // 평소 쓰는 브라우저로 글쓰기 주소만 엶 (로그인 · 입력은 원장님 · 선생님이)
  handle('paste:openWrite', z.undefined(), () => {
    const id = blogIdOf(db.getProfile()?.blogUrl ?? '');
    if (!id) throw new Error(`${APP.place} 정보에 네이버 블로그 주소를 적어 주세요 (예: https://blog.naver.com/아이디)`);
    return shell.openExternal(`https://blog.naver.com/${encodeURIComponent(id)}?Redirect=Write&`);
  });

  // ---------- 공통 ----------
  handle('job:cancel', Id, (id) => runner.cancel(id));
  handle('job:get', Id, (id) => db.getJob(id));
  handle('usage:summary', z.undefined(), () => {
    const d = new Date();
    return { since: new Date(d.getFullYear(), d.getMonth(), 1).toISOString(), rows: db.usageSummary(new Date(d.getFullYear(), d.getMonth(), 1).toISOString()) };
  });
  // 외부 링크: 정해 둔 공식 주소만
  const ALLOWED = /^https:\/\/(kinder\.growmoment\.co\.kr|growmoment\.co\.kr|pf\.kakao\.com|naver\.github\.io|github\.com\/naver|searchad\.naver\.com|manage\.searchad\.naver\.com|platform\.openai\.com|developers\.kakao\.com|blog\.naver\.com|searchadvisor\.naver\.com)(\/|$)/;
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
