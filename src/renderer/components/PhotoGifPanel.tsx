// 사진 글의 움직이는 GIF: 사진 확인이 모두 끝나면 처리본으로 만들어 미리 보고, 네이버 넣기 때 함께 올림
// 사진을 고치면 옛 GIF는 메인에서 지움 (가리기 전 얼굴이 GIF에 남지 않게) → 여기서 다시 만들라고 안내
import { useState } from 'react';
import { assetUrl, call } from '../api';
import { useApp } from '../App';
import { makeGif } from '../photos/gif';
import { GIF_DELAYS } from '../../shared/gif';
import { Msg, useMsg } from './ui';
import type { PhotoState } from '../../shared/types';

export function PhotoGifPanel({ articleId, st, onState }: { articleId: string; st: PhotoState | null; onState: (s: PhotoState) => void }) {
  const { info } = useApp();
  const [delay, setDelay] = useState(100);
  const [at, setAt] = useState<'bottom' | 'top'>('bottom');
  const [work, setWork] = useState('');
  const msg = useMsg();
  if (!st) return null;
  const { gif, gifPlan } = st;
  const reload = async () => onState(await call<PhotoState>('photos:state', articleId));
  const curAt = gif?.at ?? at;

  const make = async () => {
    setWork('사진 읽는 중'); msg.clear();
    try {
      const bytes: Uint8Array[] = [];
      for (const id of gifPlan.ids) bytes.push(await call<Uint8Array>('photos:gifFrame', { articleId, id }));
      const r = await makeGif(bytes, delay, (done, total) => setWork(`GIF 만드는 중 (${done + 1}/${total})`));
      await call('photos:saveGif', { articleId, sig: gifPlan.sig, gif: r.bytes, at: curAt, delay, frames: gifPlan.ids.length, w: r.w, h: r.h });
      await reload();
    } catch (e) { msg.err(e); } finally { setWork(''); }
  };
  const act = async (fn: () => Promise<unknown>) => { msg.clear(); try { await fn(); await reload(); } catch (e) { msg.err(e); } };
  const chooseAt = (v: 'bottom' | 'top') => { setAt(v); if (gif) act(() => call('photos:gifAt', { articleId, at: v })); };

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>움직이는 사진 (GIF)</h2>
        {work && <span className="row"><span className="spinner" /><span className="hint">{work}</span></span>}
      </div>
      <p className="hint" style={{ margin: '6px 0 10px' }}>확인을 마친 사진을 모아 영상처럼 넘어가는 그림으로 만들어요. 얼굴을 가린 사진만 쓰고, AI로 보내지 않으며 비용이 없어요. 만들어 두면 네이버에 넣을 때 함께 올라가요.</p>
      {gifPlan.total < 2 && <p className="note info">사진이 2장 이상이어야 만들 수 있어요.</p>}
      {gifPlan.total >= 2 && !gifPlan.ready && <p className="note info">위에서 사진을 모두 확인하면 만들 수 있어요.</p>}
      {st.gifGone && !gif && <p className="note warn">사진이 바뀌어서 전에 만든 GIF를 지웠어요. 넣으려면 다시 만들어 주세요.</p>}
      {gifPlan.total > gifPlan.ids.length && gifPlan.ready && <p className="hint">사진이 {gifPlan.total}장이라 고르게 {gifPlan.ids.length}장만 넣어요.</p>}
      {gif && <img src={assetUrl(info.dataDir, gif.file, gif.hash)} alt="움직이는 사진 미리보기" style={{ display: 'block', maxWidth: 'min(480px, 100%)', borderRadius: 6, marginBottom: 10 }} />}
      {gif && <p className="hint" style={{ margin: '0 0 10px' }}>{gif.frames}장 · {gif.w}×{gif.h} · {(gif.bytes / 1024 / 1024).toFixed(1)}MB. 그림이 조금 거칠어 보일 수 있어요 (GIF는 256색까지예요). <b>안 가려진 얼굴이 없는지 끝까지 돌려 보고 넣어 주세요.</b></p>}
      {gifPlan.ready && gifPlan.total >= 2 && (
        <>
          <div className="row" style={{ marginBottom: 8 }}>
            <span className="hint">넘기는 속도</span>
            {GIF_DELAYS.map((d) => <button key={d.cs} className={`btn small ${delay === d.cs ? 'primary' : ''}`} disabled={!!work} onClick={() => setDelay(d.cs)}>{d.label}</button>)}
            {gif && gif.delay !== delay && <span className="hint">바꾼 속도는 다시 만들어야 적용돼요</span>}
          </div>
          <div className="row" style={{ marginBottom: 10 }}>
            <span className="hint">넣을 자리</span>
            <button className={`btn small ${curAt === 'bottom' ? 'primary' : ''}`} disabled={!!work} onClick={() => chooseAt('bottom')}>글 끝 (태그 앞)</button>
            <button className={`btn small ${curAt === 'top' ? 'primary' : ''}`} disabled={!!work} onClick={() => chooseAt('top')}>글 맨 위</button>
          </div>
          <div className="row">
            <button className="btn small primary" disabled={!!work} onClick={make}>{gif ? 'GIF 다시 만들기' : 'GIF 만들기'}</button>
            {gif && <button className="btn small" disabled={!!work} onClick={() => call('photos:saveGifAs', articleId).catch(msg.err)}>GIF 저장</button>}
            {gif && <button className="btn small" disabled={!!work} onClick={() => act(() => call('photos:removeGif', articleId))}>GIF 빼기</button>}
          </div>
        </>
      )}
      <Msg m={msg.m} />
    </div>
  );
}
