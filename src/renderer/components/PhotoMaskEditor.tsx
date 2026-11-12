// 카드 사진 얼굴 가리기 (태권 글뚝딱 2.6.3에서 옮김): 자동으로 찾은 곳을 모자이크로 미리 보여 주고, 드래그로 추가 · 눌러서 지운 뒤 적용
// 유치원판: 사진을 넣으면 이 창이 바로 열림. 찾은 얼굴은 모두 가린 채로 시작하고, 가릴 곳이 없으면 "얼굴 없는 사진이 맞아요"로 확인 (확인 전에는 네이버에 넣을 수 없음)
// 사진은 이 PC 안에서만 처리. 얼굴을 못 찾은 사진도 직접 가릴 수 있음. 이미 가린 사진은 찾지 않고 더 가리기만
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { call } from '../api';
import { decodePhoto, detectFaces, maskedCanvas, renderProcessed } from '../photos/face';
import { RegionBox } from './RegionBox';
import { Msg, useMsg } from './ui';
import type { PhotoRegion } from '../../shared/types';

export function PhotoMaskEditor({ cardId, masked, onClose, onSaved }: { cardId: string; masked: boolean; onClose: () => void; onSaved: (count: number) => void }) {
  const [img, setImg] = useState<ImageBitmap | null>(null);
  const [regions, setRegions] = useState<PhotoRegion[]>([]);
  const [finding, setFinding] = useState(!masked);
  const [saving, setSaving] = useState(false);
  const photoPath = useRef('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const msg = useMsg();

  useEffect(() => {
    let alive = true;
    let opened: ImageBitmap | null = null;
    const run = (async () => {
      const r = await call<{ photoPath: string; bytes: Uint8Array }>('cards:photoBytes', { cardId });
      opened = await decodePhoto(r.bytes);
      if (!alive) return;
      photoPath.current = r.photoPath;
      setImg(opened);
      if (masked) return;
      const found = await detectFaces(opened).catch(() => null);
      if (!alive) return;
      setFinding(false);
      if (!found) msg.warn('얼굴을 자동으로 찾지 못했어요. 얼굴이 있다면 드래그로 가려 주세요.');
      else {
        setRegions((prev) => [...found, ...prev]);
        if (!found.length) msg.warn('찾은 얼굴이 없어요. 얼굴이 있다면 드래그로 가려 주세요.');
      }
    })().catch((e) => { if (alive) { setFinding(false); msg.err(e); } });
    // 찾는 중에 닫아도 찾기가 끝난 뒤에 사진을 닫음
    return () => { alive = false; run.finally(() => opened?.close()); };
  }, []); // eslint-disable-line

  useEffect(() => {
    const c = canvas.current;
    if (!c || !img) return;
    const m = maskedCanvas(img, regions);
    c.width = m.width; c.height = m.height;
    c.getContext('2d')!.drawImage(m, 0, 0);
  }, [img, regions]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving, onClose]);

  const apply = async () => {
    if (!img) return;
    setSaving(true); msg.clear();
    try {
      await call('cards:maskPhoto', { cardId, photoPath: photoPath.current, jpeg: await renderProcessed(img, regions), w: img.width, h: img.height });
      onSaved(regions.length);
    } catch (e) { msg.err(e); setSaving(false); }
  };

  const scale = img ? Math.min(1, (window.innerWidth - 120) / img.width, (window.innerHeight - 280) / img.height) : 1;
  return createPortal(
    <div className="guide modal" role="dialog" aria-label="사진 얼굴 가리기">
      <div className="guide-card" style={{ width: 'fit-content', minWidth: 'min(560px, 100%)', padding: 18 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>{masked ? '더 가리기' : '얼굴 가리기'}</h2>
          {finding && <span className="row"><span className="spinner" /><span className="hint">얼굴 찾는 중 (30초쯤 걸려요)</span></span>}
        </div>
        <p className="hint" style={{ margin: '6px 0 10px', maxWidth: 640 }}>
          {masked ? '이미 가린 곳은 그대로예요. 더 가릴 곳을 드래그해 주세요.' : '찾은 얼굴은 모두 가려 두었어요. 빠진 얼굴 · 이름표 · 옷의 이름 글자는 드래그로 가리고, 잘못 가린 곳은 네모를 눌러 지워 주세요. 작은 얼굴 · 옆얼굴은 자동으로 놓칠 수 있으니 사진을 꼭 살펴봐 주세요.'} 적용한 뒤 되돌리려면 사진을 다시 넣어야 해요. 사진은 이 PC 안에서만 처리하고 AI로 보내지 않아요.
        </p>
        {img && (
          <RegionBox regions={regions} disabled={saving} onChange={setRegions}>
            <canvas ref={canvas} data-bg="1" style={{ display: 'block', width: img.width * scale, height: img.height * scale, borderRadius: 6 }} />
          </RegionBox>
        )}
        <Msg m={msg.m} />
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
          <span className="hint" style={{ marginRight: 'auto' }}>{masked ? '새로 가릴 곳' : '가림'} {regions.length}곳</span>
          <button className="btn small" disabled={saving} onClick={onClose}>{masked ? '취소' : '나중에 (확인 전에는 네이버에 넣을 수 없어요)'}</button>
          <button className="btn small primary" disabled={saving || finding || !img || (masked && !regions.length)} onClick={apply}>{saving ? '적용 중…' : !regions.length ? '얼굴 없는 사진이 맞아요' : '가리고 확인'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
