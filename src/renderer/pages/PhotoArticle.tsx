// 사진으로 글쓰기 (태권 글뚝딱 2.5.0 · 2.7.10에서 옮김): 폴더 · 주제 한 줄 → [글 만들기] 한 번
// 유치원판: 사진은 이 PC 안에서만 다루고 AI에는 장면 칸 글자만 보냄. 얼굴은 글을 만든 뒤 사진 확인 칸에서 모두 가리고 확인해야 네이버에 넣을 수 있음
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../App';
import { call, local, type DojoProfile, type KeywordRow } from '../api';
import { Field, Msg, useMsg } from '../components/ui';
import { LockBanner } from '../components/Account';
import { thumbnail } from '../photos/face';
import { MAX_PHOTOS, suspectNames } from '../../shared/photos';
import { hintWords, pickKeywords } from '../../shared/keywords';
import { autoPrefix } from '../../shared/areas';
import { buildQuickInput } from '../../shared/quickInput';
import { APP } from '../../shared/kinder';
import { DIRECTOR, WriterPick } from './NewArticle';
import type { ScannedPhoto } from '../../shared/types';

const PROBLEM = { heic: 'HEIC 사진은 아직 못 읽어요. JPG로 바꿔 주세요.', copying: '복사 중이에요. 잠시 뒤 다시 읽을게요.', unreadable: '읽을 수 없는 파일이에요.' };
const dayOf = (p: ScannedPhoto) => p.takenAt.slice(0, 10);
const dayLabel = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

// 썸네일은 메모리에만 (가리지 않은 사진을 디스크에 남기지 않음)
const thumbs = new Map<string, Promise<string>>();
function Thumb({ p }: { p: ScannedPhoto }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let live = true;
    if (!thumbs.has(p.hash)) thumbs.set(p.hash, call<Uint8Array>('photos:bytes', p.path).then((b) => thumbnail(b)).catch((e) => { thumbs.delete(p.hash); throw e; }));
    thumbs.get(p.hash)!.then((s) => { if (live) setSrc(s); }).catch(() => {});
    return () => { live = false; };
  }, [p.hash, p.path]);
  return <span style={{ width: 72, height: 54, flex: 'none', borderRadius: 6, background: 'var(--bg)', border: '1px solid var(--line)', overflow: 'hidden', display: 'block' }}>{src && <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}</span>;
}

