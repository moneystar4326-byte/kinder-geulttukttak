import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { assetUrl, call, type Card, type CardSet } from '../api';
import { Chips, Msg, useMsg } from './ui';
import { FirstTip } from '../guide/voice';
import { CARD_STYLES, type CardMode, type CardSize, type CardStyle } from '../../shared/types';

export interface CardPref { style: CardStyle; size: CardSize; mode: CardMode }

import { cardRoles } from '../../shared/cardRoles';
import { isDaycare } from '../../shared/industry';

function CardBox({ card, cs, articleId, busy, onChanged, kind }: { card: Card; cs: CardSet; articleId: string; busy: boolean; onChanged: () => void; kind?: string }) {
  const { info } = useApp();
  const [title, setTitle] = useState(card.copy.title);
  const [sub, setSub] = useState(card.copy.sub);
  const msg = useMsg();
  useEffect(() => { setTitle(card.copy.title); setSub(card.copy.sub); }, [card.copy.title, card.copy.sub]);
  const changed = title !== card.copy.title || sub !== card.copy.sub;
  const t = [...title].length, s = [...sub].length;
  const apply = async () => { try { await call('cards:updateCopy', { cardId: card.id, copy: { ...card.copy, title, sub } }); onChanged(); msg.clear(); } catch (e) { msg.err(e); } };
  // 문구만 AI로 새로 (칸에만 넣음 — 저장은 [문구 적용], 그림 비용 없음)
  const [suggesting, setSuggesting] = useState(false);
  const [suggested, setSuggested] = useState(false);
  const suggest = async () => {
    setSuggesting(true); msg.clear();
    try { const r = await call<{ title: string; sub: string }>('cards:suggestCopy', { cardId: card.id }); setTitle(r.title); setSub(r.sub); setSuggested(true); } catch (e) { msg.err(e); } finally { setSuggesting(false); }
  };
  useEffect(() => { if (!changed) setSuggested(false); }, [changed]);
  const redo = async (newBackground: boolean) => {
    if (newBackground && cs.style.mode === 'ai' && !confirm('그림을 새로 그려요 (그림 1장 비용 발생). 계속할까요?')) return;
    try { await call('cards:renderOne', { articleId, cardId: card.id, newBackground }); onChanged(); } catch (e) { msg.err(e); }
  };
  const src = assetUrl(info.dataDir, card.outputPath, `${card.status}-${card.copy.title}-${card.copy.sub}-${card.backgroundPath ?? ''}-${cs.style.style}-${cs.style.size}-${cs.style.mode}`);
  return (
    <div className="card">
      {card.status === 'done' && src ? <img src={src} alt={`카드 ${card.index + 1}`} /> : (
        <div className="ph">{card.status === 'running' ? `카드 ${card.index + 1}/3 생성 중…` : card.status === 'failed' ? `실패: ${card.error ?? ''}` : '대기 중'}</div>
      )}
      <div style={{ marginTop: 8 }}>
        {/* 2026-10-18 사용자: "설명이 부족하다" → 카드 역할 · 칸 이름 · 버튼마다 하는 일 */}
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>카드 {card.index + 1} · {cardRoles(kind)[card.index]?.label ?? ''}</div>
        {card.overflow && <div className="note warn">글자가 카드 밖으로 넘쳐요. 아래 글을 조금 줄이고 [문구 적용]을 눌러 주세요.</div>}
        <div className="hint" style={{ fontWeight: 600 }}>큰 글씨 (카드 제목)</div>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        <small className={t > 28 || t < 10 ? 'badge warn' : 'hint'}>{t}자 · 10~28자가 보기 좋아요</small>
        <div className="hint" style={{ fontWeight: 600, marginTop: 6 }}>작은 글씨 (제목 아래 설명)</div>
        <textarea value={sub} onChange={(e) => setSub(e.target.value)} />
        <small className={s > 80 || s < 30 ? 'badge warn' : 'hint'}>{s}자 · 30~80자가 보기 좋아요</small>
        <div className="row" style={{ marginTop: 6 }}>
          <button className="btn small primary" disabled={!changed || busy} onClick={apply} title="고친 글을 카드에 다시 얹어요. 그림은 그대로라 비용이 없어요.">문구 적용</button>
          <button className="btn small" disabled={busy || suggesting} onClick={suggest} title="AI가 이 카드의 큰 글씨 · 작은 글씨를 새로 써서 칸에 넣어요. 그림은 그대로예요.">{suggesting ? '쓰는 중…' : '문구만 다시'}</button>
          {card.status === 'failed' && <button className="btn small" disabled={busy} onClick={() => redo(false)}>이 카드 다시</button>}
          {cs.style.mode === 'ai' && <button className="btn small" disabled={busy} onClick={() => redo(true)} title="같은 장면으로 AI 그림만 새로 그려요. 그림 1장 비용이 들어요.">그림 다시</button>}
          {card.status === 'done' && card.outputPath && <button className="btn small" onClick={() => call('cards:saveAs', { file: card.outputPath }).catch((e) => msg.err(e))} title="이 카드 한 장을 원하는 폴더에 사진 파일로 저장해요.">PNG 저장</button>}
        </div>
        {suggested && changed && <div className="note info" style={{ margin: '6px 0 0' }}>새 문구를 칸에 넣었어요. 마음에 들면 [문구 적용], 아니면 [문구만 다시]를 한 번 더 누르거나 직접 고쳐 주세요.</div>}
        {!changed && <p className="hint" style={{ margin: '4px 0 0' }}>글을 고치면 [문구 적용]이 눌러져요.</p>}
        <Msg m={msg.m} />
      </div>
    </div>
  );
}

