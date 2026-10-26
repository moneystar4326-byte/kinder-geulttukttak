// 태권 글뚝딱 휴대폰판 (1주차): 새 글(말로 메모) · 완성 글(복사 · 블로그로 보내기) · 지난 글 · 도장 정보 · 설정
// 카드뉴스 3장 · 계정 연결(이용권) · 전담 비서는 2~3주차. 그 전까지는 대표님 시험용 APK로만 씀
import { useEffect, useRef, useState } from 'react';
import { Clipboard } from '@capacitor/clipboard';
import { Share } from '@capacitor/share';
import { AUDIENCES, type DojoProfile } from '../../src/shared/types';
import { buildQuickInput } from '../../src/shared/quickInput';
import { autoPrefix } from '../../src/shared/areas';
import { plainBody } from '../../src/shared/validation';
import { articleStore, blankProfile, profileStore, secrets, type MobileArticle } from './store';
import { listen, makeArticle, testKey } from './engine';

type Tab = 'new' | 'list' | 'profile' | 'settings';
type View = { tab: Tab; article?: string };

export function App() {
  const [view, setView] = useState<View>({ tab: 'new' });
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<DojoProfile | null>(profileStore.get());
  useEffect(() => { secrets.get('openai').then((k) => setHasKey(!!k)); }, [view.tab]);

  const go = (v: View) => { setView(v); window.scrollTo(0, 0); };
  return (
    <div className="app">
      <header className="top"><span className="logo" aria-hidden="true" /><b>태권 글뚝딱</b><span className="ver">휴대폰 시험판</span></header>
      <main className="body">
        {view.article ? <ArticleView id={view.article} back={() => go({ tab: 'list' })} /> :
          view.tab === 'new' ? <NewPost profile={profile} hasKey={hasKey} go={go} /> :
          view.tab === 'list' ? <List open={(id) => go({ tab: 'list', article: id })} /> :
          view.tab === 'profile' ? <Profile value={profile} onSave={(p) => { profileStore.save(p); setProfile(p); go({ tab: 'new' }); }} /> :
          <Settings hasKey={!!hasKey} onChange={() => secrets.get('openai').then((k) => setHasKey(!!k))} />}
      </main>
      <nav className="tabs" aria-label="메뉴">
        {([['new', '새 글'], ['list', '지난 글'], ['profile', '도장 정보'], ['settings', '설정']] as const).map(([t, l]) => (
          <button key={t} type="button" className={view.tab === t && !view.article ? 'on' : ''} onClick={() => go({ tab: t })}>{l}</button>
        ))}
      </nav>
    </div>
  );
}

