import { useEffect, useState, type ReactNode } from 'react';
import { call, type Job } from '../api';

export function Field({ label, req, hint, children }: { label: string; req?: boolean; hint?: ReactNode; children: ReactNode }) {
  return <label className="field"><span>{label}{req && <em>*</em>}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function Chips<T extends string>({ options, value, onChange, multi }: { options: readonly T[]; value: T | T[]; onChange: (v: any) => void; multi?: boolean }) {
  const on = (o: T) => (Array.isArray(value) ? value.includes(o) : value === o);
  return (
    <div className="chips">
      {options.map((o) => (
        <button type="button" key={o} className={`chip ${on(o) ? 'on' : ''}`}
          onClick={() => (multi && Array.isArray(value) ? onChange(on(o) ? value.filter((x) => x !== o) : [...value, o]) : onChange(o))}>{o}</button>
      ))}
    </div>
  );
}

// 진행 상태: 알 수 없는 진행률 대신 단계 + 경과 시간
export function JobBar({ job, onDone }: { job: Job | null; onDone?: () => void }) {
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
  if (job.state === 'failed') return <div className="note err"><b>실패:</b> {job.message}</div>;
  if (job.state === 'cancelled') return <div className="note warn">{job.message ?? '멈췄어요.'}</div>;
  if (job.state === 'interrupted') return <div className="note warn">{job.message ?? '프로그램이 꺼져서 멈췄어요. 다시 시도할 수 있어요.'}</div>;
  return null;
}

export function Msg({ m }: { m: { kind: 'ok' | 'err' | 'info' | 'warn'; text: string } | null }) {
  return m ? <div className={`note ${m.kind}`}>{m.text}</div> : null;
}

export function useMsg() {
  const [m, setM] = useState<{ kind: 'ok' | 'err' | 'info' | 'warn'; text: string } | null>(null);
  return { m, ok: (text: string) => setM({ kind: 'ok', text }), err: (e: unknown) => setM({ kind: 'err', text: e instanceof Error ? e.message : String(e) }), info: (text: string) => setM({ kind: 'info', text }), warn: (text: string) => setM({ kind: 'warn', text }), clear: () => setM(null) };
}

export const fmtDate = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
