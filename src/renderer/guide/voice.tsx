// 전담 비서 공통 부품: 대본 찾기 · 음성 재생 · 말풍선 · 담당자 부르기 · 처음 한 번 안내
// 대본 원본: docs/음성안내/script.json (여기 script.json 은 그 복사본). 음성 파일은 public/voice/ 에 넣으면 재생, 없으면 글자만
import { useEffect, useRef, useState } from 'react';
import { call, local } from '../api';
import script from './script.json';

export type Line = { id: string; file?: string; say: string; buttons?: string[] };
const LINES = new Map<string, Line>(script.groups.flatMap((g) => g.items as Line[]).map((i) => [i.id, i]));
export const line = (id: string): Line => LINES.get(id) ?? { id, say: '' };

export const KAKAO_CHAT = 'https://pf.kakao.com/_xiHmJX/chat';
export const REMOTE_APP = 'https://rustdesk.com/';
export const open = (url: string) => call('shell:open', url).catch(() => {});

// 앱 전체에서 소리는 한 번에 하나만: 같은 화면에서 동시에 뜬 안내는 차례로, 그 뒤에 뜬 안내 · [다시 듣기]는 앞 소리를 끊고 재생
type Job = { owner: symbol; start: () => HTMLAudioElement };
const player: { now: { owner: symbol; a: HTMLAudioElement; at: number } | null; queue: Job[] } = { now: null, queue: [] };
const SAME_SCREEN_MS = 600;
function next() {
  const j = player.queue.shift();
  if (j) begin(j);
}
function begin(j: Job) {
  player.now?.a.pause();
  const a = j.start();
  player.now = { owner: j.owner, a, at: Date.now() };
  const done = () => { if (player.now?.a === a) { player.now = null; next(); } };
  a.addEventListener('ended', done);
  a.play().catch(done);
}
function enqueue(j: Job, interrupt: boolean) {
  player.queue = player.queue.filter((q) => q.owner !== j.owner);
  const busy = player.now && !player.now.a.ended;
  if (busy && !interrupt && Date.now() - player.now!.at < SAME_SCREEN_MS) player.queue.push(j);
  else { if (interrupt) player.queue = []; begin(j); }
}
function cancel(owner: symbol) {
  player.queue = player.queue.filter((q) => q.owner !== owner);
  if (player.now?.owner === owner) { player.now.a.pause(); player.now = null; next(); }
}
function stopAll() {
  player.queue = [];
  player.now?.a.pause();
  player.now = null;
}

// 음성: 소리 끄기 · 천천히는 이 PC에 기억. 파일이 없으면(아직 녹음 전) 조용히 글자만
export function useVoice(file: string | undefined, auto = true) {
  const [muted, setMuted] = useState(local.get('voice-muted', false));
  const [slow, setSlow] = useState(local.get('voice-slow', false));
  const [available, setAvailable] = useState(false); // 파일이 실제로 있을 때만 음성 버튼을 보여 줌
  const ref = useRef<HTMLAudioElement | null>(null);
  const owner = useRef(Symbol('voice')).current;
  useEffect(() => {
    if (!file) return;
    const probe = new Audio(`./voice/${file}`);
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => setAvailable(true);
    probe.onerror = () => setAvailable(false);
    return () => { probe.onloadedmetadata = null; probe.onerror = null; };
  }, [file]);
  const start = () => {
    const a = new Audio(`./voice/${file}`);
    a.playbackRate = local.get('voice-slow', false) ? 0.85 : 1;
    a.onerror = () => setAvailable(false);
    ref.current = a;
    return a;
  };
  const play = (interrupt = true) => { if (file) enqueue({ owner, start }, interrupt); };
  useEffect(() => {
    if (auto && !muted) play(false);
    return () => cancel(owner);
  }, [file]); // eslint-disable-line
  useEffect(() => { if (ref.current) ref.current.playbackRate = slow ? 0.85 : 1; }, [slow]);
  const toggleMute = () => { const m = !muted; setMuted(m); local.set('voice-muted', m); if (m) stopAll(); };
  const toggleSlow = () => { const s = !slow; setSlow(s); local.set('voice-slow', s); };
  return { play, muted, slow, available: available && !!file, toggleMute, toggleSlow };
}

// 비서 말풍선 (글자는 늘 보이고, 음성이 있으면 다시 듣기 · 천천히 · 끄기)
export function Bubble({ id, auto = true, children }: { id: string; auto?: boolean; children?: React.ReactNode }) {
  const l = line(id);
  const v = useVoice(l.file, auto);
  return (
    <div className="bubble bot">
      <p>{l.say}</p>
      {children}
      {v.available && (
        <div className="voice-row">
          <button type="button" className="chip" onClick={() => v.play()}>🔊 다시 듣기</button>
          <button type="button" className={`chip ${v.slow ? 'on' : ''}`} onClick={v.toggleSlow}>천천히</button>
          <button type="button" className={`chip ${v.muted ? 'on' : ''}`} onClick={v.toggleMute}>{v.muted ? '소리 켜기' : '소리 끄기'}</button>
        </div>
      )}
    </div>
  );
}

// 담당자 부르기: 막힌 단계를 카톡 문구로 복사해 두고 카톡 채널 · 원격 프로그램 안내
export function HelpBox({ where, onClose }: { where: string; onClose?: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `글뚝딱 ${where}에서 막혔어요. 도와주세요.`;
  const callStaff = async () => {
    try { await call('guide:copy', text); setCopied(true); } catch { /* 복사가 안 돼도 카톡은 열어 줌 */ }
    open(KAKAO_CHAT);
  };
  return (
    <div className="helpbox">
      <Bubble id="E06" />
      <div className="row">
        <button type="button" className="btn primary" onClick={callStaff}>카톡으로 담당자 부르기</button>
        <button type="button" className="btn" onClick={() => open(REMOTE_APP)}>원격 프로그램 받기</button>
        {onClose && <button type="button" className="btn link" onClick={onClose}>닫기</button>}
      </div>
      <p className="hint">{copied ? `"${text}" 문구를 복사해 뒀어요. 카톡 대화창에 붙여 넣어 보내 주세요.` : `카톡이 열리면 "${text}"라고 보내 주세요.`}</p>
    </div>
  );
}

// 설정 칸마다 [🔊 설명 듣기]: 누르면 그 칸 대본이 말풍선으로 펼쳐지고 첫 문장을 읽어 줌
export function Speak({ ids, label = '설명 듣기' }: { ids: string[]; label?: string }) {
  const [openState, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn small speak" onClick={() => setOpen(!openState)} aria-expanded={openState}>🔊 {openState ? '설명 닫기' : label}</button>
      {openState && (
        <div className="speak-box">
          {ids.map((id, i) => <Bubble key={id} id={id} auto={i === 0} />)}
        </div>
      )}
    </>
  );
}

// 그 기능을 처음 쓸 때 한 번만 나오는 안내 (닫으면 이 PC에서는 다시 안 나옴)
export function FirstTip({ id }: { id: string }) {
  const key = `tip-${id}`;
  const [seen, setSeen] = useState(local.get(key, false));
  if (seen) return null;
  return (
    <div className="firsttip">
      <Bubble id={id} />
      <button type="button" className="btn small" onClick={() => { local.set(key, true); setSeen(true); }}>알겠어요</button>
    </div>
  );
}
