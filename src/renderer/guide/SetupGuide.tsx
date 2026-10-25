// 설치 도우미 (전담 비서): 처음 켤 때 · 설정에서 [비서와 같이 하기]
// 계정 연결 → 도장 정보 4칸 → OpenAI 가입 · 카드 · 충전 · 한도 · 키 → 키 가져오기 → 첫 글
// 대본은 guide/script.json (A 그룹). 멈춘 단계는 이 PC에 기억해 다음에 이어서
import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { call, local, type DojoProfile } from '../api';
import { Chips } from '../components/ui';
import { AUDIENCES } from '../../shared/types';
import type { LicenseStatus } from '../components/Account';
import { Bubble, HelpBox, line, open } from './voice';

const OPENAI = 'https://platform.openai.com';
type Step = { id: string; title: string; shot?: string; url?: string };
export const STEPS: Step[] = [
  { id: 'A00', title: '시작' },
  { id: 'A01', title: '계정 연결' },
  { id: 'A02', title: '도장 정보' },
  { id: 'A03', title: 'AI 소개' },
  { id: 'A03b', title: '개인정보' },
  { id: 'A04', title: 'OpenAI 가입', shot: 'oa-1-home.jpg', url: `${OPENAI}/` },
  { id: 'A05', title: '카드 등록', shot: 'oa-2-billing.jpg', url: `${OPENAI}/settings/organization/billing/overview` },
  { id: 'A06', title: '5달러 충전', shot: 'oa-2-billing.jpg', url: `${OPENAI}/settings/organization/billing/overview` },
  { id: 'A07', title: '월 한도', shot: 'oa-3-limits.jpg', url: `${OPENAI}/settings/organization/limits` },
  { id: 'A08', title: '키 만들기', shot: 'oa-4-keys.jpg', url: `${OPENAI}/api-keys` },
  { id: 'A09', title: '키 가져오기', shot: 'oa-4-keys.jpg', url: `${OPENAI}/api-keys` },
  { id: 'A10', title: '첫 글' },
];
const at = (id: string) => Math.max(0, STEPS.findIndex((s) => s.id === id));

