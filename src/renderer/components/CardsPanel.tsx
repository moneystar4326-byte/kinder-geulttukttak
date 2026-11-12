import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { assetUrl, call, local, type Card, type CardSet } from '../api';
import { Chips, Msg, useMsg } from './ui';
import { decodePhoto, detectFaces } from '../photos/face';
import { PhotoMaskEditor } from './PhotoMaskEditor';
import { fitPhoto, type PhotoFit } from '../../shared/cardPhotoFit';
import { SPLIT_IMAGE_RATIO } from '../../shared/cardRoles';
import { FirstTip } from '../guide/voice';
import { CARD_STYLES, type BriefPurpose, type CardMode, type CardSize, type CardStyle } from '../../shared/types';

export interface CardPref { style: CardStyle; size: CardSize; mode: CardMode }

import { cardNo, cardSlots, roleAt } from '../../shared/cardRoles';

function CardBox({ card, cs, articleId, busy, onChanged, kind, purpose, onPhotoWork }: { card: Card; cs: CardSet; articleId: string; busy: boolean; onChanged: () => void; kind?: string; purpose?: BriefPurpose; onPhotoWork: (d: number) => void }) {
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
  // 그림 칸을 사진으로 (태권 글뚝딱 2.6.x에서 옮김): 사진은 AI로 보내지 않고 이 PC에서 합치기만 함 (그림 비용 없음)
  // 유치원판: 넣으면 얼굴 가리기 창을 바로 열고(찾은 얼굴은 모두 가린 채로), 확인하기 전에는 네이버에 넣을 수 없음
  const [photoBusy, setPhotoBusy] = useState(false);
  // 사진을 맞추는 동안에는 묶음을 새로 만드는 버튼을 막음 (맞춤이 끊겨 얼굴이 잘린 채 남지 않게)
  const [maskOpen, setMaskOpen] = useState(false);
  const photoLocked = photoBusy || maskOpen;
  useEffect(() => { if (!photoLocked) return; onPhotoWork(1); return () => onPhotoWork(-1); }, [photoLocked]); // eslint-disable-line
  const pickPhoto = async () => {
    if (!local.get('card-photo-notice', false)) {
      if (!confirm('아이 얼굴이 나오는 사진은 학부모님께 게시 동의를 받은 사진만 넣어 주세요.\n사진은 AI로 보내지 않고 이 PC에서 카드에 합치기만 해요.\n넣은 뒤 얼굴 가리기 창이 열려요. 찾은 얼굴은 모두 가려 두니, 빠진 곳이 없는지 확인해 주세요. 확인하기 전에는 네이버에 넣을 수 없어요.\n사진 복사본은 앱 자료 폴더에 보관돼요. 글을 지우면 함께 지워지지만, 앱 백업 파일에는 남아요.\n\n사진을 고를까요?')) return;
      local.set('card-photo-notice', true);
    }
    setPhotoBusy(true); msg.clear();
    try {
      const r = await call<{ small: boolean; shortened: boolean; card: Card; bytes: Uint8Array | null } | null>('cards:pickPhoto', { cardId: card.id });
      if (r) {
        onChanged();
        const f = r.bytes && r.card.photoPath ? await fitToSlot(r.card.photoPath, r.bytes).catch(() => null) : null;
        onChanged();
        const warn = [
          r.shortened ? '사진을 넣으니 글자가 넘쳐서 작은 글씨를 짧게 줄였어요. 내용을 확인해 주세요.' : '',
          r.small ? '사진이 작아서 카드에서 흐리게 보일 수 있어요. 가로 1080픽셀 이상 사진을 권해요.' : '',
          !f ? '사진은 넣었지만 칸에 자동으로 맞추지 못해 가운데를 기준으로 잘렸어요. 얼굴이 잘렸다면 [다른 사진으로]로 다시 넣어 주세요.' : '',
          f?.facesFailed ? '얼굴을 찾지 못해 사진 크기만 보고 맞췄어요. 얼굴이 잘렸는지 확인해 주세요.' : '',
        ].filter(Boolean).join(' ');
        if (warn) msg.warn(warn);
        else if (f?.whole) msg.info('얼굴이 잘리지 않게 사진 전체가 보이도록 맞췄어요. 빈 곳은 같은 사진을 흐리게 채웠어요.');
        if (r.card.photoPath) setMaskOpen(true); // 유치원판: 얼굴 가림 확인을 바로
      }
    } catch (e) { msg.err(e); } finally { setPhotoBusy(false); }
  };
  // 사진 크기와 얼굴 위치를 찾아 칸에 맞춤. 얼굴을 못 찾아도 크기만으로 맞추고, 실패해도 넣은 사진은 그대로
  const fitToSlot = async (photoPath: string, bytes: Uint8Array) => {
    const img = await decodePhoto(bytes);
    try {
      let facesFailed = false;
      const faces = await detectFaces(img, true).catch(() => { facesFailed = true; return []; });
      const fit: PhotoFit = { w: img.width, h: img.height, faces: faces.map((f) => ({ x: f.x, y: f.y, w: f.w, h: f.h, score: f.score })) };
      await call('cards:setPhotoFit', { cardId: card.id, photoPath, fit });
      const h = Math.round((cs.style.size === '1080x1080' ? 1080 : 1350) * SPLIT_IMAGE_RATIO[cs.style.size]);
      return { whole: fitPhoto(fit, 1080, h, 40).whole, facesFailed };
    } finally { img.close(); }
  };
  const clearPhoto = async () => {
    setPhotoBusy(true); msg.clear();
    try {
      const c = await call<Card>('cards:clearPhoto', { cardId: card.id });
      onChanged();
      if (cs.style.mode === 'ai' && !c.backgroundPath) msg.info('이 카드에는 돌아갈 AI 그림이 없어 기본 모양으로 바꿨어요. AI 그림이 필요하면 [그림 다시]를 눌러 주세요 (그림 1장 비용).');
    } catch (e) { msg.err(e); } finally { setPhotoBusy(false); }
  };
  const no = cardNo(cs.cards.map((x) => x.index), card.index); // 2장 묶음이면 카드 1 · 2
  const src = assetUrl(info.dataDir, card.outputPath, `${card.status}-${card.copy.title}-${card.copy.sub}-${card.backgroundPath ?? ''}-${card.photoPath ?? ''}-${card.photoFit ? `${card.photoFit.w}.${card.photoFit.faces.length}.${card.photoFit.masked ? 1 : 0}` : ''}-${cs.style.style}-${cs.style.size}-${cs.style.mode}`);
  return (
    <div className="card">
      {card.status === 'done' && src ? <img src={src} alt={`카드 ${no}`} /> : (
        <div className="ph">{card.status === 'running' ? `카드 ${no}/${cs.cards.length} 생성 중…` : card.status === 'failed' ? `실패: ${card.error ?? ''}` : '대기 중'}</div>
      )}
      <div style={{ marginTop: 8 }}>
        {/* 2026-10-18 사용자: "설명이 부족하다" → 카드 역할 · 칸 이름 · 버튼마다 하는 일 */}
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>카드 {no} · {roleAt(kind, purpose, cs.cards.length, card.index).label}</div>
        {card.photoPath && !card.photoFit?.masked && <div className="note warn">이 카드 사진은 아직 얼굴 가림을 확인하지 않았어요. [얼굴 가리기]로 확인해야 네이버에 넣을 수 있어요.</div>}
        {card.overflow && <div className="note warn">글자가 카드 밖으로 넘쳐요. 아래 글을 조금 줄이고 [문구 적용]을 눌러 주세요.</div>}
        <div className="hint" style={{ fontWeight: 600 }}>큰 글씨 (카드 제목)</div>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        <small className={t > 28 || t < 10 ? 'badge warn' : 'hint'}>{t}자 · 10~28자가 보기 좋아요</small>
        <div className="hint" style={{ fontWeight: 600, marginTop: 6 }}>작은 글씨 (제목 아래 설명)</div>
        <textarea value={sub} onChange={(e) => setSub(e.target.value)} />
        <small className={s > 110 || s < 40 ? 'badge warn' : 'hint'}>{s}자 · 60~110자가 보기 좋아요</small>
        <div className="row" style={{ marginTop: 6 }}>
          <button className="btn small primary" disabled={!changed || busy} onClick={apply} title="고친 글을 카드에 다시 얹어요. 그림은 그대로라 비용이 없어요.">문구 적용</button>
          <button className="btn small" disabled={busy || suggesting} onClick={suggest} title="AI가 이 카드의 큰 글씨 · 작은 글씨를 새로 써서 칸에 넣어요. 그림은 그대로예요.">{suggesting ? '쓰는 중…' : '문구만 다시'}</button>
          {card.status === 'failed' && <button className="btn small" disabled={busy || photoBusy} onClick={() => redo(false)}>이 카드 다시</button>}
          <button className="btn small" disabled={busy || photoBusy} onClick={pickPhoto} title="그림 칸을 내 사진으로 바꿔요. JPG · PNG, 20MB까지. 그림 비용이 없어요.">{photoBusy ? '넣는 중…' : card.photoPath ? '다른 사진으로' : '사진으로 바꾸기'}</button>
          {card.photoPath && <button className="btn small" disabled={busy || photoBusy} onClick={clearPhoto} title="사진을 빼요. 전에 그린 그림이 있으면 그 그림으로, 없으면 기본 모양으로 돌아가요. 비용이 없어요.">사진 빼기</button>}
          {card.photoPath && <button className={`btn small ${card.photoFit?.masked ? '' : 'primary'}`} disabled={busy || photoBusy} onClick={() => { msg.clear(); setMaskOpen(true); }} title="사진을 크게 보며 얼굴을 모자이크로 가려요. 자동으로 찾은 곳을 고치고, 빠진 곳은 직접 가릴 수 있어요. PC 안에서 처리하고 비용이 없어요.">{card.photoFit?.masked ? '더 가리기' : '얼굴 가리기'}</button>}
          {cs.style.mode === 'ai' && !card.photoPath && <button className="btn small" disabled={busy || photoBusy} onClick={() => redo(true)} title="같은 장면으로 AI 그림만 새로 그려요. 그림 1장 비용이 들어요.">그림 다시</button>}
          {card.status === 'done' && card.outputPath && <button className="btn small" onClick={() => call('cards:saveAs', { file: card.outputPath }).catch((e) => msg.err(e))} title="이 카드 한 장을 원하는 폴더에 사진 파일로 저장해요.">PNG 저장</button>}
        </div>
        {suggested && changed && <div className="note info" style={{ margin: '6px 0 0' }}>새 문구를 칸에 넣었어요. 마음에 들면 [문구 적용], 아니면 [문구만 다시]를 한 번 더 누르거나 직접 고쳐 주세요.</div>}
        {!changed && <p className="hint" style={{ margin: '4px 0 0' }}>글을 고치면 [문구 적용]이 눌러져요.</p>}
        <Msg m={msg.m} />
      </div>
      {maskOpen && <PhotoMaskEditor cardId={card.id} masked={!!card.photoFit?.masked} onClose={() => setMaskOpen(false)} onSaved={(n) => { setMaskOpen(false); onChanged(); msg.info(n ? `${n}곳을 가렸어요. 카드를 확인해 주세요. 더 가릴 곳이 있으면 [더 가리기]를 눌러 주세요.` : '얼굴 없는 사진으로 확인했어요. 카드를 확인해 주세요.'); }} />}
    </div>
  );
}

