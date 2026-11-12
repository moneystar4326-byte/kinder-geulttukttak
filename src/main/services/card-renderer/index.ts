// 카드 3장 만들기 (기획서 7장)
// - 배경(AI 또는 템플릿) · 문구 · 로고를 따로 저장 → 문구를 고쳐도 배경은 다시 만들지 않음 (이미지 API 재호출 없음)
// - 한 장이 실패해도 다른 장은 그대로, 실패한 장만 다시
import fs from 'node:fs';
import path from 'node:path';
import type { Db } from '../../db';
import type { Card, CardCopy, CardSet, DojoProfile } from '../../../shared/types';
import { ApiError, toApiError } from '../errors';
import type { CallOpts, ImageAI } from '../openai';
import { kinderBackgroundPrompt, kinderRefLead } from '../openai/image-prompt';
import { APP } from '../../../shared/kinder';
import { cardHtml, copyHints, sizeOf, type Measure } from './template';
import { cardNo } from '../../../shared/cardRoles';
import type { PhotoFit } from '../../../shared/cardPhotoFit';

export interface Shooter { shoot(html: string, w: number, h: number, outFile: string): Promise<Measure> }

export interface CardDeps {
  db: Db;
  image: ImageAI | null; // null = 이미지 모델 없음 (템플릿만)
  shooter: Shooter;
  assetsDir: string;
  fontDir: string;
  profile: () => DojoProfile | null;
  autoRetry: number; // 자동 재시도 횟수 (기본 1)
  monthlyImageLimit: number;
  onUsage?: CallOpts['onUsage'];
}

const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString(); };