export function PhotoArticle() {
  const { info, go } = useApp();
  const [folder, setFolder] = useState<{ dir: string; exists: boolean } | null>(null);
  const [photos, setPhotos] = useState<ScannedPhoto[]>([]);
  const [topic, setTopic] = useState(local.get('photo-topic', ''));
  const [titles, setTitles] = useState<Record<string, string>>(local.get('photo-titles', {}));
  // 고른 사진 · 순서 · 확인은 다른 메뉴에 다녀와도 그대로 (태권 글뚝딱 2.7.10에서 옮김). 저장하는 것은 사진 해시뿐 (사진 · 썸네일은 저장하지 않음)
  const [picked, setPicked] = useState<string[]>(() => local.get('photo-picked', [])); // 고른 사진 해시 (이 순서로 글을 씀)
  const [off, setOff] = useState<Set<string>>(() => new Set(local.get<string[]>('photo-off', []))); // 사용자가 직접 해제한 사진 (다시 읽어도 자동 선택하지 않음)
  const [namesOk, setNamesOk] = useState<string[]>(() => local.get('photo-names-ok', []));
  const [mixFor, setMixFor] = useState(() => local.get('photo-mix-for', '')); // [같이 쓰기]를 누른 날짜 묶음. 고른 날짜가 바뀌면 다시 물음
  const [busy, setBusy] = useState('');
  const [profile, setProfile] = useState<DojoProfile | null>(null);
  const msg = useMsg();
  const offRef = useRef(off); offRef.current = off;
  // 글쓴이: 새 글 작성과 같은 값을 씀 (이 PC에 기억)
  const writers = profile?.writers ?? [];
  const [writerId, setWriterIdState] = useState(local.get('writer-id', ''));
  const [writerSign, setWriterSignState] = useState(local.get('writer-sign', false));
  const setWriterId = (id: string) => { setWriterIdState(id); local.set('writer-id', id); };
  const setWriterSign = (v: boolean) => { setWriterSignState(v); local.set('writer-sign', v); };
  const writer = writers.find((w) => w.id === writerId) ?? writers.find((w) => w.role === '원장') ?? DIRECTOR;

  const scan = useCallback(async () => {
    const f = await call<{ dir: string; exists: boolean }>('photos:folder');
    setFolder(f);
    if (!f.exists) { setPhotos([]); return; }
    const list = await call<ScannedPhoto[]>('photos:scan');
    setPhotos(list);
    // 안 쓴 사진은 모두 자동 선택 (최대 장수까지). 이미 고른 순서는 유지
    setPicked((cur) => {
      const ok = list.filter((p) => p.hash && !p.problem);
      const have = new Set(ok.map((p) => p.hash));
      const next = cur.filter((h) => have.has(h));
      for (const p of ok) if (!p.used && !next.includes(p.hash) && !offRef.current.has(p.hash) && next.length < MAX_PHOTOS) next.push(p.hash);
      return next;
    });
  }, []);

  useEffect(() => { call<DojoProfile | null>('profile:get').then(setProfile); scan().catch(msg.err); }, []); // eslint-disable-line
  // 사진을 넣고 창으로 돌아오면 다시 읽음. 복사 중인 파일이 있으면 잠시 뒤 또 읽음
  useEffect(() => {
    const h = () => scan().catch(() => {});
    window.addEventListener('focus', h);
    return () => window.removeEventListener('focus', h);
  }, [scan]);
  useEffect(() => {
    if (!photos.some((p) => p.problem === 'copying')) return;
    const t = setTimeout(() => scan().catch(() => {}), 3000);
    return () => clearTimeout(t);
  }, [photos, scan]);
  useEffect(() => { local.set('photo-topic', topic); }, [topic]);
  useEffect(() => { local.set('photo-titles', titles); }, [titles]);
  useEffect(() => { local.set('photo-picked', picked); }, [picked]);
  useEffect(() => { local.set('photo-off', [...off]); }, [off]);
  useEffect(() => { local.set('photo-names-ok', namesOk); }, [namesOk]);
  useEffect(() => { local.set('photo-mix-for', mixFor); }, [mixFor]);

  const byHash = useMemo(() => new Map(photos.filter((p) => p.hash).map((p) => [p.hash, p])), [photos]);
  const selected = picked.map((h) => byHash.get(h)).filter(Boolean) as ScannedPhoto[];
  const titleOf = (p: ScannedPhoto) => titles[p.hash] ?? (p.needsTitle ? '' : p.title);
  const unused = photos.filter((p) => p.hash && !p.problem && !p.used && !picked.includes(p.hash));
  const usedList = photos.filter((p) => p.hash && !p.problem && p.used && !picked.includes(p.hash));
  const problems = photos.filter((p) => p.problem);

  const days = [...new Set(selected.map(dayOf))].sort();
  const mixOk = mixFor === days.join(',');
  const setMixOk = (on: boolean) => setMixFor(on ? days.join(',') : '');
  const mixed = days.length > 1 && !mixOk;
  const noTitle = selected.filter((p) => !titleOf(p).trim());
  const names = [...new Set([...suspectNames(topic), ...selected.flatMap((p) => suspectNames(titleOf(p)))])].filter((n) => !namesOk.includes(n));
  const canStart = !busy && !!profile && !!info.secrets.openai && !!topic.trim() && selected.length > 0 && !mixed && !noTitle.length && !names.length;

  const toggle = (h: string, on: boolean) => {
    setOff((s) => { const n = new Set(s); if (on) n.delete(h); else n.add(h); return n; });
    setPicked((c) => (on ? (c.includes(h) || c.length >= MAX_PHOTOS ? c : [...c, h]) : c.filter((x) => x !== h)));
  };
  const move = (i: number, d: -1 | 1) => setPicked((c) => { const n = [...c]; const j = i + d; if (j < 0 || j >= n.length) return c; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const onlyDay = (d: string) => { const drop = selected.filter((p) => dayOf(p) !== d).map((p) => p.hash); setOff((s) => new Set([...s, ...drop])); setPicked((c) => c.filter((h) => !drop.includes(h))); };

  async function start() {
    setBusy('글을 준비하고 있어요'); msg.clear();
    try {
      const memo = topic.trim();
      let main = '', subs: string[] = [], chosen: KeywordRow[] = [];
      if (info.secrets.naverApiKey && info.secrets.naverSecret && info.secrets.naverCustomer) {
        try {
          const r = await call<{ rows: KeywordRow[] }>('keywords:naver', hintWords(memo, profile?.region ?? ''));
          const pick = pickKeywords(r.rows, memo, profile?.region ?? '', profile);
          if (pick.main) { main = pick.main; subs = pick.subs; chosen = r.rows.filter((x) => x.keyword === pick.main || pick.subs.includes(x.keyword)); }
        } catch { /* 키워드 조회가 안 돼도 글은 만듦 */ }
      }
      const titlePrefix = autoPrefix(profile?.region ?? '', profile?.nearbyAreas ?? [], (await call<unknown[]>('article:list').catch(() => [])).length);
      const input = { ...buildQuickInput({ memo, profile, main, subs, withCards: false, titlePrefix, writer, writerSign }), topic: memo.slice(0, 200) };
      const art = await call<{ id: string }>('photos:create', { input, keywords: chosen, photos: selected.map((p) => ({ path: p.path, title: titleOf(p).trim() })) });
      try { await call('article:generate', art.id); } catch (e) { await call('article:delete', art.id).catch(() => {}); throw e; }
      for (const k of ['photo-topic', 'photo-titles', 'photo-picked', 'photo-off', 'photo-names-ok', 'photo-mix-for']) local.del(k); // 글을 만들면 다음 글은 새로 시작 (이름 확인이 다음 글로 넘어가지 않게)
      go({ page: 'article', id: art.id });
    } catch (e) { msg.err(e); setBusy(''); }
  }

  const row = (p: ScannedPhoto, i: number | null) => (
    <div className="list-row" key={p.hash} style={{ alignItems: 'center', gap: 10 }}>
      <input type="checkbox" aria-label={`${p.name} 고르기`} checked={i !== null} disabled={i === null && picked.length >= MAX_PHOTOS} onChange={(e) => toggle(p.hash, e.target.checked)} />
      <Thumb p={p} />
      <div className="t" style={{ flex: 1, minWidth: 0 }}>
        <input type="text" value={titleOf(p)} maxLength={100} placeholder="찍을 때 있었던 일 (예: 바깥놀이 때 낙엽을 모아 왕관을 만들었어요)" onChange={(e) => setTitles({ ...titles, [p.hash]: e.target.value })} style={i !== null && !titleOf(p).trim() ? { borderColor: 'var(--warn)' } : undefined} />
        <span className="hint">{p.name}{p.takenAt ? ` · ${dayLabel(p.takenAt)}` : ''}</span>
      </div>
      {i !== null && <span className="row" style={{ flexWrap: 'nowrap', gap: 4 }}>
        <button className="btn small" disabled={i === 0} aria-label="위로" onClick={() => move(i, -1)}>▲</button>
        <button className="btn small" disabled={i === picked.length - 1} aria-label="아래로" onClick={() => move(i, 1)}>▼</button>
      </span>}
    </div>
  );

  return (
    <>
      <div className="head"><h1>사진으로 글쓰기</h1></div>
      <LockBanner />
      {!info.secrets.openai && <div className="note warn">AI 연결(OpenAI 키)이 아직 안 됐어요. 연결해야 글을 만들 수 있어요. <button className="btn link" onClick={() => go({ page: 'settings' })}>설정 열기</button></div>}
      {!profile && <div className="note warn">{APP.place} 정보를 먼저 저장해 주세요. <button className="btn link" onClick={() => go({ page: 'profile' })}>{APP.place} 정보 열기</button></div>}
      <div className="panel">
        <p className="hint" style={{ marginBottom: 12 }}>사진 파일 이름을 장면으로 적어 폴더에 넣어 주세요. 예: <b>01_낙엽으로 왕관 만들기.jpg</b> · 파일 이름과 장면 칸에 아이 이름은 쓰지 마세요.</p>
        <div className="note info" style={{ marginBottom: 12 }}><b>아이 사진은 이렇게 다뤄요.</b> 사진은 이 PC 안에서만 읽고, AI(OpenAI)에는 <b>주제와 장면 칸 글자만</b> 보내요. 사진은 보내지 않아요. 글을 만든 뒤 찾은 얼굴을 모두 가리고, 사진마다 {APP.owner} · 선생님이 확인해야 네이버에 넣을 수 있어요. 원본 사진 폴더에는 아무것도 만들거나 바꾸지 않아요.</div>
        {profile && <WriterPick writers={writers} value={writer} onChange={(w) => setWriterId(w.id)} sign={writerSign} onSign={setWriterSign} />}
        <Field label="사진 폴더">
          <div className="row">
            <input className="grow" type="text" readOnly value={folder?.dir ?? ''} placeholder="아직 폴더를 고르지 않았어요" />
            <button className="btn small" onClick={async () => { try { if (await call('photos:pickFolder')) await scan(); } catch (e) { msg.err(e); } }}>{folder?.dir ? '바꾸기' : '폴더 고르기'}</button>
            <button className="btn small" disabled={!folder?.dir} onClick={() => scan().catch(msg.err)}>새로고침</button>
          </div>
          {folder?.dir && !folder.exists && <p className="note warn" style={{ marginTop: 8 }}>폴더를 찾지 못했어요. 옮겼다면 [바꾸기]로 다시 골라 주세요.</p>}
        </Field>
        <Field label="주제 한 줄" req>
          <input type="text" value={topic} maxLength={200} onChange={(e) => setTopic(e.target.value)} placeholder="예: 7세반 친구들이 바깥놀이터에서 낙엽 놀이를 했어요" />
        </Field>
      </div>

      <div className="panel">
        <h2>이번 글에 넣을 사진 {selected.length}장 <span className="hint">(최대 {MAX_PHOTOS}장)</span></h2>
        {!selected.length && <p className="muted">{folder?.dir ? '넣을 새 사진이 없어요. 폴더에 사진을 넣으면 여기에 나와요.' : '먼저 사진 폴더를 골라 주세요.'}</p>}
        {selected.map((p, i) => row(p, i))}
        {unused.length > 0 && <><h3 style={{ marginTop: 12 }}>고르지 않은 사진 {unused.length}장</h3>{unused.map((p) => row(p, null))}</>}
        {usedList.length > 0 && <details style={{ marginTop: 12 }}><summary className="hint">이미 쓴 사진 {usedList.length}장</summary>{usedList.map((p) => row(p, null))}</details>}
        {problems.length > 0 && <ul className="flags" style={{ marginTop: 12 }}>{problems.map((p) => <li key={p.path}><span className="badge warn">확인</span> {p.name}: {PROBLEM[p.problem!]}</li>)}</ul>}
      </div>

      {days.length > 1 && !mixOk && (
        <div className="note warn">
          찍은 날짜가 섞여 있어요: {days.map((d) => `${dayLabel(d)} ${selected.filter((p) => dayOf(p) === d).length}장`).join(' · ')}
          <div className="row" style={{ marginTop: 8 }}>
            {days.map((d) => <button key={d} className="btn small" onClick={() => onlyDay(d)}>{dayLabel(d)} 사진만 쓰기</button>)}
            <button className="btn small" onClick={() => setMixOk(true)}>같이 쓰기</button>
          </div>
        </div>
      )}
      {names.length > 0 && (
        <div className="note warn">
          아이 이름으로 보이는 말이 있어요. 고치거나, 이름이 아니면 눌러 주세요.
          <div className="row" style={{ marginTop: 8 }}>{names.map((n) => <button key={n} className="btn small" onClick={() => setNamesOk([...namesOk, n])}>"{n}" 이름 아님</button>)}</div>
        </div>
      )}
      {noTitle.length > 0 && <div className="note warn">장면을 적지 않은 사진이 {noTitle.length}장 있어요. 한 줄 적거나 체크를 풀어 주세요.</div>}
      <Msg m={msg.m} />
      <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 12 }}>
        {busy && <span className="hint">{busy}…</span>}
        <button className="btn primary" disabled={!canStart} onClick={start}>글 만들기</button>
      </div>
      <p className="hint">사진 속 아이가 나오는 글을 올리기 전에 학부모님께 게시 동의를 받았는지 확인해 주세요. 얼굴을 가려도 옷 · 이름표 · 가방 글자로 아이를 알아볼 수 있으니 사진 확인 칸에서 함께 봐 주세요.</p>
    </>
  );
}