export function CardsPanel({ articleId, cs, pref, setPref, busy, onChanged, hasVersion, kind, purpose, count }: { articleId: string; cs: CardSet | null; pref: CardPref; setPref: (p: CardPref) => void; busy: boolean; onChanged: () => void; hasVersion: boolean; kind?: string; purpose?: BriefPurpose; count: number }) {
  const { info } = useApp();
  const msg = useMsg();
  const [photoWork, setPhotoWork] = useState(0);
  const onPhotoWork = (d: number) => setPhotoWork((x) => x + d);
  // 장수: 글 설정 → [설정]의 기본 장수. 여기서 이 글만 바꿀 수 있어요 (태권 글뚝딱 2.4.0에서 옮김)
  const [n, setN] = useState(Math.min(3, Math.max(1, count)) as 1 | 2 | 3);
  useEffect(() => { setN(Math.min(3, Math.max(1, count)) as 1 | 2 | 3); }, [count]);
  const make = async () => {
    const slots = cardSlots(n);
    const kept = cs?.cards.filter((c) => c.photoPath && slots.includes(c.index)).length ?? 0;
    const lost = (cs?.cards.filter((c) => c.photoPath).length ?? 0) - kept;
    if (lost > 0 && !confirm(`사진을 넣은 카드 ${lost}장은 이번 장수에서 빠져요. 계속할까요?`)) return;
    if (pref.mode === 'ai' && n > kept && !confirm(`AI 그림 ${n - kept}장을 만들어요 (그림 비용 발생).${kept ? ` 사진을 넣은 ${kept}장은 사진을 그대로 써요.` : ''} 계속할까요?`)) return;
    try { await call('cards:plan', { articleId, style: pref, count: n }); onChanged(); } catch (e) { msg.err(e); }
  };
  const restyle = async () => {
    if (!cs) return;
    const needNew = pref.mode === 'ai' && (cs.style.mode !== 'ai' || cs.style.style !== pref.style);
    const draws = pref.mode === 'ai' ? cs.cards.filter((c) => !c.photoPath && (needNew || !c.backgroundPath)).length : 0; // 사진 카드는 그리지 않음
    if (draws > 0 && !confirm(`그림 ${draws}장을 새로 그려요 (그림 비용 발생). 계속할까요?`)) return;
    try { await call('cards:restyle', { articleId, cardSetId: cs.id, style: pref }); onChanged(); } catch (e) { msg.err(e); }
  };
  const failed = cs?.cards.filter((c) => c.status === 'failed').length ?? 0;
  return (
    <div className="panel">
      <div className="head" style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>카드뉴스 {cs ? cs.cards.length : n}장</h2>
        {cs && <span className="badge">{cs.style.style} · {cs.style.size} · {cs.style.mode === 'ai' ? 'AI 배경' : '템플릿'}</span>}
      </div>
      <div className="row" style={{ marginBottom: 10 }}>
        <Chips options={CARD_STYLES} value={pref.style} onChange={(v) => setPref({ ...pref, style: v })} />
        <Chips options={['1080x1350', '1080x1080'] as const} value={pref.size} onChange={(v) => setPref({ ...pref, size: v })} />
        <Chips options={['AI 배경', '템플릿'] as const} value={pref.mode === 'ai' ? 'AI 배경' : '템플릿'} onChange={(v) => setPref({ ...pref, mode: v === 'AI 배경' ? 'ai' : 'template' })} />
        <Chips options={['1장', '2장', '3장'] as const} value={`${n}장` as '1장'} onChange={(v) => setN(Number(v[0]) as 1 | 2 | 3)} />
      </div>
      {n < 3 && <p className="hint">{n === 1 ? '글 전체를 담은 요약 카드 1장을 만들어요.' : '첫 카드와 마지막 카드만 만들어요.'} 장수는 [문구부터 새로 만들기]부터 적용돼요.</p>}
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn primary" disabled={busy || photoWork > 0 || !hasVersion} onClick={make}>{cs ? `문구부터 새로 만들기 (${n}장)` : `카드 ${n}장 만들기`}</button>
        {cs && <button className="btn" disabled={busy || photoWork > 0} onClick={restyle}>이 문구로 스타일 · 크기만 바꾸기</button>}
        {failed > 0 && <button className="btn" disabled={busy || photoWork > 0} onClick={() => call('cards:renderFailed', { articleId, cardSetId: cs!.id }).then(onChanged).catch((e) => msg.err(e))}>실패한 {failed}장만 다시</button>}
      </div>
      <p className="hint">AI는 글자 없는 배경 그림만 그리고, 한글 문구 · 로고는 프로그램이 정확히 얹어요.</p>
      {cs && <FirstTip id="F02" />}
      {cs && (
        <div className="note info">
          <b>카드마다 있는 버튼</b>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18, lineHeight: 1.7 }}>
            <li><b>문구 적용</b> — 큰 글씨 · 작은 글씨를 고친 뒤 눌러요. 그림은 그대로 두고 글자만 다시 얹어요 (비용 없음)</li>
            <li><b>문구만 다시</b> — AI가 그 카드 글만 새로 써서 칸에 넣어 줘요. 보고 마음에 들면 [문구 적용] (글 비용만 아주 조금, 그림 비용 없음)</li>
            <li><b>사진으로 바꾸기</b> — 그림 칸만 내 사진으로 바꿔요. 얼굴이 잘리지 않게 칸에 자동으로 맞춰요. JPG · PNG, 20MB까지. 아이폰 사진(HEIC)은 JPG로 바꿔서 넣어요 (비용 없음, 사진은 AI로 보내지 않아요)</li>
            <li><b>얼굴 가리기</b> — 사진을 넣으면 바로 열려요. 찾은 얼굴은 모두 가려 두니, 빠진 곳은 드래그로 추가하고 잘못 가린 곳은 눌러서 지워요. 확인해야 네이버에 넣을 수 있어요 (비용 없음)</li>
            {cs.style.mode === 'ai' && <li><b>그림 다시</b> — 옷 · 손발 · 장면이 이상할 때 그 카드 그림만 새로 그려요 (<b>그림 1장 비용</b>)</li>}
            <li><b>PNG 저장</b> — 그 카드 한 장을 사진 파일로 저장해요 (인스타 · 단톡방용). 네이버 초안에는 따로 저장하지 않아도 자동으로 들어가요</li>
          </ul>
        </div>
      )}
      <Msg m={msg.m} />
      {cs && <div className="cards">{cs.cards.map((c) => <CardBox key={c.id} card={c} cs={cs} articleId={articleId} busy={busy} onChanged={onChanged} kind={kind} purpose={purpose} onPhotoWork={onPhotoWork} />)}</div>}
    </div>
  );
}