function NewPost({ profile, hasKey, go }: { profile: DojoProfile | null; hasKey: boolean | null; go: (v: View) => void }) {
  const [memo, setMemo] = useState(() => localStorage.getItem('gtd-memo') ?? '');
  const [prefix, setPrefix] = useState(true);
  const [step, setStep] = useState('');
  const [err, setErr] = useState('');
  const stop = useRef<AbortController | null>(null);
  useEffect(() => { localStorage.setItem('gtd-memo', memo); }, [memo]);

  async function start() {
    if (!profile) return;
    setErr(''); setStep('시작하는 중');
    stop.current = new AbortController();
    try {
      const titlePrefix = prefix ? autoPrefix(profile.region, profile.nearbyAreas ?? [], articleStore.list().length) : '';
      const input = buildQuickInput({ memo, profile, withCards: false, titlePrefix });
      const id = await makeArticle(input, profile, setStep, stop.current.signal);
      localStorage.removeItem('gtd-memo'); setMemo('');
      go({ tab: 'list', article: id });
    } catch (e) { setErr((e as Error).name === 'AbortError' ? '멈췄어요.' : (e as Error).message); }
    finally { setStep(''); }
  }

  if (hasKey === false) return <Empty title="AI 연결이 먼저 필요해요" text="설정에서 관장님 OpenAI 키를 넣어 주세요. 키는 이 휴대폰의 보안 저장소에만 보관해요." />;
  if (!profile?.name) return <Empty title="도장 정보를 먼저 적어 주세요" text="아래 [도장 정보]에서 도장 이름과 동네만 적어도 글을 만들 수 있어요." />;
  if (step) return (
    <section className="card center">
      <div className="spin" aria-hidden="true" />
      <h2>{step}</h2>
      <p className="dim">보통 1~2분 걸려요. 이 화면을 켜 둔 채 기다려 주세요.</p>
      <button type="button" className="btn line" onClick={() => stop.current?.abort()}>멈추기</button>
    </section>
  );
  return (
    <section className="stack">
      <h1>오늘 수업 이야기</h1>
      <p className="dim">버튼을 누르고 말하거나 적어 주세요. 적은 사실로만 써요.</p>
      <Mic profile={profile} onText={(t) => setMemo((m) => (m.trim() ? `${m.trimEnd()} ${t}` : t))} />
      <textarea id="memo" rows={5} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 오늘 유치부 줄넘기 양발 모아뛰기, 서윤이가 처음으로 50개 넘겼어요" />
      <label className="check"><input type="checkbox" checked={prefix} onChange={(e) => setPrefix(e.target.checked)} /> 제목 앞에 동네 이름 붙이기</label>
      <button type="button" className="btn blue big" disabled={!memo.trim()} onClick={start}>글 만들기</button>
      {err && <p className="err" role="alert">{err}</p>}
    </section>
  );
}

const pickMime = () => ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ?? '';
function Mic({ profile, onText }: { profile: DojoProfile | null; onText: (t: string) => void }) {
  const [state, setState] = useState<'idle' | 'rec' | 'busy'>('idle');
  const [sec, setSec] = useState(0);
  const [err, setErr] = useState('');
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | null>(null);
  async function start() {
    setErr('');
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { setErr('마이크를 쓸 수 없어요. 휴대폰 설정 → 애플리케이션 → 태권 글뚝딱 → 권한 → 마이크를 허용해 주세요.'); return; }
    const mime = pickMime();
    const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    r.onstop = async () => {
      if (timer.current) clearInterval(timer.current);
      stream.getTracks().forEach((t) => t.stop());
      setState('busy');
      try {
        const blob = new Blob(chunks, { type: r.mimeType || mime || 'audio/webm' });
        if (blob.size < 1000) throw new Error('녹음이 너무 짧아요. 버튼을 누르고 말씀해 주세요.');
        const text = await listen(new Uint8Array(await blob.arrayBuffer()), blob.type, profile);
        if (!text) throw new Error('말소리를 알아듣지 못했어요. 휴대폰을 입 가까이 대고 다시 말씀해 주세요.');
        onText(text);
      } catch (e) { setErr((e as Error).message); } finally { setState('idle'); }
    };
    rec.current = r; r.start(); setSec(0); setState('rec');
    timer.current = window.setInterval(() => setSec((s) => { if (s + 1 >= 60) r.stop(); return s + 1; }), 1000);
  }
  return (
    <div className="mic-wrap">
      <button type="button" className={`mic ${state}`} disabled={state === 'busy'} onClick={state === 'rec' ? () => rec.current?.stop() : start} aria-label={state === 'rec' ? '다 말했어요' : '말로 메모 넣기'}>
        {state === 'rec' ? '■' : state === 'busy' ? '…' : '🎤'}
      </button>
      <span className="dim">{state === 'rec' ? `듣고 있어요 ${sec}초 · 다 말씀하시면 다시 누르세요` : state === 'busy' ? '글자로 바꾸는 중…' : '누르고 말하기 (최대 1분)'}</span>
      {err && <p className="err" role="alert">{err}</p>}
    </div>
  );
}

