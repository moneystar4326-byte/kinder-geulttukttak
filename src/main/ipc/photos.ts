// 사진 폴더로 글쓰기 통로 (태권 글뚝딱 2.5.0~2.7.10에서 옮김)
// 원본: 지정 폴더에서 읽기만. 처리본: assets/photo-work/<글>/ (화면 미리보기와 네이버 입력이 같은 파일을 씀)
// 가리지 않은 원본은 디스크에 복사하지 않음 (화면이 메모리에서 처리해 처리본만 돌려줌)
// 사진은 OpenAI로 보내지 않음: AI에는 장면 칸 글자만 감 (유치원판은 아이들이 만 3~5세라 처리본도 이 PC 밖으로는 원장님 · 선생님이 직접 올릴 때만)
import fs from 'node:fs';
import path from 'node:path';
import { dialog, shell } from 'electron';
import { z } from 'zod';
import { handle, type AppCtx } from './index';
import { ArticleInputSchema } from '../../shared/schemas';
import { withKeywordFallback } from '../../shared/validation';
import { bodyText } from '../../shared/count';
import { shortLines } from '../../shared/format';
import { cleanRegions, isJpeg, jpegHasMetadata, MAX_PHOTOS, namesInBody, PHOTO_EXT, photoLinkErrors, photoStory, scenesNamesInBody } from '../../shared/photos';
import { GIF_MAX_BYTES, isGif, pickFrames } from '../../shared/gif';
import { loadSettings } from '../settings';
import { APP } from '../../shared/kinder';
import { NAVER_AUTO_OFF_MSG, naverAutoOn } from '../../shared/naverAuto';
import type { ArticleDoc, KeywordRow, PhotoGif, PhotoItem, PhotoState } from '../../shared/types';
import { hashOf, photoFileProblems, scanFolder } from '../services/photo-folder';
import { STEP_LABEL } from '../services/browser-draft';
import { GIF_CARD, PHOTO_BASE } from '../services/browser-draft/editor';

const Id = z.string().min(1).max(64);
const PhotoId = z.string().regex(/^p\d{2}$/);
const Key = z.object({ articleId: Id, id: PhotoId });
const Regions = z.array(z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number(), source: z.enum(['auto', 'manual']) })).max(200);
const FOLDER_KEY = 'photoFolder';

const workDir = (ctx: AppCtx, articleId: string) => path.join(ctx.assetsDir, 'photo-work', articleId);
export const removePhotoWork = (ctx: AppCtx, articleId: string) => fs.rmSync(workDir(ctx, articleId), { recursive: true, force: true });
const items = (ctx: AppCtx, articleId: string): PhotoItem[] => ctx.db.listPhotos(articleId).map((x) => ({ ...x, processedFile: x.processedFile ? path.join(ctx.assetsDir, x.processedFile) : undefined }));
// 뺀 사진은 글에서 자리를 받지 않음 (그 장면 글은 남음)
const liveDoc = (doc: Pick<ArticleDoc, 'sections'>, all: PhotoItem[]) => {
  const out = new Set(all.filter((x) => x.excluded).map((x) => x.id));
  return { sections: doc.sections.map((s) => (s.photoId && out.has(s.photoId) ? { ...s, photoId: undefined } : s)) };
};

