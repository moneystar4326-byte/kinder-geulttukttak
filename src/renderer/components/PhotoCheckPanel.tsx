// 사진 글의 얼굴 확인 칸: 처리본을 크게 보여 주고, 빠진 얼굴을 드래그로 추가 · 잘못 가린 곳은 눌러서 지움
// 처리본은 미리보기와 네이버 입력이 같은 파일을 씀. 모두 확인해야 네이버 넣기 · 붙여넣기 도우미가 켜짐 (태권 글뚝딱 2.5.0 · 2.7.x에서 옮김)
// 유치원판: 찾은 얼굴은 모두 처음부터 가린 채로 보여 줌 (가림을 끄는 버튼은 없음 — 잘못 가린 곳만 하나씩 지움)
import { useCallback, useEffect, useRef, useState } from 'react';
import { assetUrl, call, local } from '../api';
import { useApp } from '../App';
import { decodePhoto, detectFaces, renderProcessed } from '../photos/face';
import { RegionBox } from './RegionBox';
import { Msg, useMsg } from './ui';
import type { PhotoCover } from '../../shared/photos';
import type { ArticleDoc, PhotoItem, PhotoRegion, PhotoState } from '../../shared/types';

export function PhotoCheckPanel({ articleId, doc, refresh, onState }: { articleId: string; doc?: ArticleDoc; refresh: string; onState: (s: PhotoState) => void }) {
  const { info } = useApp();
  const [st, setSt] = useState<PhotoState | null>(null);
  const [curId, setCurId] = useState('');
  const [work, setWork] = useState('');
  const [cover, setCover] = useState<PhotoCover>(() => local.get<PhotoCover>('photo-cover', 'animal'));
  const coverRef = useRef(cover);
  const processing = useRef(false);
  const msg = useMsg();

  const load = useCallback(async () => {
    const s = await call<PhotoState>('photos:state', articleId);
    setSt(s); onState(s);
    return s;
  }, [articleId]); // eslint-disable-line

  // 원본을 메모리로 읽어 처리 → 처리본만 저장
  const render = async (x: PhotoItem, regions: PhotoRegion[] | null) => {
    const img = await decodePhoto(await call<Uint8Array>('photos:source', { articleId, id: x.id }));
    try {
      const rs = regions ?? await detectFaces(img);
      const jpeg = await renderProcessed(img, rs, coverRef.current, x.idx);
      await call('photos:saveProcessed', { articleId, id: x.id, jpeg, regions: rs, faces: regions ? x.faces : rs.length });
    } finally { img.close(); }
  };
  const processPending = useCallback(async (s: PhotoState) => {
    if (processing.current) return;
    processing.current = true;
    try {
      const todo = s.items.filter((x) => x.status === 'pending' && !x.excluded);
      for (let i = 0; i < todo.length; i++) {
        setWork(`얼굴 찾는 중 (${i + 1}/${todo.length})`);
        try { await render(todo[i], null); } catch (e) {
          await call('photos:markFailed', { articleId, id: todo[i].id, error: e instanceof Error ? e.message : '사진을 처리하지 못했어요' });
        }
        await load();
      }
    } finally { processing.current = false; setWork(''); }
  }, [articleId, load]); // eslint-disable-line

  useEffect(() => { (async () => { await call('photos:verify', articleId); await processPending(await load()); })().catch(msg.err); }, [articleId]); // eslint-disable-line
  useEffect(() => { load().catch(() => {}); }, [refresh, load]);

  if (!st) return null;
  // 글 순서대로 보여 줌 (네이버에 들어가는 순서)
  const rank = new Map((doc?.sections ?? []).map((s, i) => [s.photoId, i]));
  const items = [...st.items].sort((a, b) => (rank.get(a.id) ?? 99 + a.idx) - (rank.get(b.id) ?? 99 + b.idx));
  const cur = items.find((x) => x.id === curId) ?? items.find((x) => !x.excluded && !x.confirmed) ?? items[0];
  const live = items.filter((x) => !x.excluded);
  const done = live.filter((x) => x.confirmed).length;
  const url = (x: PhotoItem) => assetUrl(info.dataDir, x.processedFile, x.processedHash);

  const change = async (regions: PhotoRegion[]) => {
    setWork('가림 반영 중'); msg.clear();
    try { await render(cur, regions); await load(); } catch (e) { msg.err(e); } finally { setWork(''); }
  };
  // 가림 모양을 바꾸면 처리가 끝난 사진을 모두 다시 그림 (모양이 바뀌었으니 다시 확인)
  const chooseCover = async (next: PhotoCover) => {
    if (next === cover) return;
    setCover(next); coverRef.current = next; local.set('photo-cover', next);
    setWork('가림 모양 바꾸는 중'); msg.clear();
    try {
      for (const x of st.items.filter((y) => y.status === 'ready' && !y.excluded)) await render(x, x.regions);
      await load();
    } catch (e) { msg.err(e); } finally { setWork(''); }
  };
  const act = async (fn: () => Promise<unknown>) => { msg.clear(); try { await fn(); await load(); } catch (e) { msg.err(e); } };
  const confirmCur = () => act(async () => {
    await call('photos:confirm', { articleId, id: cur.id, noFace: !cur.regions.length });
    const next = items.find((x) => !x.excluded && !x.confirmed && x.id !== cur.id);
    if (next) setCurId(next.id);
  });


  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>사진 확인 ({done}/{live.length})</h2>
        <span className="row">
          {work && <><span className="spinner" /><span className="hint">{work}</span></>}
          <button className="btn small" onClick={() => call('photos:openWork', articleId).catch(msg.err)}>처리본 폴더 열기</button>
        </span>
      </div>
      <p className="hint" style={{ margin: '6px 0 10px' }}>찾은 얼굴은 모두 가려 두었어요. 자동 감지는 옆얼굴 · 작은 얼굴 · 고개 숙인 얼굴을 놓칠 수 있어요. 사진을 키워 얼굴과 이름표 · 가방 · 옷에 적힌 이름까지 모두 가려졌는지 봐 주세요. 사진마다 확인해야 네이버에 넣을 수 있어요. 사진은 이 PC 안에서만 처리해요.</p>
      <div className="row" style={{ gap: 6, marginBottom: 8 }}>
        <span className="hint">얼굴 가리기</span>
        {(['animal', 'mosaic'] as const).map((k) => <button key={k} className={`btn small ${cover === k ? 'primary' : ''}`} disabled={!!work} onClick={() => chooseCover(k)}>{k === 'animal' ? '귀여운 동물' : '모자이크'}</button>)}
      </div>
      <div className="row" style={{ gap: 6, marginBottom: 10 }}>
        {items.map((x, i) => (
          <button key={x.id} className={`btn small ${x.id === cur?.id ? 'primary' : ''}`} onClick={() => setCurId(x.id)}>
            {x.excluded ? '뺌' : x.status === 'failed' ? '⚠' : x.confirmed ? '✓' : x.status === 'pending' ? '…' : ''} {i + 1}. {x.title}
          </button>
        ))}
      </div>
      {cur && (
        <>
          {cur.status === 'pending' && !cur.excluded && <p className="note info">얼굴을 찾고 있어요…</p>}
          {cur.status === 'failed' && !cur.excluded && (
            <div className="note err"><b>처리 실패:</b> {cur.error}
              <div className="row" style={{ marginTop: 8 }}><button className="btn small" disabled={!!work} onClick={() => act(async () => { await call('photos:retry', { articleId, id: cur.id }); await processPending(await load()); })}>다시 처리</button></div>
            </div>
          )}
          {cur.status === 'ready' && cur.processedFile && !cur.excluded && (
            <RegionBox regions={cur.regions} disabled={!!work} onChange={change}>
              <img data-bg="1" src={url(cur)} alt={`${cur.title} 처리본`} draggable={false} style={{ display: 'block', maxWidth: '100%', maxHeight: '70vh', borderRadius: 6 }} />
            </RegionBox>
          )}
          {cur.status === 'ready' && !cur.excluded && !cur.regions.length && <p className="note warn" style={{ marginTop: 8 }}>얼굴을 못 찾았어요. 얼굴이 있다면 드래그로 가려 주세요.</p>}
          {cur.excluded && <p className="note info">이 사진은 글에 넣지 않아요. 장면 글은 그대로 남아요.</p>}
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
            {cur.status === 'ready' && !cur.excluded && <span className="hint" style={{ marginRight: 'auto' }}>가림 {cur.regions.length}곳 · 드래그로 추가 · 네모를 눌러 지우기</span>}
            <button className="btn small" disabled={!!work} onClick={() => act(async () => { await call('photos:exclude', { articleId, id: cur.id, excluded: !cur.excluded }); if (cur.excluded) await processPending(await load()); })}>{cur.excluded ? '다시 넣기' : '이 사진 빼기'}</button>
            {cur.status === 'ready' && !cur.excluded && !cur.confirmed && <button className="btn small primary" disabled={!!work} onClick={confirmCur}>{cur.regions.length ? '확인하고 다음' : '얼굴 없는 사진이 맞아요'}</button>}
            {cur.confirmed && !cur.excluded && <span className="badge ok">확인함</span>}
          </div>
        </>
      )}
      <Msg m={msg.m} />
    </div>
  );
}
