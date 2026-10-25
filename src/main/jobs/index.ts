// 작업 실행: 같은 대상에 같은 작업이 돌고 있으면 새로 시작하지 않음 (중복 클릭 방지), 멈추기 지원
import type { Db } from '../db';
import type { Job } from '../../shared/types';
import { toApiError } from '../services/errors';
import { log } from '../log';

export function createJobRunner(db: Db, notify: (job: Job) => void) {
  const controllers = new Map<string, AbortController>();

  function start(type: Job['type'], entityId: string, firstStep: string, work: (ctx: { signal: AbortSignal; step: (s: string) => void; jobId: string }) => Promise<unknown>) {
    const running = db.activeJob(type, entityId);
    if (running && controllers.has(running.id)) return { job: running, already: true };
    if (running) db.updateJob(running.id, { state: 'interrupted' }); // 기록만 남은 작업 정리
    const job = db.createJob(type, entityId, firstStep);
    const ac = new AbortController();
    controllers.set(job.id, ac);
    notify(job);
    const step = (s: string) => { if (!ac.signal.aborted) notify(db.updateJob(job.id, { step: s })); };
    (async () => {
      try {
        const r = await work({ signal: ac.signal, step, jobId: job.id });
        // 작업이 글로 된 결과를 돌려주면 그걸 마지막 안내로 남김 (예: 네이버 입력 결과 요약)
        notify(db.updateJob(job.id, ac.signal.aborted ? { state: 'cancelled', step: '중단' } : { state: 'succeeded', step: typeof r === 'string' ? r : '완료', errorCode: null, message: null }));
      } catch (e) {
        const err = toApiError(type === 'naver' ? '네이버' : 'OpenAI', e);
        const cancelled = ac.signal.aborted || err.code === 'cancelled';
        const message = err.code === 'unknown' && e instanceof Error ? e.message : err.message;
        log(`job-${type}-${cancelled ? 'cancelled' : 'failed'}`, `${err.code} ${e instanceof Error ? e.message : String(e)}`);
        notify(db.updateJob(job.id, cancelled ? { state: 'cancelled', step: '중단', message: '멈췄어요. 이미 보낸 요청의 비용은 취소되지 않아요.' } : { state: 'failed', step: '실패', errorCode: (e as any)?.code === 'existing-draft' ? 'existing-draft' : err.code, message }));
      } finally { controllers.delete(job.id); }
    })();
    return { job, already: false };
  }

  function cancel(jobId: string) {
    const ac = controllers.get(jobId);
    if (!ac) return false;
    ac.abort();
    return true;
  }

  // 같은 종류 작업이 (어느 대상이든) 실제로 돌고 있는지 — 네이버 창은 하나라 전체에서 하나만
  const runningOf = (types: Job['type'][], entityId?: string) => [...controllers.keys()].map((id) => db.getJob(id)).find((j) => j && types.includes(j.type) && (!entityId || j.entityId === entityId)) ?? null;
  return { start, cancel, isRunning: (jobId: string) => controllers.has(jobId), runningOf };
}
export type JobRunner = ReturnType<typeof createJobRunner>;