// 움직이는 GIF (태권 글뚝딱 2.7.0에서 옮김): 처리본으로만 만듦. 만들 때의 사진(순서 · 처리본 해시)을 기억해, 사진이 바뀌면 바로 지움 (가리기 전 얼굴이 GIF에 남지 않게)
const gifFile = (ctx: AppCtx, articleId: string) => path.join(workDir(ctx, articleId), 'animated.gif');
const gifMeta = (ctx: AppCtx, articleId: string) => path.join(workDir(ctx, articleId), 'animated.json');
function gifPlan(ctx: AppCtx, articleId: string, doc: ArticleDoc | null) {
  const all = items(ctx, articleId);
  const byId = new Map(all.filter((x) => !x.excluded).map((x) => [x.id, x]));
  const linked = (doc?.sections ?? []).filter((s) => s.photoId && byId.has(s.photoId)).map((s) => byId.get(s.photoId!)!);
  const ready = !photoFileProblems(all).length && linked.length === byId.size && linked.length > 0;
  return { ready, total: linked.length, ids: pickFrames(linked).map((x) => x.id), sig: hashOf(new TextEncoder().encode(linked.map((x) => `${x.id}:${x.processedHash ?? ''}`).join('|'))) };
}
function currentGif(ctx: AppCtx, articleId: string, doc: ArticleDoc | null): { gif: PhotoGif | null; gone: boolean } {
  let meta: (Omit<PhotoGif, 'file' | 'bytes'> & { sig: string; gone?: boolean }) | null = null;
  try { meta = JSON.parse(fs.readFileSync(gifMeta(ctx, articleId), 'utf-8')); } catch { return { gif: null, gone: false }; }
  if (!meta || meta.gone) return { gif: null, gone: !!meta?.gone };
  const file = gifFile(ctx, articleId);
  const plan = gifPlan(ctx, articleId, doc);
  const bytes = fs.existsSync(file) ? fs.readFileSync(file) : null;
  if (!bytes || !plan.ready || plan.sig !== meta.sig || hashOf(bytes) !== meta.hash) {
    fs.rmSync(file, { force: true });
    fs.writeFileSync(gifMeta(ctx, articleId), JSON.stringify({ gone: true }));
    return { gif: null, gone: true };
  }
  return { gif: { file, hash: meta.hash, at: meta.at, delay: meta.delay, frames: meta.frames, w: meta.w, h: meta.h, bytes: bytes.length }, gone: false };
}

export function photoBlockers(ctx: AppCtx, articleId: string, doc: ArticleDoc | null) {
  const all = items(ctx, articleId);
  const blockers = photoFileProblems(all);
  if (doc) {
    blockers.push(...photoLinkErrors(liveDoc(doc, all), all.filter((x) => !x.excluded).map((x) => x.id)));
    const names = [...new Set([...namesInBody(bodyText(doc)), ...scenesNamesInBody(bodyText(doc), all.map((x) => x.title), ctx.db.getArticle(articleId)?.input.photoNotNames)])];
    if (names.length) blockers.push(`글에 아이 이름으로 보이는 말이 있어요: ${names.join(', ')}. 지우거나 고친 뒤 넣어 주세요.`);
  }
  return blockers;
}

// 네이버 넣기 재료. 사진 번호는 글 순서대로 (섹션을 옮기면 사진도 같이)
function draftParts(ctx: AppCtx, articleId: string, doc: ArticleDoc) {
  const all = items(ctx, articleId);
  const byId = new Map(all.filter((x) => !x.excluded).map((x) => [x.id, x]));
  const linked = doc.sections.filter((s) => s.photoId && byId.has(s.photoId));
  const marks = linked.map((s, n) => ({ sectionId: s.id, index: PHOTO_BASE + n, title: byId.get(s.photoId!)!.title }));
  const files = linked.map((s, n) => ({ index: PHOTO_BASE + n, file: byId.get(s.photoId!)!.processedFile! }));
  const anchors = linked.map((s) => ({ title: byId.get(s.photoId!)!.title, lastLine: shortLines(s.paragraphs.filter((x) => x.trim()).pop() ?? '').split('\n').filter((l) => l.trim()).pop() ?? '' }));
  return { marks, files, anchors, hashes: linked.map((s) => byId.get(s.photoId!)!.hash) };
}

function finishWith(ctx: AppCtx, articleId: string, parts: { hashes: string[] }, leftMarks: number[], order: string[]) {
  const total = parts.hashes.length;
  const left = leftMarks.filter((n) => n > PHOTO_BASE).length;
  if (left) throw Object.assign(new Error(`${total}장 중 ${total - left}장까지 들어갔어요. 남은 자리에 [사진 n] 글자가 있으니 그대로 발행하지 마세요. 아래 [남은 사진 이어 넣기]를 눌러 주세요.`), { code: 'photos-partial' });
  if (order.length) return `사진 순서를 확인하지 못해요: ${order[0]} (네이버 창에서 직접 확인해 주세요)`; // 사용 이력에 넣지 않음
  ctx.db.markPhotosUsed(articleId, parts.hashes);
  return `사진 ${total}장 순서 확인`;
}

