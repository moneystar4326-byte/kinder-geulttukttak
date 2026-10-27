import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../App';
import { call, local, onJob, type ArticleBundle, type Job } from '../api';
import { fmtDate, JobBar, Msg, useMsg } from '../components/ui';
import { DocEditor, type Draft, type ParaSel } from '../editor/DocEditor';
import { TypingStage } from '../editor/TypingStage';
import { CardsPanel, type CardPref } from '../components/CardsPanel';
import { FirstTip } from '../guide/voice';
import { localFlags } from '../../shared/validation';
import type { DojoProfile, RevisionKind } from '../../shared/types';
import { APP } from '../../shared/kinder';

const same = (a: Draft | null, b: Draft | null) => JSON.stringify(a) === JSON.stringify(b);

export function ArticlePage({ id }: { id: string }) {
  const { info } = useApp();
  const [b, setB] = useState<ArticleBundle | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState<Draft | null>(null); // 마지막으로 저장된 내용
  const [dismissed, setDismissed] = useState<string | null>(null); // 닫은 'AI 결과 따로 저장' 안내
  const [job, setJob] = useState<Job | null>(null);
  const [cardJob, setCardJob] = useState<Job | null>(null);
  const [naverJob, setNaverJob] = useState<Job | null>(null);
  const [sel, setSel] = useState<ParaSel | null>(null);
  const [instr, setInstr] = useState('');
  const [typing, setTyping] = useState(false);
  const [profile, setProfile] = useState<DojoProfile | null>(null);
  const [pref, setPrefState] = useState<CardPref>(local.get(`card-pref-${id}`, { style: '따뜻한 일러스트', size: '1080x1350', mode: 'ai' } as CardPref));
  const [exp, setExp] = useState({ txt: true, md: false, cards: true, zip: false });
  const msg = useMsg();
  const naverMsg = useMsg();
  const dirty = !!draft && !same(draft, saved);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const loadSeq = useRef(0);
  const autoCards = useRef(false);
  const setPref = (p: CardPref) => { setPrefState(p); local.set(`card-pref-${id}`, p); };

  const load = useCallback(async (force = false) => {
    const seq = ++loadSeq.current; // 늦게 출발한 응답이 먼저 와도 마지막 요청만 반영
    const nb = await call<ArticleBundle>('article:get', id);
    if (seq !== loadSeq.current) return nb;
    setB(nb);
    const v = nb.version;
    const d = v ? { title: v.title, doc: v.doc } : null;
    if (force || !dirtyRef.current) { setDraft(d); setSaved(d); setSel(null); }
    const latest = (t: Job['type'][]) => nb.jobs.find((j) => t.includes(j.type)) ?? null;
    setJob((cur) => cur ?? latest(['article', 'revise']));
    setCardJob((cur) => cur ?? latest(['cards', 'card']));
    setNaverJob((cur) => cur ?? latest(['naver']));
    return nb;
  }, [id]);

  useEffect(() => { load(true); call<DojoProfile | null>('profile:get').then(setProfile); }, [id]); // eslint-disable-line

  // 작업 알림
  useEffect(() => onJob((j) => {
    const mine = j.entityId === id || b?.cardSet?.cards.some((c) => c.id === j.entityId);
    if (!mine) return;
    if (j.type === 'article' || j.type === 'revise') setJob(j);
    else if (j.type === 'cards' || j.type === 'card') setCardJob(j);
    else if (j.type === 'naver') setNaverJob(j);
    if (j.type === 'cards' || j.type === 'card') load(); // 카드 1/3, 2/3 … 진행 보이기
    if (j.state !== 'running' && j.state !== 'queued') load();
  }), [id, b, load]);

  // 글 생성이 끝나면 (글 + 카드를 골랐을 때) 카드를 자동으로 시작 — 한 번만
  useEffect(() => {
    if (!b || !b.version || b.cardSet || !b.article.input.withCards) return;
    if (job?.type !== 'article' || job.state !== 'succeeded') return;
    const flag = `cards-auto-${id}`;
    if (autoCards.current || local.get(flag, false)) return;
    autoCards.current = true;
    // 표시는 성공한 뒤에만 남김 (바로 실패하면 다음에 다시 자동 시작)
    call('cards:plan', { articleId: id, style: pref }).then(() => { local.set(flag, true); load(); }).catch((e) => { autoCards.current = false; msg.err(e); });
  }, [b, job]); // eslint-disable-line

  // 자동 저장 (멈추고 2.5초 뒤). 같은 편집 묶음은 한 버전에 덮어씀
  useEffect(() => {
    if (!dirty || !draft) return;
    const t = setTimeout(() => save(), 2500);
    return () => clearTimeout(t);
  }, [draft]); // eslint-disable-line
  // 다른 화면으로 옮기면 저장 안 된 편집을 바로 저장 (2.5초 자동 저장을 기다리다 사라지던 문제)
  useEffect(() => () => {
    const d = draftRef.current;
    if (dirtyRef.current && d) call('article:saveEdit', { id, title: d.title, doc: d.doc }).catch(() => {});
  }, [id]);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirtyRef.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);

  async function save() {
    if (!draft) return;
    const snapshot = draft;
    try {
      await call('article:saveEdit', { id, title: snapshot.title, doc: snapshot.doc });
      setSaved(snapshot);
      const nb = await call<ArticleBundle>('article:get', id);
      setB(nb);
    } catch (e) { msg.err(e); }
  }

  const running = (j: Job | null) => !!j && (j.state === 'running' || j.state === 'queued');
  const busy = running(job);

  async function revise(kind: RevisionKind) {
    if (!b?.version) return;
    if (dirty) await save();
    try {
      const nb = await call<ArticleBundle>('article:get', id);
      const j = await call<Job>('article:revise', { id, kind, baseVersionId: nb.article.currentVersionId, ...(kind === 'paragraph' ? { sectionId: sel?.sectionId, paragraphIndex: sel?.index, instruction: instr } : {}) });
      setJob(j);
    } catch (e) { msg.err(e); }
  }
  async function regenerate() {
    // 아직 글이 없으면 묻지 않고 바로 만듦 (처음 사용자 시험 · 빈 글에 "다시 만들까요?"가 어색함)
    if (b?.version && !confirm('입력한 재료로 글을 처음부터 다시 만들까요? 지금 글은 이력에 남아요.')) return;
    if (dirty) await save();
    try { setJob(await call<Job>('article:generate', id)); } catch (e) { msg.err(e); }
  }
  async function undo() {
    if (!b || b.versions.length < 2) return;
    const idx = b.versions.findIndex((v) => v.id === b.article.currentVersionId);
    const prev = b.versions[idx + 1];
    if (!prev) return;
    setDismissed(b.versions[0]?.id ?? null); // 직접 되돌렸으니 'AI 결과 따로 저장' 안내는 닫음
    try {
      await call('article:setCurrent', { id, versionId: prev.id });
      await load(true);
      msg.info(`"${prev.note}" 버전(${fmtDate(prev.createdAt)})으로 되돌렸어요.`);
    } catch (e) { msg.err(e); }
  }
  async function copy(part: 'all' | 'body' | 'title' | 'tags') {
    if (dirty) await save();
    try {
      const nb = await call<ArticleBundle>('article:get', id); await call('article:copy', { versionId: nb.article.currentVersionId, part }); msg.ok({ all: '제목 · 본문 · 태그를', body: '본문을', title: '제목을', tags: '태그를' }[part] + ' 복사했어요.'); } catch (e) { msg.err(e); }
  }
  const [naverTyping, setNaverTypingState] = useState(local.get('naver-typing', false));
  const [naverMap, setNaverMapState] = useState(local.get('naver-map', true));
  const setNaverMap = (v: boolean) => { setNaverMapState(v); local.set('naver-map', v); };
  const setNaverTyping = (v: boolean) => { setNaverTypingState(v); local.set('naver-typing', v); };
  async function naverFill(onExisting: 'stop' | 'new') {
    if (dirty) await save();
    naverMsg.clear();
    try { setNaverJob(await call<Job>('naver:fill', { articleId: id, onExisting, typing: naverTyping, map: naverMap })); } catch (e) { naverMsg.err(e); }
  }
  async function exportNow() {
    if (dirty) await save();
    try {
      const nb = await call<ArticleBundle>('article:get', id); const files = await call<string[]>('export:run', { versionId: nb.article.currentVersionId, cardSetId: nb.cardSet?.id ?? null, kinds: exp }); msg.ok(`${files.length}개 파일을 저장했어요: ${info.settings.saveDir}`); } catch (e) { msg.err(e); }
  }

  if (!b) return <p className="muted">불러오는 중…</p>;
  const flags = draft && profile ? [...draft.doc.reviewFlags.filter((f) => !/^(too-short|banned|avoid-word|repeat|keyword-heavy|fee|child-name)$/.test(f.code)), ...localFlags(draft.doc, profile, b.article.input)] : draft?.doc.reviewFlags ?? [];
  const cardsDone = b.cardSet?.cards.filter((c) => c.status === 'done').length ?? 0;
  // 가장 최근 버전이 AI 결과인데 현재 버전이 아니면 (고치는 동안 도착) 알려 줌
  const newest = b.versions[0];
  // 방금 끝난 AI 작업이 만든 버전일 때만 (되돌리기로 옛 버전을 고른 경우에는 띄우지 않음)
  const aiAside = job?.state === 'succeeded' && newest && newest.createdAt >= job.startedAt && newest.id !== b.article.currentVersionId && newest.note !== '직접 편집' && newest.id !== dismissed ? newest : null;

  return (
    <>
      <div className="head">
        <h1 style={{ maxWidth: 760 }}>{draft?.title || b.article.input.topic}</h1>
        {b.article.demo && <span className="badge demo">데모 · 샘플 글</span>}
        <span className={`badge ${b.article.status === 'ready' ? 'ok' : 'warn'}`}>{{ draft: '입력 중', generating: '글 생성 중', validating: '검증 중', review: '검토 필요', ready: '완료' }[b.article.status]}</span>
        <span className="sp" />
        <span className="hint">{dirty ? '저장 안 됨 (곧 자동 저장)' : saved ? '저장됨' : ''}</span>
      </div>
      <JobBar job={job} />
      {aiAside && <div className="note warn">AI 결과("{aiAside.note}")가 이력에 따로 저장됐어요. 그동안 고친 글이 있어서 바꾸지 않았어요. <button className="btn link" onClick={async () => { try { if (dirty) await save(); await call('article:setCurrent', { id, versionId: aiAside.id }); await load(true); } catch (e) { msg.err(e); } }}>AI 결과로 바꾸기</button> <button className="btn link" onClick={() => setDismissed(aiAside.id)}>닫기</button></div>}
      {!draft && !busy && <div className="note info">아직 글이 없어요. <button className="btn link" onClick={regenerate}>글 만들기</button></div>}
      {draft && <FirstTip id="A11" />}

      {draft && (
        <div className="split">
          <div className="panel">
            <FirstTip id="F03" />
            <div className="toolbar">
              <button className="btn small" disabled={busy} onClick={() => revise('warmer')}>더 따뜻하게</button>
              <button className="btn small" disabled={busy} onClick={() => revise('professional')}>더 전문적으로</button>
              <button className="btn small" disabled={busy} onClick={() => revise('less-promo')}>홍보 줄이기</button>
              <button className="btn small" disabled={busy} onClick={() => revise('titles')}>제목 재생성</button>
              <button className="btn small" disabled={busy || b.versions.length < 2} onClick={undo}>실행 취소</button>
              <button className="btn small" disabled={!dirty} onClick={save}>저장</button>
              <button className="btn small" disabled={busy} onClick={regenerate}>처음부터 다시</button>
            </div>
            <div className="row" style={{ marginBottom: 12 }}>
              <input className="grow" type="text" value={instr} onChange={(e) => setInstr(e.target.value)} placeholder={sel ? '선택한 문단을 어떻게 고칠까요? (예: 더 짧게)' : '고칠 문단을 먼저 클릭해 주세요'} />
              <button className="btn small" disabled={busy || !sel} onClick={() => revise('paragraph')}>선택 문단 수정</button>
            </div>
            {busy && <p className="note info">AI가 고치는 중이라 잠시 편집을 막아 둘게요. 끝나면 바로 고칠 수 있어요.</p>}
            <DocEditor draft={draft} onChange={setDraft} sel={sel} onSelect={setSel} prefix={b.article.input.titlePrefix} readOnly={busy} kind={b.article.input.kind} />
          </div>

          <div>
            <div className="panel">
              <h2>점검 결과</h2>
              <p style={{ marginBottom: 10 }}><b>키워드</b> 주요 "{b.article.input.mainKeyword}"{b.article.input.subKeywords.length ? ` · 보조 "${b.article.input.subKeywords.join('", "')}"` : ''}
                {b.article.keywords.length > 0 && <span className="hint"> — 월 검색량 {b.article.keywords.map((k) => `${k.keyword} PC ${k.pc ?? '–'} · 모바일 ${k.mobile ?? '–'}`).join(' / ')}{b.article.keywords[0]?.source === 'demo' ? ' (데모 · 가상 값)' : ' (네이버 검색광고)'}</span>}</p>
              <p className="hint">AI 보조 점검과 프로그램 검사예요. 사실 여부를 완전히 보증하지 않으니 직접 한 번 읽어 주세요.</p>
              {flags.length ? <ul className="flags">{flags.map((f, i) => <li key={i}><span className={`badge ${f.code === 'demo' ? 'demo' : 'warn'}`}>{f.code === 'demo' ? '데모' : '확인'}</span> {f.message}</li>)}</ul> : <p className="badge ok">확인할 점을 찾지 못했어요</p>}
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn small" onClick={() => call('article:markReady', id).then(() => load())}>검토 완료로 표시</button>
              </div>
            </div>

            <div className="panel">
              <h2>복사 · 내보내기</h2>
              <div className="row" style={{ marginBottom: 10 }}>
                <button className="btn small primary" onClick={() => copy('all')}>전체 복사</button>
                <button className="btn small" onClick={() => copy('title')}>제목만</button>
                <button className="btn small" onClick={() => copy('body')}>본문만</button>
                <button className="btn small" onClick={() => copy('tags')}>태그만</button>
                <button className="btn small" onClick={() => setTyping(true)}>타이핑 연출</button>
              </div>
              <div className="row">
                {(['txt', 'md', 'cards', 'zip'] as const).map((k) => <label key={k} className="row"><input type="checkbox" checked={exp[k]} onChange={(e) => setExp({ ...exp, [k]: e.target.checked })} />{{ txt: 'TXT', md: 'Markdown', cards: '카드 PNG', zip: '전체 ZIP' }[k]}</label>)}
                <button className="btn small" onClick={exportNow}>내보내기</button>
              </div>
              <p className="hint">저장 위치: {info.settings.saveDir} (같은 이름이 있으면 덮어쓰지 않고 번호를 붙여요)</p>
            </div>

            <div className="panel">
              <h2>네이버 블로그에 초안 입력</h2>
              <FirstTip id="F01" />
              <p>제목 · 본문 · 카드를 네이버 편집기에 넣고 멈춰요. <b>저장 · 발행은 {APP.owner}이 직접</b> 눌러 주세요.</p>
              <p className="hint">처음이면 열린 창에서 직접 로그인해 주세요 (최대 5분 기다려요). 편집기에 쓰던 글이 있으면 덮어쓰지 않아요.</p>
              <JobBar job={naverJob} />
              {naverJob?.state === 'succeeded' && <div className={`note ${/못해|빠졌|사진 없이/.test(naverJob.step ?? '') ? 'warn' : 'ok'}`}>{naverJob.step} — 네이버 창에서 내용을 확인한 뒤 직접 저장 · 발행해 주세요. (프로그램은 네이버 저장 여부를 확인하지 않아요)</div>}
              {naverJob?.state === 'failed' && naverJob.errorCode === 'existing-draft' && (
                <div className="row" style={{ marginBottom: 10 }}>
                  <button className="btn small" onClick={() => naverFill('new')}>쓰던 글은 두고 새 글로 시작해서 넣기</button>
                  <span className="hint">네이버의 "작성 중인 글" 창에서 이어 쓰지 않고 새 글로 열어요. 편집기에 이미 내용이 있으면 그래도 멈춰요.</span>
                </div>
              )}
              <div className="row">
                <button className="btn primary" disabled={running(naverJob) || !b.version} onClick={() => naverFill('new')}>네이버에 초안 입력</button>
                <button className="btn small" onClick={() => call('naver:openLogin').catch((e) => naverMsg.err(e))}>네이버 창 열기 · 로그인</button>
              </div>
              <label className="row" style={{ marginTop: 8 }}><input type="checkbox" checked={naverMap} onChange={(e) => setNaverMap(e.target.checked)} /> 글 끝에 {APP.place} 지도 넣기 (네이버 지도 카드)</label>
              <label className="row"><input type="checkbox" checked={naverTyping} onChange={(e) => setNaverTyping(e.target.checked)} /> 타이핑처럼 넣기 (촬영용 · 초당 {info.settings.typingSpeed}자, 설정에서 속도 변경)</label>
              {naverTyping && draft && <p className="hint">본문 {draft.doc.sections.reduce((n, s) => n + (s.heading?.length ?? 0) + s.paragraphs.join('').length, 0).toLocaleString()}자 → 약 {Math.ceil(draft.doc.sections.reduce((n, s) => n + (s.heading?.length ?? 0) + s.paragraphs.join('').length, 0) / info.settings.typingSpeed / 60)}분 걸려요. 입력 중에는 네이버 창을 누르지 마세요.</p>}
              <p className="hint">네이버가 "작성 중인 글"을 물으면 새 글로 시작해요 (쓰던 글은 네이버 임시저장에 남아요). 편집기에 이미 글자가 있으면 덮어쓰지 않고 멈춰요.</p>
              {b.cardSet && cardsDone < 3 && <p className="hint">완성된 카드 {cardsDone}장만 넣어요.</p>}
              <Msg m={naverMsg.m} />
              <p className="hint" style={{ marginTop: 8 }}>자동 입력이 안 되면: [전체 복사]로 붙여넣고, 카드는 [PNG 저장]으로 받아 직접 올리면 돼요.</p>
            </div>

            <div className="panel">
              <h2>버전 이력</h2>
              {b.versions.map((v) => (
                <div className="list-row" key={v.id}>
                  <div className="t"><b>{v.note}</b><span className="muted">{fmtDate(v.createdAt)} · 공백 제외 {v.counts.withoutSpaces.toLocaleString()}자</span></div>
                  {v.id === b.article.currentVersionId ? <span className="badge ok">현재</span> : <button className="btn small" onClick={async () => { try { if (dirty) await save(); setDismissed(b.versions[0]?.id ?? null); await call('article:setCurrent', { id, versionId: v.id }); await load(true); } catch (e) { msg.err(e); } }}>이 버전으로</button>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <Msg m={msg.m} />

      {(b.version || b.cardSet) && (
        <>
          <JobBar job={cardJob} />
          <CardsPanel articleId={id} cs={b.cardSet} pref={pref} setPref={setPref} busy={running(cardJob)} onChanged={() => load()} hasVersion={!!b.version} kind={b.article?.input?.kind} />
        </>
      )}

      {typing && draft && <TypingStage title={draft.title} doc={draft.doc} speed={info.settings.typingSpeed} onClose={() => setTyping(false)} />}
    </>
  );
}