function ArticleView({ id, back }: { id: string; back: () => void }) {
  const a = articleStore.get(id);
  const [msg, setMsg] = useState('');
  if (!a?.doc) return <Empty title="글을 찾지 못했어요" text="지난 글 목록에서 다시 골라 주세요." />;
  const doc = a.doc;
  const tags = doc.tags.map((t) => `#${t.replace(/^#/, '')}`).join(' ');
  const all = `${a.title}\n\n${plainBody(doc)}\n\n${tags}`;
  const copy = async (text: string, what: string) => { await Clipboard.write({ string: text }); setMsg(`${what} 복사했어요. 네이버 블로그 앱에 붙여 넣으세요.`); };
  const share = async () => { try { await Share.share({ title: a.title, text: all, dialogTitle: '블로그로 보내기' }); } catch { /* 닫음 */ } };
  return (
    <section className="stack">
      <button type="button" className="btn link" onClick={back}>← 지난 글</button>
      <h1>{a.title}</h1>
      <p className="dim">{a.counts?.withoutSpaces?.toLocaleString()}자 (공백 빼고) · {new Date(a.createdAt).toLocaleString()}</p>
      {doc.reviewFlags.length > 0 && <div className="warn"><b>올리기 전에 확인해 주세요</b>{doc.reviewFlags.slice(0, 4).map((f, i) => <span key={i}>· {f.message}</span>)}</div>}
      <div className="actions">
        <button type="button" className="btn blue" onClick={share}>블로그로 보내기</button>
        <button type="button" className="btn line" onClick={() => copy(all, '제목 · 본문 · 태그를')}>전체 복사</button>
      </div>
      {msg && <p className="ok">{msg}</p>}
      <article className="post">
        {doc.sections.map((s, i) => (
          <div key={i} className="sec">{s.heading && <h3>{s.heading}</h3>}{s.paragraphs.map((p, j) => <p key={j}>{p}</p>)}</div>
        ))}
        <p className="tags">{tags}</p>
      </article>
      <div className="row">
        <button type="button" className="btn line small" onClick={() => copy(a.title, '제목을')}>제목만 복사</button>
        <button type="button" className="btn line small" onClick={() => copy(plainBody(doc), '본문을')}>본문만 복사</button>
        <button type="button" className="btn line small" onClick={() => copy(tags, '태그를')}>태그만 복사</button>
      </div>
      <p className="dim small">카드뉴스 3장은 다음 시험판에서 같이 만들어요. 네이버 블로그 앱에서 [장소]를 눌러 도장 지도를 넣을 수 있어요.</p>
    </section>
  );
}

function List({ open }: { open: (id: string) => void }) {
  const list = articleStore.list().filter((a) => a.doc);
  if (!list.length) return <Empty title="아직 만든 글이 없어요" text="[새 글]에서 오늘 수업 이야기를 말해 보세요." />;
  return (
    <section className="stack">
      <h1>지난 글</h1>
      {list.map((a) => (
        <button key={a.id} type="button" className="item" onClick={() => open(a.id)}>
          <b>{a.title}</b><span className="dim">{new Date(a.createdAt).toLocaleDateString()} · {a.counts?.withoutSpaces?.toLocaleString()}자</span>
        </button>
      ))}
    </section>
  );
}

