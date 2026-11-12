// 블로그 노출 순위 (태권 글뚝딱 2.8.0에서 옮김, 2026-11-11): 블로그 주소 하나로 최근 글을 모두 불러와 네이버 검색에서 몇 번째에 보이는지 확인 · 기록
// 글마다 검색어는 자동(앱으로 쓴 글의 검색어 → 태그 → 제목)이고 직접 바꿀 수 있음. 검색어 하나를 검색하면 그 블로그 글 전부의 자리를 같이 기록
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../App';
import { call } from '../api';
import { fmtDate, Msg, useMsg } from '../components/ui';
import { APP } from '../../shared/kinder';
import type { Diagnosis, Finding, PostStats } from '../../shared/diagnose';
import { changeText, rankText, volumeId, volumeText, RANK_ALL_POSTS, RANK_COOLDOWN_MS, RANK_KEYWORDS_MAX, RANK_MAX, type KeywordSource, type PostRow, type RankOverview, type RankVolume } from '../../shared/rank';

const open = (url: string) => call('shell:open', url).catch(() => {});
// 네이버 검색 화면을 열어 그 글 자리에 표시 (앱이 여는 창)
const showIn = (keyword: string, url: string, where: 'blog' | 'total', rank: number | null) => call('rank:showInSearch', { keyword, url, where, rank }).catch(() => {});
const SHOW_TIP = '네이버 검색 화면에서 이 글 자리 보기';
const CHANGE_COLOR = { up: 'var(--ok)', new: 'var(--ok)', down: 'var(--err)', gone: 'var(--err)', same: 'var(--muted)' } as const;
const SOURCE: Record<KeywordSource, string> = { custom: '직접 정한 검색어', app: '앱으로 쓴 글의 검색어', tag: '글 태그에서 고른 검색어', title: '제목에서 고른 검색어' };
const recent = (iso: string | null | undefined) => !!iso && Date.now() - Date.parse(iso) < RANK_COOLDOWN_MS;
const day = (iso: string | null) => (iso ? `${new Date(iso).getMonth() + 1}/${new Date(iso).getDate()}` : '');
type Vol = { volumes: Record<string, RankVolume | null>; needKey: boolean; error: string | null };

