import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { call, type ArticleSummary } from '../api';
import { fmtDate } from '../components/ui';

const STATUS: Record<string, [string, string]> = {
  draft: ['입력 중', ''], generating: ['글 생성 중', 'warn'], validating: ['검증 중', 'warn'], review: ['검토 필요', 'warn'], ready: ['완료', 'ok'],
};

export function History() {
  const { go } = useApp();
  const [list, setList] = useState<ArticleSummary[] | null>(null);
  const load = () => call<ArticleSummary[]>('article:list').then(setList);
  useEffect(() => { load(); }, []);
  return (
    <>
      <div className="head"><h1>작성 이력</h1><span className="hint">인터넷 없이도 열어 보고 고치고 내보낼 수 있어요.</span></div>
      <div className="panel">
        {!list ? <p className="muted">불러오는 중…</p> : !list.length ? <p className="muted">아직 만든 글이 없어요.</p> : list.map((a) => {
          const [label, cls] = STATUS[a.status] ?? [a.status, ''];
          return (
            <div className="list-row" key={a.id}>
              <div className="t"><b>{a.title || a.topic || '(제목 없음)'}</b><span className="muted">{a.kind} · {fmtDate(a.updatedAt)}</span></div>
              {a.demo && <span className="badge demo">데모</span>}
              <span className={`badge ${cls}`}>{label}</span>
              <button className="btn small" onClick={() => go({ page: 'article', id: a.id })}>열기</button>
              <button className="btn small danger" onClick={async () => { if (confirm('이 글과 카드를 지울까요? 되돌릴 수 없어요.')) { await call('article:delete', a.id); load(); } }}>삭제</button>
            </div>
          );
        })}
      </div>
    </>
  );
}