export function cardDir(assetsDir: string, cs: Pick<CardSet, 'id'>, idx: number) {
  const d = path.join(assetsDir, 'cards', cs.id, String(idx + 1));
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// 글을 지울 때 그 글의 카드 파일 · 넣은 사진까지 지움 (태권 글뚝딱 2.6.x에서 옮김) (아이 사진이 PC에 남지 않게)
// 파일이 잠겨 있으면 목록에 적어 두고 다음에 앱을 켤 때 다시 지움. 못 지운 묶음 수를 돌려줌
const pendingFile = (assetsDir: string) => path.join(assetsDir, 'cards', '.delete-pending.json');
const SET_ID = /^[0-9a-f-]{36}$/i;
const readPending = (assetsDir: string): string[] => {
  try { const v = JSON.parse(fs.readFileSync(pendingFile(assetsDir), 'utf-8')); return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && SET_ID.test(x)) : []; } catch { return []; }
};
function removeSets(assetsDir: string, ids: string[]) {
  return ids.filter((id) => {
    try { fs.rmSync(path.join(assetsDir, 'cards', id), { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); return false; } catch { return true; }
  });
}
function writePending(assetsDir: string, ids: string[]) {
  try {
    if (ids.length) { fs.mkdirSync(path.dirname(pendingFile(assetsDir)), { recursive: true }); fs.writeFileSync(pendingFile(assetsDir), JSON.stringify(ids)); } else fs.rmSync(pendingFile(assetsDir), { force: true });
  } catch { /* 목록을 못 적어도 글 지우기는 계속 */ }
}
export function removeCardFiles(assetsDir: string, cardSetIds: string[]) {
  const left = removeSets(assetsDir, cardSetIds);
  if (left.length) writePending(assetsDir, [...new Set([...readPending(assetsDir), ...left])]);
  return left.length;
}
export function retryPendingCardFiles(assetsDir: string) {
  const ids = readPending(assetsDir);
  if (ids.length) writePending(assetsDir, removeSets(assetsDir, ids));
}

const usable = (f?: string): f is string => !!f && fs.existsSync(f);

export function createCardService(deps: CardDeps) {
  const { db } = deps;

  async function makeBackground(cs: CardSet, card: Card, signal?: AbortSignal) {
    if (cs.style.mode !== 'ai') return undefined;
    if (!deps.image) throw new ApiError('permission', '이미지 모델을 쓸 수 없어요. 템플릿 모드로 바꾸거나 설정에서 OpenAI 키 · 이미지 모델을 확인해 주세요.', 'OpenAI 이미지');
    const used = db.countUsage('image', monthStart());
    if (used >= deps.monthlyImageLimit) throw new ApiError('limit', `이번 달 AI 그림 한도(${deps.monthlyImageLimit}장)에 닿았어요. 설정에서 한도를 바꾸거나 템플릿 모드를 써 주세요.`, 'OpenAI 이미지');
    // AI 그림은 가로로 그려 카드 위쪽에 통째로 (글과 겹치지 않음)
    const prof = deps.profile();
    // 참고 그림 순서 = kinderRefLead 번호 순서: 원복 → 교실 → 로고(원복 로고를 켰을 때)
    const hasUniform = !!prof?.dobokRefPath && fs.existsSync(prof.dobokRefPath);
    const hasCoach = !!prof?.coachRefPath && fs.existsSync(prof.coachRefPath);
    // 원복 사진이 있을 때만 그림 속 로고 (원복이 없으면 로고 참고 그림도 보내지 않음)
    const logoRef = !!prof?.logoOnDobok && !!prof.logoPath && fs.existsSync(prof.logoPath) && hasUniform;
    const refs = [prof?.dobokRefPath, prof?.coachRefPath, logoRef ? prof?.logoPath : undefined].filter((f): f is string => !!f && fs.existsSync(f));
    // 아이 나이는 유치원이라 늘 만 3~5세 (image-prompt.ts)
    const prompt = kinderRefLead(hasUniform, hasCoach, logoRef) + kinderBackgroundPrompt(card.copy.scene, cs.style.style, 'split', hasUniform, logoRef);
    let lastErr: ApiError | null = null;
    for (let attempt = 0; attempt <= deps.autoRetry; attempt++) {
      try {
        const png = await deps.image.background(prompt, { signal, onUsage: deps.onUsage, size: '1536x1024', refs });
        const file = path.join(cardDir(deps.assetsDir, cs, card.index), `background-${Date.now()}.png`);
        fs.writeFileSync(file, png);
        return file;
      } catch (e) {
        lastErr = toApiError('OpenAI 이미지', e);
        // 인증 · 권한 · 한도 · 취소는 다시 해도 같음. 이미 과금됐을 수 있어 일시 오류만 제한적으로
        if (!lastErr.retryable) break;
      }
    }
    throw lastErr!;
  }

  async function compose(cs: CardSet, card: Card) {
    const prof = deps.profile();
    const { w, h } = sizeOf(cs.style.size);
    const dir = cardDir(deps.assetsDir, cs, card.index);
    const out = path.join(dir, 'card.png');
    const html = cardHtml({
      copy: card.copy, index: card.index, no: cardNo(cs.cards.map((x) => x.index), card.index), total: cs.cards.length, style: cs.style.style, size: cs.style.size,
      brand: prof?.brand ?? APP.brand, dojoName: prof?.name ?? '',
      logoFile: prof?.logoPath && fs.existsSync(prof.logoPath) ? prof.logoPath : undefined, logoScale: prof?.logoScale,
      backgroundFile: usable(card.photoPath) ? card.photoPath : usable(card.backgroundPath) ? card.backgroundPath : undefined,
      photoFit: usable(card.photoPath) ? card.photoFit : undefined,
      fontDir: deps.fontDir,
    });
    const m = await deps.shooter.shoot(html, w, h, out);
    // 재편집용 층 정보 (배경 · 문구 · 로고 따로)
    fs.writeFileSync(path.join(dir, 'layers.json'), JSON.stringify({ copy: card.copy, style: cs.style, background: card.photoPath ?? card.backgroundPath ?? 'template', logo: prof?.logoPath ?? null, measure: m }, null, 2), 'utf-8');
    if (m.broken.length) throw new ApiError('unknown', '카드 그림 파일을 읽지 못했어요. 이 카드만 다시 만들어 주세요.', '카드');
    if (!m.fontsOk) throw new ApiError('unknown', '카드 폰트를 불러오지 못했어요. 프로그램을 다시 설치해 주세요.', '카드');
    return { out, overflow: m.overflow };
  }

  // 한 장 만들기. newBackground=true 면 AI 배경도 새로 (실패 카드 재생성 · "그림 다시")
  async function renderOne(cardId: string, opts: { newBackground?: boolean; signal?: AbortSignal } = {}) {
    let card = db.getCard(cardId)!;
    const cs = db.getCardSet(card.cardSetId)!;
    db.updateCard(card.id, { status: 'running' });
    db.refreshCardSetStatus(cs.id);
    try {
      // 넣어 둔 사진 파일이 사라졌으면 알리고 그림을 그리지 않음 (확인 없이 비용이 나가지 않게)
      if (card.photoPath && !usable(card.photoPath)) {
        card = db.updateCard(card.id, { photoPath: undefined, photoFit: undefined });
        throw new ApiError('unknown', '넣어 둔 사진 파일을 찾지 못했어요. 사진을 다시 넣어 주세요.', '카드');
      }
      // 스타일이 바뀌어 새 그림이 필요한 묶음: 사진 카드의 옛 그림은 다른 카드와 안 맞으므로 돌아갈 그림에서 뺌
      if (usable(card.photoPath) && opts.newBackground && card.backgroundPath) card = db.updateCard(card.id, { backgroundPath: undefined });
      // 사진을 넣은 카드는 그림을 그리지 않음 (비용 없음 · 사진을 덮지 않음)
      if (cs.style.mode === 'ai' && !usable(card.photoPath) && (opts.newBackground || !usable(card.backgroundPath))) {
        const bg = await makeBackground(cs, card, opts.signal);
        card = db.updateCard(card.id, { backgroundPath: bg });
      }
      if (cs.style.mode === 'template' && card.backgroundPath) card = db.updateCard(card.id, { backgroundPath: undefined });
      const r = await compose(cs, card);
      card = db.updateCard(card.id, { outputPath: r.out, overflow: r.overflow, status: 'done' });
    } catch (e) {
      const err = toApiError('카드', e);
      card = db.updateCard(card.id, { status: 'failed', error: err.message });
    }
    db.refreshCardSetStatus(cs.id);
    return card;
  }

  // 그림 칸을 사진으로 바꾸거나(src) 사진을 뺌(null). 사진은 이 PC에서 합치기만 하고 AI로 보내지 않음
  // 원본을 지워도 되게 복사해 둠. 합치기에 실패하면 전 카드로 되돌림
  async function setPhoto(cardId: string, src: string | null) {
    const before = db.getCard(cardId)!;
    const cs = db.getCardSet(before.cardSetId)!;
    const dest = src ? path.join(cardDir(deps.assetsDir, cs, before.index), `photo-${Date.now()}${path.extname(src).toLowerCase()}`) : undefined;
    if (src && dest) fs.copyFileSync(src, dest);
    try {
      const r = await compose(cs, db.updateCard(cardId, { photoPath: dest, photoFit: undefined }));
      if (before.photoPath) fs.rmSync(before.photoPath, { force: true });
      return db.updateCard(cardId, { outputPath: r.out, overflow: r.overflow, status: 'done' });
    } catch (e) {
      if (dest) fs.rmSync(dest, { force: true });
      await compose(cs, db.updateCard(cardId, { photoPath: before.photoPath, photoFit: before.photoFit })).catch(() => {});
      throw toApiError('카드', e);
    } finally { db.refreshCardSetStatus(cs.id); }
  }

  // 얼굴을 가린 사진으로 바꿈. 가리기 전 복사본은 지움 (되돌리려면 사진을 다시 넣음). 그사이 사진이 바뀌었으면 하지 않음
  // 유치원판: 가린 곳이 없어도("얼굴 없는 사진이 맞아요") 확인한 것으로 남김 (masked). 확인 전 사진 카드는 네이버 넣기를 막음
  async function setMaskedPhoto(cardId: string, photoPath: string, jpeg: Uint8Array, size?: { w: number; h: number }) {
    const before = db.getCard(cardId)!;
    if (before.photoPath !== photoPath) return before;
    const cs = db.getCardSet(before.cardSetId)!;
    const dest = path.join(cardDir(deps.assetsDir, cs, before.index), `photo-${Date.now()}.jpg`);
    fs.writeFileSync(dest, jpeg);
    try {
      const r = await compose(cs, db.updateCard(cardId, { photoPath: dest, photoFit: before.photoFit ? { ...before.photoFit, masked: true } : size ? { ...size, faces: [], masked: true } : undefined }));
      fs.rmSync(photoPath, { force: true });
      return db.updateCard(cardId, { outputPath: r.out, overflow: r.overflow, status: 'done' });
    } catch (e) {
      fs.rmSync(dest, { force: true });
      await compose(cs, db.updateCard(cardId, { photoPath: before.photoPath, photoFit: before.photoFit })).catch(() => {});
      throw toApiError('카드', e);
    } finally { db.refreshCardSetStatus(cs.id); }
  }

  // 사진 크기 · 얼굴 위치가 나오면 칸에 맞춰 다시 합침. 그사이 사진이 바뀌었으면 하지 않음
  async function setPhotoFit(cardId: string, photoPath: string, fit: PhotoFit) {
    const before = db.getCard(cardId)!;
    if (before.photoPath !== photoPath) return before;
    const cs = db.getCardSet(before.cardSetId)!;
    try {
      const r = await compose(cs, db.updateCard(cardId, { photoFit: fit }));
      return db.updateCard(cardId, { outputPath: r.out, overflow: r.overflow, status: 'done' });
    } catch (e) {
      await compose(cs, db.updateCard(cardId, { photoFit: before.photoFit })).catch(() => {});
      throw toApiError('카드', e);
    } finally { db.refreshCardSetStatus(cs.id); }
  }

  // 문구부터 새로 만들 때 같은 자리 카드의 사진을 새 묶음으로 옮김 (그 카드는 그림을 그리지 않음)
  // 옛 묶음은 화면에서 볼 수 없으므로 사진 · 사진이 찍힌 카드 그림을 남기지 않음 (장수가 줄어 빠진 사진 포함)
  function carryPhotos(from: CardSet | null, toSetId: string) {
    if (!from) return;
    const to = db.getCardSet(toSetId)!;
    for (const prev of from.cards) {
      if (!prev.photoPath) continue;
      const c = to.cards.find((x) => x.index === prev.index);
      let moved = false;
      if (c && usable(prev.photoPath)) {
        const dest = path.join(cardDir(deps.assetsDir, to, c.index), path.basename(prev.photoPath));
        try {
          fs.renameSync(prev.photoPath, dest);
          db.updateCard(c.id, { photoPath: dest, photoFit: prev.photoFit });
          moved = true;
        } catch {
          // 옮기지 못하면 옛 자리의 사진을 그대로 씀 (글을 지울 때 함께 지워짐)
          db.updateCard(c.id, { photoPath: prev.photoPath, photoFit: prev.photoFit });
          continue;
        }
      } else if (c) db.updateCard(c.id, { photoPath: prev.photoPath }); // 파일이 사라짐: 그림을 그리지 않고 만들 때 알림
      if (!moved) { try { fs.rmSync(prev.photoPath, { force: true }); } catch { /* 글을 지울 때 함께 지워짐 */ } }
      if (prev.outputPath) { try { fs.rmSync(prev.outputPath, { force: true }); } catch { /* 글을 지울 때 함께 지워짐 */ } }
      db.updateCard(prev.id, { photoPath: undefined, photoFit: undefined, outputPath: undefined });
    }
  }

  // 묶음 장수(1~3장)만큼 차례로. 성공한 장은 건너뜀 (실패한 장만 다시)
  async function renderSet(cardSetId: string, opts: { onStep?: (s: string) => void; signal?: AbortSignal; onlyFailed?: boolean } = {}) {
    const cs = db.getCardSet(cardSetId)!;
    for (const c of cs.cards) {
      if (opts.signal?.aborted) break;
      if (opts.onlyFailed && c.status === 'done') continue;
      opts.onStep?.(`카드 ${cardNo(cs.cards.map((x) => x.index), c.index)}/${cs.cards.length} 생성 중`);
      await renderOne(c.id, { signal: opts.signal });
    }
    return db.refreshCardSetStatus(cs.id);
  }

  // 문구만 고침 → 배경은 그대로 두고 다시 합성 (이미지 API 호출 없음)
  async function updateCopy(cardId: string, copy: CardCopy) {
    db.updateCard(cardId, { copy });
    const card = db.getCard(cardId)!;
    const cs = db.getCardSet(card.cardSetId)!;
    try {
      const r = await compose(cs, card);
      return db.updateCard(cardId, { outputPath: r.out, overflow: r.overflow, status: 'done' });
    } catch (e) {
      return db.updateCard(cardId, { status: 'failed', error: toApiError('카드', e).message });
    } finally { db.refreshCardSetStatus(cs.id); }
  }

  return { renderOne, renderSet, updateCopy, setPhoto, setMaskedPhoto, setPhotoFit, carryPhotos, compose, hints: copyHints };
}
