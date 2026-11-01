import { useEffect, useState, type ReactNode } from 'react';
import { call, type Job } from '../api';
import { KAKAO_CHAT, open } from '../guide/voice';
import { failActions, isAiJob, OPENAI_BILLING, OPENAI_KEYS } from '../../shared/failHelp';

export function Field({ label, req, hint, children }: { label: string; req?: boolean; hint?: ReactNode; children: ReactNode }) {
  return <label className="field"><span>{label}{req && <em>*</em>}</span>{children}{hint && <small>{hint}</small>}</label>;
}

// label: 저장 값과 보이는 이름이 다를 때 (유치원판 글 종류: 수업 후기 → 놀이 · 활동 이야기)
export function Chips<T extends string>({ options, value, onChange, multi, label }: { options: readonly T[]; value: T | T[]; onChange: (v: any) => void; multi?: boolean; label?: (o: T) => string }) {
  const on = (o: T) => (Array.isArray(value) ? value.includes(o) : value === o);
  return (
    <div className="chips">
      {options.map((o) => (
        <button type="button" key={o} className={`chip ${on(o) ? 'on' : ''}`}
          onClick={() => (multi && Array.isArray(value) ? onChange(on(o) ? value.filter((x) => x !== o) : [...value, o]) : onChange(o))}>{label ? label(o) : o}</button>
      ))}
    </div>
  );
}

// 진행 상태: 알 수 없는 진행률 대신 단계 + 경과 시간
export function JobBar({ job, onDone, onRetry, onSettings }: { job: Job | null; onDone?: () => void; onRetry?: () => void; onSettings?: () => void }) {
  const [now, setNow] = useState(Date.now());
  const running = job && (job.state === 'running' || job.state === 'queued');
  useEffect(() => { if (!running) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [running]);
  useEffect(() => { if (job && !running) onDone?.(); }, [job?.state]); // eslint-disable-line
  if (!job) return null;
  const sec = Math.max(0, Math.round(((running ? now : Date.parse(job.updatedAt)) - Date.parse(job.startedAt)) / 1000));
  const elapsed = sec >= 60 ? `${Math.floor(sec / 60)}분 ${sec % 60}초` : `${sec}초`;
  if (running) return (
    <div className="jobbar">
      <div className="spinner" />
      <b>{job.step}</b><span className="muted">{elapsed} 지남</span>
      <span style={{ flex: 1 }} />
      <button className="btn small" onClick={() => call('job:cancel', job.id).catch(() => {})}>멈추기</button>
    </div>
  );
  if (job.state === 'failed') return <FailNote job={job} onRetry={onRetry} onSettings={onSettings} />;
  if (job.state === 'cancelled') return <div className="note warn">{job.message ?? '멈췄어요.'}</div>;
  if (job.state === 'interrupted') return <div className="note warn">{job.message ?? '프로그램이 꺼져서 멈췄어요. 다시 시도할 수 있어요.'}</div>;
  return null;
}

// 실패 안내: 이유 + 이유별 버튼 + 그래도 안 되면 카톡 (2026-11-02)
function FailNote({ job, onRetry, onSettings }: { job: Job; onRetry?: () => void; onSettings?: () => void }) {
  const acts = failActions(job.type, job.errorCode);
  return (
    <div className="note err">
      <b>실패:</b> {job.message}
      {acts.length > 0 && (
        <div className="row" style={{ marginTop: 8 }}>
          {acts.includes('billing') && <button className="btn small" onClick={() => open(OPENAI_BILLING)}>충전 화면 열기</button>}
          {acts.includes('keys') && <button className="btn small" onClick={() => open(OPENAI_KEYS)}>키 화면 열기</button>}
          {acts.includes('settings') && onSettings && <button className="btn small" onClick={onSettings}>설정으로 가기</button>}
          {acts.includes('retry') && onRetry && <button className="btn small" onClick={onRetry}>다시 만들기</button>}
          {acts.includes('kakao') && <button className="btn small" onClick={() => open(KAKAO_CHAT)}>카톡으로 묻기</button>}
        </div>
      )}
      {isAiJob(job.type) && <div className="hint" style={{ marginTop: 8 }}>{job.errorCode === 'permission' ? '' : '해결되지 않으면 이 화면을 사진으로 찍어 카톡으로 보내 주세요. '}키, 카드번호, 비밀번호는 보내지 마세요.</div>}
    </div>
  );
}

export function Msg({ m }: { m: { kind: 'ok' | 'err' | 'info' | 'warn'; text: string } | null }) {
  return m ? <div className={`note ${m.kind}`}>{m.text}</div> : null;
}

export function useMsg() {
  const [m, setM] = useState<{ kind: 'ok' | 'err' | 'info' | 'warn'; text: string } | null>(null);
  return { m, ok: (text: string) => setM({ kind: 'ok', text }), err: (e: unknown) => setM({ kind: 'err', text: e instanceof Error ? e.message : String(e) }), info: (text: string) => setM({ kind: 'info', text }), warn: (text: string) => setM({ kind: 'warn', text }), clear: () => setM(null) };
}

export const fmtDate = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