function Profile({ value, onSave }: { value: DojoProfile | null; onSave: (p: DojoProfile) => void }) {
  const [p, setP] = useState<DojoProfile>(value ?? blankProfile());
  const set = (x: Partial<DojoProfile>) => setP({ ...p, ...x });
  const toggle = (a: string) => set({ audiences: p.audiences.includes(a) ? p.audiences.filter((x) => x !== a) : [...p.audiences, a] });
  return (
    <section className="stack">
      <h1>도장 정보</h1>
      <p className="dim">글에 들어가는 도장 이야기예요. 적은 것만 글에 써요.</p>
      <label className="field"><span>도장 이름</span><input id="p-name" value={p.name} onChange={(e) => set({ name: e.target.value })} placeholder="예: 경희대보람태권도" /></label>
      <label className="field"><span>동네 (동 · 구)</span><input id="p-region" value={p.region} onChange={(e) => set({ region: e.target.value })} placeholder="예: 서울 노원구 상계동" /></label>
      <div className="field"><span>가르치는 나이</span><div className="chips">{AUDIENCES.map((a) => <button key={a} type="button" className={p.audiences.includes(a) ? 'on' : ''} onClick={() => toggle(a)}>{a}</button>)}</div></div>
      <label className="field"><span>교육 철학</span><textarea id="p-phil" rows={2} value={p.philosophy} onChange={(e) => set({ philosophy: e.target.value })} placeholder="예: 예절과 자신감" /></label>
      <label className="field"><span>수업 특징</span><textarea id="p-class" rows={3} value={p.classFeatures} onChange={(e) => set({ classFeatures: e.target.value })} placeholder="예: 줄넘기 · 품새 · 체력 수업, 셔틀 운행" /></label>
      <label className="field"><span>경력 · 자격 (확인 가능한 것만)</span><input id="p-cred" value={p.credentials ?? ''} onChange={(e) => set({ credentials: e.target.value })} /></label>
      <label className="field"><span>주변 학교 · 아파트 (쉼표로)</span><input id="p-near" value={(p.nearbyAreas ?? []).map((a) => a.name).join(', ')} onChange={(e) => set({ nearbyAreas: e.target.value.split(',').map((n) => n.trim()).filter(Boolean).map((name) => ({ name, kind: '직접', source: 'manual' as const })) })} placeholder="예: 온곡초등학교, 보람아파트" /></label>
      <button type="button" className="btn blue big" disabled={!p.name.trim() || !p.region.trim()} onClick={() => onSave(p)}>저장</button>
    </section>
  );
}

function Settings({ hasKey, onChange }: { hasKey: boolean; onChange: () => void }) {
  const [v, setV] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    const k = v.trim();
    if (!/^sk-[A-Za-z0-9_\-]{20,}$/.test(k)) { setMsg({ ok: false, t: 'OpenAI 키는 sk- 로 시작하는 긴 글자예요. 다시 붙여 넣어 주세요.' }); return; }
    setBusy(true); setMsg(null);
    try { await testKey(k); await secrets.set('openai', k); setV(''); setMsg({ ok: true, t: '연결됐어요. 키는 이 휴대폰 보안 저장소에만 보관해요.' }); onChange(); }
    catch (e) { setMsg({ ok: false, t: (e as Error).message }); } finally { setBusy(false); }
  }
  return (
    <section className="stack">
      <h1>설정</h1>
      <div className="card"><b>OpenAI 키 {hasKey ? '· 연결됨' : '· 아직 없음'}</b>
        <p className="dim">글 · 받아쓰기 비용은 관장님 OpenAI 계정에서 쓴 만큼 나가요.</p>
        <input id="k" type="password" autoComplete="off" value={v} onChange={(e) => setV(e.target.value)} placeholder="sk- 로 시작하는 키 붙여넣기" />
        <div className="row"><button type="button" className="btn blue" disabled={!v.trim() || busy} onClick={save}>{busy ? '확인 중…' : '저장하고 확인'}</button>
          {hasKey && <button type="button" className="btn line" onClick={async () => { await secrets.remove('openai'); onChange(); }}>키 지우기</button>}</div>
        {msg && <p className={msg.ok ? 'ok' : 'err'}>{msg.t}</p>}
      </div>
      <p className="dim small">휴대폰 시험판 0.1 · 카드뉴스 · 계정 연결 · 전담 비서는 다음 시험판에 들어가요.</p>
    </section>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return <section className="card center"><h2>{title}</h2><p className="dim">{text}</p></section>;
}