export function CardsPanel({ articleId, cs, pref, setPref, busy, onChanged, hasVersion, kind }: { articleId: string; cs: CardSet | null; pref: CardPref; setPref: (p: CardPref) => void; busy: boolean; onChanged: () => void; hasVersion: boolean; kind?: string }) {
  const { info } = useApp();
  const msg = useMsg();
  const make = async () => {
    if (pref.mode === 'ai' && !confirm('AI 그림 3장을 만들어요 (그림 비용 발생). 계속할까요?')) return;
    try { await call('cards:plan', { articleId, style: pref }); onChanged(); } catch (e) { msg.err(e); }
  };
  const restyle = async () => {
    if (!cs) return;
    const needNew = pref.mode === 'ai' && (cs.style.mode !== 'ai' || cs.style.style !== pref.style);
    if (needNew && !confirm('스타일이 바뀌어 그림 3장을 새로 그려요 (그림 비용 발생). 계속할까요?')) return;
    try { await call('cards:restyle', { articleId, cardSetId: cs.id, style: pref }); onChanged(); } catch (e) { msg.err(e); }
  };
  const failed = cs?.cards.filter((c) => c.status === 'failed').length ?? 0;
  return (
    <div className="panel">
      <div className="head" style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>카드뉴스 3장</h2>
        {cs && <span className="badge">{cs.style.style} · {cs.style.size} · {cs.style.mode === 'ai' ? 'AI 배경' : '템플릿'}</span>}
      </div>
      <div className="row" style={{ marginBottom: 10 }}>
        <Chips options={CARD_STYLES} value={pref.style} onChange={(v) => setPref({ ...pref, style: v })} />
        <Chips options={['1080x1350', '1080x1080'] as const} value={pref.size} onChange={(v) => setPref({ ...pref, size: v })} />
        <Chips options={['AI 배경', '템플릿'] as const} value={pref.mode === 'ai' ? 'AI 배경' : '템플릿'} onChange={(v) => setPref({ ...pref, mode: v === 'AI 배경' ? 'ai' : 'template' })} />
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn primary" disabled={busy || !hasVersion} onClick={make}>{cs ? '문구부터 새로 만들기' : '카드 3장 만들기'}</button>
        {cs && <button className="btn" disabled={busy} onClick={restyle}>이 문구로 스타일 · 크기만 바꾸기</button>}
        {failed > 0 && <button className="btn" disabled={busy} onClick={() => call('cards:renderFailed', { articleId, cardSetId: cs!.id }).then(onChanged).catch((e) => msg.err(e))}>실패한 {failed}장만 다시</button>}
      </div>
      <p className="hint">AI는 글자 없는 배경 그림만 그리고, 한글 문구 · 로고는 프로그램이 정확히 얹어요.</p>
      {cs && <FirstTip id="F02" />}
      {cs && (
        <div className="note info">
          <b>카드마다 있는 버튼</b>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18, lineHeight: 1.7 }}>
            <li><b>문구 적용</b> — 큰 글씨 · 작은 글씨를 고친 뒤 눌러요. 그림은 그대로 두고 글자만 다시 얹어요 (비용 없음)</li>
            <li><b>문구만 다시</b> — AI가 그 카드 글만 새로 써서 칸에 넣어 줘요. 보고 마음에 들면 [문구 적용] (글 비용만 아주 조금, 그림 비용 없음)</li>
            {cs.style.mode === 'ai' && <li><b>그림 다시</b> — {isDaycare ? '옷 · 손발 · 장면이 이상할 때' : '도복 · 띠 · 손발이 이상할 때'} 그 카드 그림만 새로 그려요 (<b>그림 1장 비용</b>)</li>}
            <li><b>PNG 저장</b> — 그 카드 한 장을 사진 파일로 저장해요 (인스타 · 단톡방용). 네이버 초안에는 따로 저장하지 않아도 자동으로 들어가요</li>
          </ul>
        </div>
      )}
      <Msg m={msg.m} />
      {cs && <div className="cards">{cs.cards.map((c) => <CardBox key={c.id} card={c} cs={cs} articleId={articleId} busy={busy} onChanged={onChanged} kind={kind} />)}</div>}
    </div>
  );
}
