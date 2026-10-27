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
      copy: card.copy, index: card.index, style: cs.style.style, size: cs.style.size,
      brand: prof?.brand ?? APP.brand, dojoName: prof?.name ?? '',
      logoFile: prof?.logoPath && fs.existsSync(prof.logoPath) ? prof.logoPath : undefined, logoScale: prof?.logoScale,
      backgroundFile: card.backgroundPath && fs.existsSync(card.backgroundPath) ? card.backgroundPath : undefined,
      fontDir: deps.fontDir,
    });
    const m = await deps.shooter.shoot(html, w, h, out);
    // 재편집용 층 정보 (배경 · 문구 · 로고 따로)
    fs.writeFileSync(path.join(dir, 'layers.json'), JSON.stringify({ copy: card.copy, style: cs.style, background: card.backgroundPath ?? 'template', logo: prof?.logoPath ?? null, measure: m }, null, 2), 'utf-8');
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
      if (cs.style.mode === 'ai' && (opts.newBackground || !card.backgroundPath || !fs.existsSync(card.backgroundPath))) {
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

  // 3장 차례로. 성공한 장은 건너뜀 (실패한 장만 다시)
  async function renderSet(cardSetId: string, opts: { onStep?: (s: string) => void; signal?: AbortSignal; onlyFailed?: boolean } = {}) {
    const cs = db.getCardSet(cardSetId)!;
    for (const c of cs.cards) {
      if (opts.signal?.aborted) break;
      if (opts.onlyFailed && c.status === 'done') continue;
      opts.onStep?.(`카드 ${c.index + 1}/3 생성 중`);
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

  return { renderOne, renderSet, updateCopy, compose, hints: copyHints };
}