export function SetupGuide({ start, onClose, firstRun }: { start?: string; onClose: () => void; firstRun?: boolean }) {
  const { info, reload, license, setLicense, go } = useApp();
  const [idx, setIdx] = useState(() => (start ? at(start) : at(local.get('guide-step', 'A00'))));
  const [help, setHelp] = useState(false);
  const [extra, setExtra] = useState<string | null>(null); // 막힘 안내 대본 (E0x)
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const step = STEPS[idx];
  const l = line(step.id);
  useEffect(() => { local.set('guide-step', step.id); setExtra(null); setErr(''); setHelp(false); }, [step.id]);

  const next = () => setIdx((i) => Math.min(i + 1, STEPS.length - 1));
  const finish = async (thenNew = false) => {
    if (!info.settings.setupDone) await call('settings:save', { setupDone: true });
    local.set('guide-step', 'A00');
    await reload();
    onClose();
    if (thenNew) go({ page: 'new' });
  };
  const fail = (e: unknown) => setErr(e instanceof Error ? e.message : String(e));

  // 단계별 할 일
  const connect = async () => {
    setBusy(true); setErr('');
    try { const s = await call<LicenseStatus>('license:connect'); setLicense(s); next(); }
    catch (e) { fail(e); if (String((e as Error)?.message).includes('체험')) setExtra('E07'); }
    finally { setBusy(false); }
  };

  const shotBox = step.shot && (
    <div className="guide-shot">
      <img src={`./guide/${step.shot}`} alt={`${step.title} 화면 예시 (OpenAI 실제 화면, 2026-10-22)`} />
      <span className="hint">OpenAI 실제 화면 (2026-10-22). 화면이 다르면 짐작해서 누르지 말고 "화면이 달라요"를 눌러 주세요.</span>
      {step.url && <button type="button" className="btn" onClick={() => open(step.url!)}>OpenAI 화면 열기</button>}
    </div>
  );

  return (
    <div className={`guide ${firstRun ? 'first' : 'modal'}`} role="dialog" aria-label="글뚝딱 전담 비서">
      <div className="guide-card">
        <div className="guide-bar">
          <b>글뚝딱 전담 비서 · {idx + 1} / {STEPS.length} · {step.title}</b>
          <div className="guide-prog" aria-hidden="true">{STEPS.map((s, i) => <i key={s.id} className={i < idx ? 'done' : i === idx ? 'now' : ''} />)}</div>
          <button type="button" className="btn small" onClick={() => (firstRun ? finish() : onClose())}>{firstRun ? '나중에 하기' : '닫기'}</button>
        </div>
        <div className={`guide-body ${step.shot ? 'two' : ''}`}>
          <div className="guide-chat">
            <Bubble id={step.id} key={step.id} />
            {extra && <Bubble id={extra} key={extra} />}

            {step.id === 'A00' && (
              <div className="row">
                <button type="button" className="btn primary" onClick={next}>{l.buttons?.[0]}</button>
                <button type="button" className="btn" onClick={() => { setHelp(true); }}>{l.buttons?.[1]}</button>
                <button type="button" className="btn link" onClick={() => finish()}>{l.buttons?.[2]}</button>
              </div>
            )}

            {step.id === 'A01' && (license?.state === 'ok' || license?.state === 'locked' ? (
              <div className="row"><span className="badge ok">이미 연결돼 있어요 · {license.dojang}</span><button type="button" className="btn primary" onClick={next}>다음</button></div>
            ) : (
              <div className="row">
                <button type="button" className="btn primary" disabled={busy} onClick={connect}>{busy ? '인터넷 창에서 연결을 기다리는 중…' : l.buttons?.[0]}</button>
                <button type="button" className="btn" onClick={() => setExtra('E04')}>{l.buttons?.[1]}</button>
              </div>
            ))}

            {step.id === 'A02' && <MiniProfile dojang={license && license.state !== 'none' ? license.dojang ?? '' : ''} onSaved={async () => { await reload(); next(); }} />}

            {(step.id === 'A03' || step.id === 'A03b') && <div className="row"><button type="button" className="btn primary" onClick={next}>{l.buttons?.[0] ?? '알겠어요'}</button></div>}

            {['A04', 'A05', 'A06', 'A07', 'A08'].includes(step.id) && (
              <div className="row">
                <button type="button" className="btn primary" onClick={next}>{step.id === 'A04' ? '가입했어요' : l.buttons?.[0]}</button>
                {step.id === 'A04' && <button type="button" className="btn" onClick={() => open(step.url!)}>사이트 열기</button>}
                {step.id === 'A05' && <button type="button" className="btn" onClick={() => setExtra('E01')}>카드가 안 돼요</button>}
                {step.id === 'A07' && <button type="button" className="btn" onClick={next}>건너뛸게요</button>}
                <button type="button" className="btn" onClick={() => setExtra('E05')}>{step.id === 'A04' ? '모르겠어요' : '화면이 달라요'}</button>
              </div>
            )}

            {step.id === 'A09' && <KeyImport hasKey={!!info.secrets.openai} onDone={async () => { await reload(); next(); }} onError={(code) => setExtra(code === 'quota' ? 'E03' : code === 'network' ? 'E08' : 'E02')} />}

            {step.id === 'A10' && <FirstPost onGo={() => finish(true)} />}

            {err && <div className="note err">{err}</div>}
            {help ? <HelpBox where={`설치 도우미 ${idx + 1}번 (${step.title})`} onClose={() => setHelp(false)} /> : (
              <button type="button" className="btn help" onClick={() => setHelp(true)}>막혔어요 · 담당자 부르기</button>
            )}
            {idx > 0 && <button type="button" className="btn link back" onClick={() => setIdx(idx - 1)}>← 이전 단계</button>}
          </div>
          {shotBox}
        </div>
        <p className="hint ai-voice">안내 음성은 AI로 만든 목소리예요.</p>
      </div>
    </div>
  );
}