export function RankPage() {
  const { go } = useApp();
  const [data, setData] = useState<RankOverview | null>(null);
  const [blog, setBlog] = useState('');
  const [busy, setBusy] = useState<string | null>(null); // 'load' · 'kw:검색어' · 'diag:주소|검색어'
  const [progress, setProgress] = useState<{ done: number; total: number; now: string } | null>(null);
  const [view, setView] = useState<'posts' | 'keywords'>('posts');
  const [more, setMore] = useState(false);
  const [vol, setVol] = useState<Vol | null>(null);
  const stop = useRef(false);
  const msg = useMsg();

  const load = async (b?: string): Promise<RankOverview | null> => {
    setBusy('load'); msg.clear();
    try {
      const r = await call<{ overview: RankOverview; warn: string | null }>('rank:load', b === undefined ? {} : { blog: b });
      setData(r.overview); if (r.overview.blogId) setBlog(r.overview.blogId);
      if (r.warn) msg.warn(r.warn);
      return r.warn && !r.overview.rows.length ? null : r.overview;
    } catch (e) { msg.err(e); return null; } finally { setBusy(null); }
  };
  const refresh = () => call<RankOverview>('rank:overview').then(setData);
  useEffect(() => { load(); return () => { stop.current = true; }; }, []); // 다른 메뉴로 가면 확인을 멈춤

  // 월간 검색량: 보이는 검색어가 바뀔 때만 (대부분 저장된 값)
  const words = [...new Set((data?.keywords ?? []).map((k) => k.keyword))].sort().join('|');
  useEffect(() => { if (words) call<Vol>('rank:volumes', words.split('|')).then(setVol).catch(() => {}); }, [words]);
  const volOf = (k: string) => vol?.volumes[k] ?? Object.entries(vol?.volumes ?? {}).find(([w]) => volumeId(w) === volumeId(k))?.[1];

  // 검색어들을 차례로 확인 (3시간 안에 본 것은 서버가 건너뜀)
  const runKeywords = async (list: string[], done: string, quietIfNone = false) => {
    if (!list.length) { msg.info(quietIfNone ? '3시간 안에 확인한 결과예요. 같은 검색어는 3시간 뒤에 다시 확인할 수 있어요.' : '지금 다시 볼 검색어가 없어요. 같은 검색어는 3시간 뒤에 다시 확인할 수 있어요.'); return; }
    stop.current = false; msg.clear();
    try {
      for (const [i, k] of list.entries()) {
        if (stop.current) { msg.info('멈췄어요. 여기까지 확인한 결과는 저장했어요.'); break; }
        setBusy(`kw:${k}`); setProgress({ done: i, total: list.length, now: k });
        await call('rank:checkKeyword', { keyword: k });
        await refresh();
      }
      if (!stop.current) msg.ok(done);
    } catch (e) { msg.err(e); await refresh().catch(() => {}); } finally { setBusy(null); setProgress(null); }
  };
  const fresh = (list: string[], d = data) => [...new Map(list.map((k) => [volumeId(k), k])).values()]
    .filter((k) => !recent(d?.keywords.find((x) => volumeId(x.keyword) === volumeId(k))?.checkedAt));
  const checkAll = (d = data) => runKeywords(fresh((d?.rows ?? []).slice(0, RANK_ALL_POSTS).map((r) => r.keywords[0]).filter(Boolean), d), `최근 글 ${Math.min(RANK_ALL_POSTS, d?.rows.length ?? 0)}개의 노출 순위를 확인했어요.`, true);
  const checkPost = (r: PostRow) => runKeywords(fresh(r.keywords), '이 글의 순위를 확인했어요.');
  // 주소 넣고 한 번 누르면: 글 불러오기 → 최근 글 순위 확인까지
  const loadAndCheck = async () => { const d = await load(blog); if (d?.rows.length) await checkAll(d); };

  const diagnoseRow = async (r: PostRow, keyword: string) => {
    setBusy(`diag:${r.url}|${keyword}`); msg.clear();
    try { const x = await call<{ overview: RankOverview }>('rank:diagnose', { url: r.url, keyword }); setData(x.overview); return true; } catch (e) { msg.err(e); return false; } finally { setBusy(null); }
  };
  const setKeywords = async (url: string, keywords: string[] | null) => { try { setData(await call<RankOverview>('rank:setKeywords', { url, keywords })); return true; } catch (e) { msg.err(e); return false; } };

  const rows = data?.rows ?? [];
  const shown = more ? rows : rows.slice(0, RANK_ALL_POSTS);
  return (
    <>
      <div className="head"><h1>노출 순위</h1><span className="hint">블로그 주소를 넣으면 최근 글들이 네이버 검색에서 몇 번째에 보이는지 확인해요.</span></div>

      <div className="panel">
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <input style={{ flex: 1 }} data-testid="rank-blog" placeholder="블로그 주소 (예: https://blog.naver.com/아이디 또는 아이디만)" value={blog} onChange={(e) => setBlog(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && blog.trim() && !busy) loadAndCheck(); }} />
          <button className="btn primary" data-testid="rank-go" disabled={!!busy || !blog.trim()} onClick={loadAndCheck}>{busy === 'load' ? '글 불러오는 중…' : progress ? '확인 중…' : '노출 순위 확인'}</button>
        </div>
        {data && !data.blogId && <p className="muted" style={{ margin: '8px 0 0' }}>블로그 주소를 넣어 보세요. <button className="btn link" style={{ padding: 0 }} onClick={() => go({ page: 'profile' })}>{APP.place} 정보</button>에 적어 두면 다음부터 자동으로 들어가요.</p>}
        {data?.blogId && (
          <>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
              {progress ? (
                <><b>확인 중 {progress.done + 1}/{progress.total} · "{progress.now}"</b><button className="btn" onClick={() => { stop.current = true; }}>멈추기</button></>
              ) : (
                <Summary rows={rows.slice(0, RANK_ALL_POSTS)} />
              )}
              <span className="muted" style={{ marginLeft: 'auto' }}>블로그 {data.blogId}{data.ownBlog ? ` (${APP.place} 블로그)` : ''} · 글 {rows.length}개 · 오늘 순위 {data.usedToday}/{data.limit} · 원인 분석 {data.diagToday}/{data.diagLimit}</span>
            </div>
            <p className="muted" style={{ margin: '10px 0 0', fontSize: 13 }}>
              [노출 순위 확인]을 누르면 최근 글 {RANK_ALL_POSTS}개를 글마다 첫 번째 검색어로 확인해요. 검색어 하나를 검색하면 이 블로그 글 전부의 자리를 같이 기록해서, 같은 검색어를 쓰는 글은 한 번에 끝나요.
              순위 숫자(↗)를 누르면 네이버 검색 화면에서 그 글 자리를 보여 줘요. 로그인하지 않은 네이버 PC 검색 화면 기준이고, 블로그 탭은 {RANK_MAX}위까지, 통합검색은 첫 화면의 블로그 글 중 몇 번째인지 봐요. 검색어 하나에 15초쯤 걸려요.
              {data.rssCount >= 0 && data.rssCount < 50 && ` 이 블로그는 최근 글 ${data.rssCount}개만 공개 목록(RSS)에 나와요.`}
            </p>
          </>
        )}
        <Msg m={msg.m} />
        {vol?.needKey && <div className="note info" style={{ marginTop: 8 }}>설정에서 네이버 검색광고 키를 넣으면 검색어마다 한 달 검색량도 같이 보여요. <button className="btn link" style={{ padding: 0 }} onClick={() => go({ page: 'settings' })}>설정으로 가기</button></div>}
        {vol?.error && <div className="note warn" style={{ marginTop: 8 }}>검색량을 받지 못했어요: {vol.error}</div>}
      </div>

      {data?.blogId && rows.length > 0 && (
        <div className="row" style={{ gap: 6, margin: '0 0 10px' }}>
          <button className={`btn small ${view === 'posts' ? 'primary' : ''}`} onClick={() => setView('posts')}>글별로 보기</button>
          <button className={`btn small ${view === 'keywords' ? 'primary' : ''}`} data-testid="rank-view-keywords" onClick={() => setView('keywords')}>검색어별로 보기</button>
        </div>
      )}

      {view === 'keywords' && data && (
        <div className="panel" data-testid="rank-keywords">
          <table className="kw">
            <thead><tr><th>검색어</th><th>월 검색량</th><th>이 블로그 글 순위 (블로그 탭)</th><th>통합검색</th><th>확인</th><th /></tr></thead>
            <tbody>
              {data.keywords.map((k) => {
                const vt = volumeText(volOf(k.keyword)), best = k.posts.filter((p) => p.blogRank != null).slice(0, 3), tot = k.posts.filter((p) => p.totalRank != null).sort((a, b) => a.totalRank! - b.totalRank!)[0];
                return (
                  <tr key={k.keyword}>
                    <td>{k.keyword}<div className="muted" style={{ fontSize: 12 }}>글 {k.usedBy}개가 쓰는 검색어</div></td>
                    <td className="num">{vt ? <span title={vt.detail}>{vt.total}</span> : <span className="muted">—</span>}</td>
                    <td>{!k.checkedAt ? <span className="muted">아직</span> : best.length ? best.map((p) => <div key={p.url}><button className="btn link" title={SHOW_TIP} style={{ padding: 0, fontWeight: 700, color: p.blogRank! <= 10 ? 'var(--ok)' : undefined }} onClick={() => showIn(k.keyword, p.url, 'blog', p.blogRank)}>{p.blogRank}위 ↗</button> <button className="btn link" title="블로그 글 열기" style={{ padding: 0, fontSize: 13 }} onClick={() => open(p.url)}>{p.title}</button></div>) : <span className="muted">{k.seen != null && k.seen < RANK_MAX ? `${k.seen}위까지 봤는데 없음` : `${RANK_MAX}위 안에 없음`}</span>}</td>
                    <td>{tot ? <button className="btn link" title={SHOW_TIP} style={{ padding: 0 }} onClick={() => showIn(k.keyword, tot.url, 'total', tot.totalRank)}>블로그 글 {tot.totalRank}번째 ↗</button> : k.checkedAt ? <span className="muted">없음</span> : ''}</td>
                    <td className="muted" style={{ fontSize: 13 }}>{k.checkedAt ? fmtDate(k.checkedAt) : ''}</td>
                    <td><button className="btn small" disabled={!!busy || recent(k.checkedAt)} title={recent(k.checkedAt) ? '3시간 안에 확인했어요' : ''} onClick={() => runKeywords([k.keyword], `"${k.keyword}" 순위를 확인했어요.`)}>{busy === `kw:${k.keyword}` ? '확인 중…' : '확인'}</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {view === 'posts' && shown.map((r) => (
        <PostCard key={r.url} r={r} volOf={volOf} busy={busy} onCheck={() => checkPost(r)} onDiagnose={(k) => diagnoseRow(r, k)} onKeywords={(k) => setKeywords(r.url, k)} onErr={msg.err} />
      ))}
      {view === 'posts' && rows.length > shown.length && <button className="btn" onClick={() => setMore(true)}>글 {rows.length - shown.length}개 더 보기</button>}
    </>
  );
}

// 최근 글들의 첫 검색어 순위 요약
function Summary({ rows }: { rows: PostRow[] }) {
  const firsts = rows.map((r) => (r.keywords[0] ? r.latest[r.keywords[0]] : undefined));
  const done = firsts.filter(Boolean);
  if (!done.length) return <span className="muted">아직 확인 전이에요.</span>;
  const top10 = done.filter((c) => c!.blogRank != null && c!.blogRank <= 10).length;
  const in90 = done.filter((c) => c!.blogRank != null).length;
  return (
    <span data-testid="rank-summary">
      최근 글 {rows.length}개 중 <b style={{ color: 'var(--ok)' }}>10위 안 {top10}개</b> · 90위 안 {in90}개 · <b style={{ color: in90 < done.length ? 'var(--err)' : undefined }}>안 보임 {done.length - in90}개</b>
      {done.length < rows.length && <span className="muted"> · 확인 전 {rows.length - done.length}개</span>}
    </span>
  );
}

function PostCard({ r, volOf, busy, onCheck, onDiagnose, onKeywords, onErr }: { r: PostRow; volOf: (k: string) => RankVolume | null | undefined; busy: string | null; onCheck: () => void; onDiagnose: (k: string) => Promise<boolean>; onKeywords: (k: string[] | null) => Promise<boolean>; onErr: (e: unknown) => void }) {
  const [editKw, setEditKw] = useState(false);
  const [hist, setHist] = useState(false);
  const [diagKw, setDiagKw] = useState<string | null>(null);
  const checking = r.keywords.some((k) => busy === `kw:${k}`);
  const whyClick = async (k: string) => {
    if (diagKw === k) { setDiagKw(null); return; }
    if (r.diagnoses[k]) { setDiagKw(k); return; }
    if (await onDiagnose(k)) setDiagKw(k);
  };
  return (
    <div className="panel" data-testid="rank-row">
      <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <button className="btn link" style={{ padding: 0, textAlign: 'left', fontWeight: 700 }} onClick={() => open(r.url)}>{r.title || '(제목 없음)'}</button>
          <div className="muted" style={{ fontSize: 13 }}>{day(r.publishedAt)} 발행 · {SOURCE[r.keywordSource]}</div>
        </div>
        <button className="btn small" disabled={!!busy || !r.keywords.length} onClick={onCheck}>{checking ? '확인 중…' : '이 글 순위 확인'}</button>
      </div>

      {!r.keywords.length ? <p className="muted">검색어가 없어요. [검색어 바꾸기]로 넣어 주세요.</p> : (
        <table className="kw" style={{ marginTop: 8 }}>
          <thead><tr><th>검색어</th><th title="네이버 검색광고 기준 최근 한 달 PC + 모바일 검색 수">월 검색량</th><th>블로그 탭</th><th>통합검색</th><th>지난번보다</th><th>확인</th><th /></tr></thead>
          <tbody>
            {r.keywords.map((k) => {
              const c = r.latest[k], ch = c ? changeText(c.blogRank, r.previous[k]?.blogRank) : null;
              const v = volOf(k), vt = volumeText(v);
              const dKey = `diag:${r.url}|${k}`;
              return (
                <tr key={k}>
                  <td>{k}</td>
                  <td className="num" data-testid="rank-volume">{vt ? <><span title={vt.detail}>{vt.total}</span>{v?.competition && <div className="muted" style={{ fontSize: 12 }}>경쟁 {v.competition}</div>}</> : <span className="muted">{v === null ? '정보 없음' : '—'}</span>}</td>
                  <td className="num">{c ? (c.blogRank != null
                      ? <button className="btn link" data-testid="rank-show" title={SHOW_TIP} style={{ padding: 0, fontWeight: 700, color: c.blogRank <= 10 ? 'var(--ok)' : undefined }} onClick={() => showIn(k, r.url, 'blog', c.blogRank)}>{rankText(c.blogRank, c.seen)} ↗</button>
                      : <b>{rankText(c.blogRank, c.seen)}</b>) : <span className="muted">—</span>}
                    {c && c.blogRank == null && c.otherRank != null && <div style={{ fontSize: 12 }}><button className="btn link" title={SHOW_TIP} style={{ padding: 0, fontSize: 12 }} onClick={() => showIn(k, c.otherUrl!, 'blog', c.otherRank)}>우리 다른 글 {c.otherRank}위 ↗</button></div>}
                  </td>
                  <td className="num">{c ? (c.totalRank != null ? <button className="btn link" title={SHOW_TIP} style={{ padding: 0 }} onClick={() => showIn(k, r.url, 'total', c.totalRank)}>블로그 글 {c.totalRank}번째 ↗</button> : <span className="muted">첫 화면에 없음</span>) : <span className="muted">—</span>}</td>
                  <td>{ch ? <span style={{ color: CHANGE_COLOR[ch.kind], fontWeight: 700 }}>{ch.text}</span> : <span className="muted">—</span>}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{c ? fmtDate(c.checkedAt) : '아직'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {c && (c.blogRank == null || c.blogRank > 10 || r.diagnoses[k]) && (
                      <button className="btn small" data-testid="rank-why" disabled={!!busy && busy !== dKey} onClick={() => whyClick(k)}>
                        {busy === dKey ? '분석 중… (30초쯤)' : diagKw === k ? '분석 닫기' : r.diagnoses[k] ? '분석 보기' : '왜 안 나올까?'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {diagKw && r.diagnoses[diagKw] && <DiagnosisView d={r.diagnoses[diagKw]} r={r} busy={!!busy} onRefresh={() => onDiagnose(diagKw)} onKeywords={onKeywords} onErr={onErr} />}
      <div className="row" style={{ gap: 12, marginTop: 6, fontSize: 13 }}>
        <button className="btn link" style={{ padding: 0 }} onClick={() => setEditKw(!editKw)}>검색어 바꾸기</button>
        {Object.keys(r.latest).length > 0 && <button className="btn link" style={{ padding: 0 }} onClick={() => setHist(!hist)}>{hist ? '기록 닫기' : '지난 기록 보기'}</button>}
      </div>
      {editKw && <KeywordForm r={r} onSave={async (k) => { if (await onKeywords(k)) setEditKw(false); }} />}
      {hist && (
        <div style={{ marginTop: 8, fontSize: 13 }}>
          {r.keywords.filter((k) => r.history[k]?.length).map((k) => (
            <div key={k}><b>{k}</b> <span className="muted">블로그 탭</span> {r.history[k].map((c) => `${day(c.checkedAt)} ${rankText(c.blogRank, c.seen)}`).join(' → ')}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function KeywordForm({ r, onSave }: { r: PostRow; onSave: (k: string[] | null) => void }) {
  const [list, setList] = useState(r.keywords);
  const [word, setWord] = useState('');
  const add = () => { const w = word.trim(); if (w && !list.includes(w) && list.length < RANK_KEYWORDS_MAX) setList([...list, w]); setWord(''); };
  return (
    <div className="note info" style={{ marginTop: 8 }}>
      <div style={{ fontSize: 13, marginBottom: 6 }}>맨 앞 검색어로 [최근 글 순위 확인]을 해요. 한 글에 {RANK_KEYWORDS_MAX}개까지.{r.tags.length > 0 && <> 글 태그: {r.tags.slice(0, 8).join(', ')}</>}</div>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {list.map((k) => <span key={k} className="badge">{k} <button className="btn link" style={{ padding: 0 }} onClick={() => setList(list.filter((x) => x !== k))}>✕</button></span>)}
      </div>
      <div className="row" style={{ gap: 6, marginTop: 6 }}>
        <input style={{ flex: 1 }} maxLength={40} placeholder={`검색어 (예: 신대방동 ${APP.term})`} value={word} onChange={(e) => setWord(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <button className="btn small" onClick={add}>추가</button>
        <button className="btn small primary" onClick={() => onSave(list)}>저장</button>
        {r.keywordSource === 'custom' && <button className="btn small" onClick={() => onSave(null)}>자동으로 되돌리기</button>}
      </div>
    </div>
  );
}

const MARK: Record<Finding['status'], [string, string]> = { ok: ['✅', '확인됨'], warn: ['⚠️', '고칠 점'], info: ['💡', '가능성'], unknown: ['❔', '확인 못 함'] };
const KW_PLACE = { front: '앞쪽', back: '뒤쪽', words: '단어만', none: '없음' } as const;
const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

// 원인 분석 결과: 할 일 → 항목(고칠 점 · 가능성 · 확인됨 순) → 상위 글 비교 → 좁은 검색어 추천
function DiagnosisView({ d, r, busy, onRefresh, onKeywords, onErr }: { d: Diagnosis; r: PostRow; busy: boolean; onRefresh: () => void; onKeywords: (k: string[] | null) => Promise<boolean>; onErr: (e: unknown) => void }) {
  const addKw = (k: string) => {
    if (r.keywords.length >= RANK_KEYWORDS_MAX) { onErr(new Error(`한 글에 검색어는 ${RANK_KEYWORDS_MAX}개까지예요. [검색어 바꾸기]에서 하나를 빼 주세요.`)); return; }
    onKeywords([...r.keywords, k]);
  };
  const order: Finding['status'][] = ['warn', 'info', 'ok', 'unknown'];
  const findings = [...d.findings].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  const statRow = (label: string, p: PostStats, mine = false) => (
    <tr key={p.url} style={mine ? { background: 'var(--main-soft)' } : undefined}>
      <td>{mine ? <b>{label}</b> : <button className="btn link" style={{ padding: 0, textAlign: 'left' }} title={p.title} onClick={() => open(p.url)}>{label}</button>}</td>
      <td className="num">{p.chars.toLocaleString('ko-KR')}</td><td className="num">{p.images}</td><td className="num">{p.videos}</td><td>{KW_PLACE[p.kwInTitle ?? 'none']}</td>
      <td className="num">{p.kwCount}번{p.kwWords !== undefined && p.kwWords !== p.kwCount && <span className="muted" style={{ fontSize: 12 }}> (단어별 {p.kwWords}번)</span>}</td>
    </tr>
  );
  return (
    <div className="note info" data-testid="rank-diagnosis" style={{ marginTop: 10 }}>
      <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
        <b>"{d.keyword}" 왜 안 나올까?</b>
        <span className="muted" style={{ fontSize: 13 }}>{fmtDate(d.createdAt)} 분석</span>
        {!isToday(d.createdAt) && <button className="btn link" style={{ padding: 0, marginLeft: 'auto' }} disabled={busy} onClick={onRefresh}>오늘 다시 분석</button>}
      </div>
      {d.todos.length > 0 && (
        <div style={{ margin: '8px 0' }}>
          <div style={{ fontWeight: 700 }}>먼저 해 볼 일</div>
          <ol style={{ margin: '4px 0 0', paddingLeft: 20 }}>{d.todos.map((t) => <li key={t} style={{ fontWeight: 600 }}>{t}</li>)}</ol>
        </div>
      )}
      <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0' }}>
        {findings.map((f) => (
          <li key={f.id} style={{ margin: '3px 0' }} title={MARK[f.status][1]}>
            {MARK[f.status][0]} {f.title}{f.detail && <div className="muted" style={{ fontSize: 13, marginLeft: 24 }}>{f.detail}</div>}
          </li>
        ))}
      </ul>
      {(d.ours || d.top.length > 0) && (
        <table className="kw" style={{ background: 'var(--panel)', marginTop: 6 }}>
          <thead><tr><th>상위 글과 비교</th><th>글자</th><th>사진</th><th>영상</th><th>제목에 검색어</th><th>본문 검색어</th></tr></thead>
          <tbody>
            {d.ours && statRow('이 글', d.ours, true)}
            {d.top.map((p, i) => statRow(`상위 다른 블로그 글 ${i + 1}`, p))}
            {d.avg && <tr><td className="muted">상위 평균</td><td className="num">{Math.round(d.avg.chars).toLocaleString('ko-KR')}</td><td className="num">{Math.round(d.avg.images)}</td><td /><td /><td /></tr>}
          </tbody>
        </table>
      )}
      {d.suggestions.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 700 }}>노려 볼 만한 좁은 검색어</div>
          {d.suggestions.map((s) => (
            <div key={s.keyword} className="row" style={{ gap: 8, alignItems: 'center', marginTop: 4 }}>
              <span className="badge">{s.keyword}</span>
              <span className="muted" style={{ fontSize: 13 }}>{s.volume ? `한 달 ${s.volume} · ` : ''}{s.why}</span>
              {!r.keywords.includes(s.keyword) && <button className="btn link" style={{ padding: 0, fontSize: 13 }} onClick={() => addKw(s.keyword)}>이 글 검색어에 추가</button>}
            </div>
          ))}
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>다음 글은 제목 앞쪽에 넣어 보세요. 예: {d.suggestions[0].keyword} 가을 운동회 이야기</div>
        </div>
      )}
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>네이버는 순위 방식을 공개하지 않아요. ✅ ⚠️는 확인한 사실, 💡는 가능성이에요. 다른 블로그 글은 숫자만 보고 저장하지 않아요.</div>
    </div>
  );
}