export function photoDraft(ctx: AppCtx, articleId: string, doc: ArticleDoc) {
  const blockers = photoBlockers(ctx, articleId, doc);
  if (blockers.length) throw new Error(blockers[0]);
  const parts = draftParts(ctx, articleId, doc);
  const { gif, gone: gifGone } = currentGif(ctx, articleId, doc);
  return { ...parts, gif, gifGone, finish: (leftMarks: number[], order: string[]) => finishWith(ctx, articleId, parts, leftMarks, order) };
}

export function registerPhotoIpc(ctx: AppCtx) {
  const { db, runner } = ctx;
  const folder = () => db.getSetting<string>(FOLDER_KEY, '');
  const inFolder = (file: string) => !!folder() && path.dirname(path.resolve(file)) === path.resolve(folder()) && PHOTO_EXT.test(file);

  handle('photos:folder', z.undefined(), () => { const dir = folder(); return { dir, exists: !!dir && fs.existsSync(dir) }; });
  handle('photos:pickFolder', z.undefined(), async () => {
    const r = await dialog.showOpenDialog(ctx.win()!, { title: '놀이 · 활동 사진 폴더 고르기', properties: ['openDirectory'], defaultPath: folder() || undefined });
    if (r.canceled || !r.filePaths[0]) return null;
    db.setSetting(FOLDER_KEY, r.filePaths[0]);
    return r.filePaths[0];
  });
  handle('photos:scan', z.undefined(), async () => {
    const dir = folder();
    if (!dir) return [];
    if (!fs.existsSync(dir)) throw new Error('사진 폴더를 찾지 못했어요. 옮겼다면 [바꾸기]로 다시 골라 주세요.');
    return scanFolder(dir, db.usedHashes());
  });
  // 원본 바이트는 화면 메모리로만 (썸네일 · 얼굴 감지)
  handle('photos:bytes', z.string().max(1000), (file) => {
    if (!inFolder(file)) throw new Error('사진 폴더 밖의 파일이에요');
    return new Uint8Array(fs.readFileSync(file));
  });
  handle('photos:create', z.object({ input: ArticleInputSchema, keywords: z.array(z.any()).max(50), photos: z.array(z.object({ path: z.string().max(1000), title: z.string().min(1).max(200) })).min(1).max(MAX_PHOTOS) }), ({ input, keywords, photos }) => {
    const p = db.getProfile();
    if (!p) throw new Error(`${APP.place} 정보를 먼저 저장해 주세요`);
    const rows = photos.map((x, i) => {
      if (!inFolder(x.path)) throw new Error('사진 폴더 밖의 파일이에요');
      return { id: `p${String(i + 1).padStart(2, '0')}`, hash: hashOf(fs.readFileSync(x.path)), sourcePath: x.path, title: x.title.trim() };
    });
    const scenes = rows.map((r) => ({ id: r.id, title: r.title }));
    const art = db.createArticle(p.id, withKeywordFallback({ ...input, tone: '따뜻한 설명형' as const, photoScenes: scenes, withCards: false, cardCount: 0, facts: { ...input.facts, story: photoStory(input.topic, scenes) } } as any), keywords as KeywordRow[], false);
    db.addPhotos(art.id, rows);
    return art;
  });
  handle('photos:state', Id, (articleId): PhotoState => {
    const art = db.getArticle(articleId);
    const v = art?.currentVersionId ? db.getVersion(art.currentVersionId) : null;
    const last = db.recentJobs(articleId).find((j) => j.type === 'naver');
    const doc = v?.doc ?? null;
    const g = doc ? currentGif(ctx, articleId, doc) : { gif: null, gone: false };
    return { items: items(ctx, articleId), blockers: v ? photoBlockers(ctx, articleId, v.doc) : ['글을 먼저 만들어 주세요'], workDir: workDir(ctx, articleId), resumable: last?.state === 'failed' && last.errorCode !== 'existing-draft' && ctx.browser.isOpen(), gif: g.gif, gifGone: g.gone, gifPlan: gifPlan(ctx, articleId, doc) };
  });
  handle('photos:faceModel', z.undefined(), () => {
    const dir = path.join(path.dirname(ctx.fontDir), 'face-models');
    return { manifest: JSON.parse(fs.readFileSync(path.join(dir, 'ssd_mobilenetv1_model-weights_manifest.json'), 'utf-8')), bin: new Uint8Array(fs.readFileSync(path.join(dir, 'ssd_mobilenetv1_model.bin'))) };
  });
  // 원본 읽기: 이 글을 만들 때의 사진과 같을 때만
  handle('photos:source', Key, ({ articleId, id }) => {
    const x = db.getPhoto(articleId, id);
    if (!x) throw new Error('사진을 찾지 못했어요');
    let b: Buffer;
    try { b = fs.readFileSync(x.sourcePath); } catch { throw new Error('원본 사진을 찾지 못했어요. 폴더에 다시 넣거나 이 사진을 빼 주세요.'); }
    if (hashOf(b) !== x.hash) throw new Error('원본 사진이 바뀌었어요. 다시 처리해 주세요.');
    return new Uint8Array(b);
  });
  // 원본 교체 · 처리본 없어짐 → 다시 처리, 확인 해제
  handle('photos:verify', Id, (articleId) => {
    for (const x of items(ctx, articleId)) {
      let hash: string | null = null;
      try { hash = hashOf(fs.readFileSync(x.sourcePath)); } catch { /* 원본이 없어도 처리본이 있으면 쓸 수 있음 */ }
      if (hash && hash !== x.hash) db.updatePhoto(articleId, x.id, { hash, status: 'pending', confirmed: false, regions: [], faces: 0, processedHash: undefined, error: undefined });
      else if (x.status === 'ready' && (!x.processedFile || !fs.existsSync(x.processedFile))) db.updatePhoto(articleId, x.id, { status: 'pending', confirmed: false, error: undefined });
    }
  });
  handle('photos:saveProcessed', z.object({ articleId: Id, id: PhotoId, jpeg: z.instanceof(Uint8Array), regions: Regions, faces: z.number().int().min(0).max(1000) }), ({ articleId, id, jpeg, regions, faces }) => {
    if (!db.getPhoto(articleId, id)) throw new Error('사진을 찾지 못했어요');
    if (jpeg.length > 40 * 1024 * 1024 || !isJpeg(jpeg)) throw new Error('처리한 사진을 저장하지 못했어요');
    if (jpegHasMetadata(jpeg)) throw new Error('처리본에 촬영 정보가 남아 있어 저장하지 않았어요');
    const dir = workDir(ctx, articleId);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${id}.jpg`);
    fs.writeFileSync(`${file}.tmp`, jpeg);
    fs.renameSync(`${file}.tmp`, file);
    db.updatePhoto(articleId, id, { status: 'ready', regions: cleanRegions(regions), faces, processedFile: path.relative(ctx.assetsDir, file), processedHash: hashOf(jpeg), confirmed: false, error: undefined });
  });
  handle('photos:markFailed', z.object({ articleId: Id, id: PhotoId, error: z.string().max(500) }), ({ articleId, id, error }) => { db.updatePhoto(articleId, id, { status: 'failed', confirmed: false, error }); });
  handle('photos:retry', Key, ({ articleId, id }) => { db.updatePhoto(articleId, id, { status: 'pending', confirmed: false, regions: [], faces: 0, error: undefined }); });
  handle('photos:confirm', z.object({ articleId: Id, id: PhotoId, noFace: z.boolean().optional() }), ({ articleId, id, noFace }) => {
    const x = db.getPhoto(articleId, id);
    if (!x || x.status !== 'ready') throw new Error('처리가 끝난 사진만 확인할 수 있어요');
    if (!x.regions.length && !noFace) throw new Error('가린 곳이 없는 사진은 얼굴이 없는지 확인해 주세요');
    db.updatePhoto(articleId, id, { confirmed: true });
  });
  handle('photos:exclude', z.object({ articleId: Id, id: PhotoId, excluded: z.boolean() }), ({ articleId, id, excluded }) => { db.updatePhoto(articleId, id, { excluded, confirmed: false }); });
  handle('photos:openWork', Id, (articleId) => shell.openPath(workDir(ctx, articleId)));
  const docOf = (articleId: string) => { const a = db.getArticle(articleId); return a?.currentVersionId ? db.getVersion(a.currentVersionId)?.doc ?? null : null; };
  // GIF 재료: 확인이 끝난 처리본만 화면으로
  handle('photos:gifFrame', Key, ({ articleId, id }) => {
    const x = items(ctx, articleId).find((p) => p.id === id);
    if (!x || x.excluded || !x.confirmed || x.status !== 'ready' || !x.processedFile) throw new Error('확인을 마친 사진만 GIF에 넣을 수 있어요');
    const b = fs.readFileSync(x.processedFile);
    if (hashOf(b) !== x.processedHash) throw new Error('처리본이 바뀌었어요. 다시 확인해 주세요.');
    return new Uint8Array(b);
  });
  handle('photos:saveGif', z.object({ articleId: Id, sig: z.string().max(100), gif: z.instanceof(Uint8Array), at: z.enum(['bottom', 'top']), delay: z.number().int().min(10).max(1000), frames: z.number().int().min(2).max(100), w: z.number().int().min(1).max(4000), h: z.number().int().min(1).max(4000) }), ({ articleId, sig, gif, at, delay, frames, w, h }) => {
    const plan = gifPlan(ctx, articleId, docOf(articleId));
    if (!plan.ready || plan.sig !== sig) throw new Error('만드는 사이에 사진이 바뀌었어요. 다시 만들어 주세요.');
    if (gif.length > GIF_MAX_BYTES + 1024 * 1024 || !isGif(gif)) throw new Error('GIF를 저장하지 못했어요');
    const file = gifFile(ctx, articleId);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.tmp`, gif);
    fs.renameSync(`${file}.tmp`, file);
    fs.writeFileSync(gifMeta(ctx, articleId), JSON.stringify({ sig, hash: hashOf(gif), at, delay, frames, w, h }));
  });
  handle('photos:gifAt', z.object({ articleId: Id, at: z.enum(['bottom', 'top']) }), ({ articleId, at }) => {
    const meta = JSON.parse(fs.readFileSync(gifMeta(ctx, articleId), 'utf-8'));
    fs.writeFileSync(gifMeta(ctx, articleId), JSON.stringify({ ...meta, at }));
  });
  handle('photos:removeGif', Id, (articleId) => { fs.rmSync(gifFile(ctx, articleId), { force: true }); fs.rmSync(gifMeta(ctx, articleId), { force: true }); });
  handle('photos:saveGifAs', Id, async (articleId) => {
    const { gif } = currentGif(ctx, articleId, docOf(articleId));
    if (!gif) throw new Error('GIF를 다시 만들어 주세요');
    const r = await dialog.showSaveDialog(ctx.win()!, { defaultPath: path.join(loadSettings(db).saveDir, '움직이는사진.gif'), filters: [{ name: 'GIF', extensions: ['gif'] }] });
    if (r.canceled || !r.filePath) return null;
    fs.copyFileSync(gif.file, r.filePath);
    return r.filePath;
  });

  // 남은 사진 이어 넣기: 편집기 내용이 기록과 맞을 때만. 안 맞으면 다시 넣지 않고 복사 · 폴더 열기로 안내
  handle('naver:resumePhotos', Id, (articleId) => {
    if (!naverAutoOn(loadSettings(db).naverAuto)) throw new Error(NAVER_AUTO_OFF_MSG); // 자동 입력 꺼짐이면 이어 넣기도 막음
    if (runner.runningOf(['naver'])) throw new Error('지금 네이버에 글을 넣는 중이에요. 끝난 뒤 다시 눌러 주세요.');
    const art = db.getArticle(articleId);
    const v = art?.currentVersionId ? db.getVersion(art.currentVersionId) : null;
    if (!v) throw new Error('글을 먼저 만들어 주세요');
    const d = photoDraft(ctx, articleId, v.doc);
    return runner.start('naver', articleId, '남은 사진 이어 넣는 중', async ({ signal, step }) => {
      const r = await ctx.browser.resume({ title: v.title, cardFiles: [...d.files, ...(d.gif ? [{ index: GIF_CARD, file: d.gif.file }] : [])], photoAnchors: d.anchors }, (s) => step(STEP_LABEL[s]), signal);
      if (r.state === 'mismatch') throw new Error(`자동으로 이어 넣지 않았어요: ${r.why}. [전체 복사]와 [처리본 폴더 열기]로 직접 넣어 주세요.`);
      return `입력 끝: ${d.finish(r.check.leftMarks, r.order)} · 발행 · 저장은 직접 눌러 주세요`;
    }).job;
  });
}