// 도장 정보 4칸 (이름은 계정에서 가져옴). 나머지는 도장 정보 화면에서 천천히
function MiniProfile({ dojang, onSaved }: { dojang: string; onSaved: () => void }) {
  const [p, setP] = useState<DojoProfile | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    call<DojoProfile | null>('profile:get').then((cur) => setP(cur ?? {
      id: 'default', name: dojang, region: '', address: '', audiences: [], philosophy: '', classFeatures: '', hours: '', classes: '', promoDay: '', strengths: [], strengthsEtc: '', otherFacts: '', credentials: '', contact: '', consultLink: '', blogUrl: '',
      brand: { main: '#1F4E9A', accent: '#C8241C' }, tone: '따뜻한 설명형', avoidWords: '최고, 무조건', nearbyAreas: [],
    })).catch(() => {});
  }, []); // eslint-disable-line
  if (!p) return null;
  const set = (x: Partial<DojoProfile>) => setP({ ...p, ...x });
  const save = async () => {
    setErr('');
    try { await call('profile:save', { ...p, name: p.name || dojang, strengths: p.strengths ?? [] }); onSaved(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <div className="mini-form">
      <label className="field"><span>도장 이름</span><input type="text" value={p.name || dojang} onChange={(e) => set({ name: e.target.value })} /></label>
      <label className="field"><span>동네</span><input type="text" placeholder="예: 서울 마포구 망원동" value={p.region} onChange={(e) => set({ region: e.target.value })} /></label>
      <div className="field"><span>가르치는 나이</span><Chips multi options={AUDIENCES} value={p.audiences as any} onChange={(v) => set({ audiences: v })} /></div>
      <label className="field"><span>교육 철학</span><input type="text" placeholder="예: 예절과 자신감" value={p.philosophy} onChange={(e) => set({ philosophy: e.target.value })} /></label>
      <label className="field"><span>수업 시간</span><input type="text" placeholder="예: 평일 오후 1시~8시" value={p.hours ?? ''} onChange={(e) => set({ hours: e.target.value })} /></label>
      <div className="row"><button type="button" className="btn primary" onClick={save}>저장하고 다음</button></div>
      {err && <div className="note err">{err}</div>}
    </div>
  );
}

// 키 가져오기: 관장님이 누를 때만 복사한 글자를 한 번 읽음 → 저장 → (test 가 있으면) 연결 확인
// OpenAI · 네이버 검색광고(액세스라이선스 · 비밀키) · 카카오 REST API 키 공통
type ImportName = 'openai' | 'naverApiKey' | 'naverSecret' | 'kakao';
export function KeyImport({ name = 'openai', test: testKind = 'openai', label = '복사한 키 가져오기', placeholder = 'sk- 로 시작하는 키 붙여넣기', hasKey, onDone, onError }: {
  name?: ImportName; test?: 'openai' | 'naver' | 'kakao' | null; label?: string; placeholder?: string;
  hasKey: boolean; onDone: () => void; onError?: (code?: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [v, setV] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const test = async () => {
    if (!testKind) { setMsg({ kind: 'ok', text: '가져왔어요. 이 컴퓨터에 암호화해서 보관했어요.' }); setTimeout(onDone, 700); return; }
    setMsg({ kind: 'ok', text: testKind === 'openai' ? line('A09b').say : '연결을 확인하는 중이에요…' });
    try { await call('secrets:test', testKind); setMsg({ kind: 'ok', text: '연결됐어요!' }); setTimeout(onDone, 900); }
    catch (e) { setMsg({ kind: 'err', text: (e as Error).message }); onError?.((e as { code?: string }).code); }
  };
  const fromClipboard = async () => {
    setBusy(true); setMsg(null);
    try { await call('secrets:fromClipboard', name); await test(); } catch (e) { setMsg({ kind: 'err', text: (e as Error).message }); } finally { setBusy(false); }
  };
  const saveManual = async () => {
    setBusy(true); setMsg(null);
    try { await call('secrets:set', { name, value: v }); setV(''); await test(); } catch (e) { setMsg({ kind: 'err', text: (e as Error).message }); } finally { setBusy(false); }
  };
  return (
    <div className="mini-form">
      <div className="row">
        <button type="button" className="btn primary" disabled={busy} onClick={fromClipboard}>{busy ? '확인 중…' : label}</button>
        <button type="button" className="btn" onClick={() => setManual(!manual)}>직접 붙여 넣을게요</button>
        {hasKey && <button type="button" className="btn link" disabled={busy} onClick={() => { setBusy(true); test().finally(() => setBusy(false)); }}>{testKind ? '이미 넣은 키로 확인' : '이미 넣었어요 · 다음'}</button>}
      </div>
      {manual && (
        <div className="row">
          <input className="grow" type="password" autoComplete="off" placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)} />
          <button type="button" className="btn primary" disabled={!v.trim() || busy} onClick={saveManual}>{testKind ? '저장하고 확인' : '저장'}</button>
        </div>
      )}
      {msg && <div className={`note ${msg.kind}`}>{msg.text}</div>}
    </div>
  );
}

// 첫 글: 메모 한 줄을 새 글 화면에 넣어 두고 이동 (만들기는 관장님이 직접 눌러 비용을 알고 시작)
function FirstPost({ onGo }: { onGo: () => void }) {
  const [memo, setMemo] = useState(local.get('quick-memo', '') || '유치부 친구들이 처음으로 줄넘기 열 개를 넘었어요');
  return (
    <div className="mini-form">
      <textarea rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} />
      <div className="row">
        <button type="button" className="btn primary" disabled={!memo.trim()} onClick={() => { local.set('quick-memo', memo.trim()); onGo(); }}>새 글 화면으로 가서 만들기</button>
      </div>
      <p className="hint">새 글 화면에 이 메모가 들어가 있어요. [바로 글 만들기]를 누르면 시작해요.</p>
    </div>
  );
}
