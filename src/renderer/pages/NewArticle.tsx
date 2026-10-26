import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { call, local, type ArticleInput, type DojoProfile, type KeywordRow } from '../api';
import { Chips, Field, Msg, useMsg } from '../components/ui';
import { LockBanner } from '../components/Account';
import { SetupGuide } from '../guide/SetupGuide';
import { ARTICLE_KINDS, AUDIENCES, CARD_STYLES, ENDINGS, TONES, type CardMode, type CardSize, type CardStyle } from '../../shared/types';
import { missingInputs } from '../../shared/validation';
import { hintWords, pickKeywords } from '../../shared/keywords';
import { autoPrefix, dongOf, prefixNames } from '../../shared/areas';
import { buildQuickInput, emptyInput } from '../../shared/quickInput';
import { MicButton } from '../components/MicButton';

// 말로 넣은 글은 적어 둔 메모 뒤에 이어 붙임
const appendSpoken = (prev: string, text: string) => (prev.trim() ? `${prev.trimEnd()} ${text}` : text);

const KEY = 'new-article-form';
export interface CardPref { style: CardStyle; size: CardSize; mode: CardMode }

function srcBadge(s: KeywordRow['source']) {
  const label = { naver: '네이버 조회', ai: 'AI 제안', manual: '직접 입력', demo: '데모 · 가상 값', nearby: '주변 장소' }[s];
  return <span className={`badge ${s === 'naver' ? 'src-naver' : s === 'ai' ? 'src-ai' : s === 'demo' ? 'demo' : ''}`}>{label}</span>;
}

export function NewArticle({ jarvis, onJarvisDone }: { jarvis?: { text: string; n: number } | null; onJarvisDone?: () => void } = {}) {
  const { info, go } = useApp();
  const [guideAt, setGuideAt] = useState<string | null>(null);
  const [profile, setProfile] = useState<DojoProfile | null>(null);
  const saved = local.get<{ input: ArticleInput; keywords: KeywordRow[]; card: CardPref; step: number; memo?: string } | null>(KEY, null);
  const [input, setInput] = useState<ArticleInput>(saved?.input ?? emptyInput());
  const [keywords, setKeywords] = useState<KeywordRow[]>(saved?.keywords ?? []);
  const [card, setCard] = useState<CardPref>(saved?.card ?? { style: '따뜻한 일러스트', size: '1080x1350', mode: 'ai' });
  const [step, setStep] = useState(saved?.step ?? 1);
  const [hint, setHint] = useState(input.topic);
  const [manual, setManual] = useState('');
  const [prefixes, setPrefixes] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [memo, setMemo] = useState(saved?.memo ?? '');
  const msg = useMsg();
  const kwMsg = useMsg();

  useEffect(() => {
    call<DojoProfile | null>('profile:get').then((p) => {
      setProfile(p);
      if (!saved) setInput(emptyInput(p));
      // 도장 정보에 있는 것은 다시 묻지 않음: 비어 있으면 채움
      else if (p) setInput((cur) => ({ ...cur, region: cur.region || p.region, audience: cur.audience || p.audiences[0] || cur.audience }));
    });
  }, []); // eslint-disable-line
  useEffect(() => { call<string[]>('profile:prefixOptions', { region: input.region }).then(setPrefixes).catch(() => {}); }, [input.region, profile]);
  // 작성 중인 입력은 이 컴퓨터에 임시 보관 (종료해도 복원)
  useEffect(() => { local.set(KEY, { input, keywords, card, step, memo }); }, [input, keywords, card, step, memo]);

  const set = (p: Partial<ArticleInput>) => setInput({ ...input, ...p });
  const setF = (p: Partial<ArticleInput['facts']>) => setInput({ ...input, facts: { ...input.facts, ...p } });
  const addRows = (rows: KeywordRow[]) => setKeywords((cur) => [...cur.filter((c) => !rows.some((r) => r.keyword === c.keyword && r.source === c.source)), ...rows]);

  const lookupNaver = async () => {
    const words = (hint.trim() ? hint : input.topic).split(',').map((w) => w.trim()).filter(Boolean).slice(0, 5);
    if (!words.length) return kwMsg.err(new Error('왼쪽 주제를 먼저 적어 주세요'));
    setBusy('naver'); kwMsg.clear();
    try {
      const r = await call<{ rows: KeywordRow[]; demo: boolean; cachedAt?: string }>('keywords:naver', words);
      addRows(r.rows);
      if (r.cachedAt) kwMsg.info(`${new Date(r.cachedAt).toLocaleString()}에 조회한 저장된 결과예요.`);
    } catch (e) { kwMsg.err(new Error(`${(e as Error).message} — 아래에서 키워드를 직접 적어 계속할 수 있어요.`)); }
    setBusy('');
  };
  const aiIdeas = async () => {
    setBusy('ai'); kwMsg.clear();
    try { addRows(await call<KeywordRow[]>('keywords:ai', { region: input.region, topic: input.topic || hint, kind: input.kind })); kwMsg.info('AI 제안에는 검색량이 없어요. 실제 검색량은 네이버 조회로 확인해 주세요.'); } catch (e) { kwMsg.err(e); }
    setBusy('');
  };
  const pickMain = (k: string) => set({ mainKeyword: k, subKeywords: input.subKeywords.filter((x) => x !== k) });
  const toggleSub = (k: string) => {
    if (k === input.mainKeyword) return;
    if (input.subKeywords.includes(k)) set({ subKeywords: input.subKeywords.filter((x) => x !== k) });
    else if (input.subKeywords.length < 2) set({ subKeywords: [...input.subKeywords, k] });
  };

  const naverReady = !!(info.secrets.naverApiKey && info.secrets.naverSecret && info.secrets.naverCustomer);
  // 한 줄 메모 → 칸 나누기. 메모에 없는 칸은 비어 있음 (지어내지 않음). 이미 적은 칸은 덮어쓰지 않음
  const factsMsg = useMsg();
  const fromMemo = async () => {
    setBusy('memo'); factsMsg.clear();
    try {
      const r = await call<Record<string, string>>('facts:fromMemo', { memo, kind: input.kind, topic: input.topic });
      const keep = (cur: string | undefined, v: string | undefined) => (cur && cur.trim() ? cur : v ?? '');
      // 기다리는 동안 고친 다른 칸이 지워지지 않게 그때의 최신 입력에 합침
      setInput((cur) => { const f = cur.facts; return { ...cur, facts: {
        ...f,
        activities: keep(f.activities, r.activities), coachingPoints: keep(f.coachingPoints, r.coachingPoints), scenes: keep(f.scenes, r.scenes),
        values: keep(f.values, r.values), extra: keep(f.extra, r.extra), photoNotes: keep(f.photoNotes, r.photoNotes),
        event: { when: keep(f.event?.when, r.eventWhen), where: keep(f.event?.where, r.eventWhere), who: keep(f.event?.who, r.eventWho), bring: keep(f.event?.bring, r.eventBring), apply: keep(f.event?.apply, r.eventApply) },
        recruit: { who: keep(f.recruit?.who, r.recruitWho), trial: keep(f.recruit?.trial, r.recruitTrial) },
        growth: { before: keep(f.growth?.before, r.growthBefore), now: keep(f.growth?.now, r.growthNow), process: keep(f.growth?.process, r.growthProcess) },
      } }; });
      factsMsg.ok('메모를 칸에 나눠 넣었어요. 메모에 없던 칸은 비워 뒀어요. 맞는지 한 번 읽어 주세요.');
    } catch (e) { factsMsg.err(e); }
    setBusy('');
  };
  const VALUE_CHIPS = ['도전', '끈기', '자신감', '예절', '배려', '집중', '용기', '협동', '책임감'] as const;
  const values = input.facts.values.split(',').map((v) => v.trim()).filter(Boolean);
  const toggleValue = (v: string) => setF({ values: (values.includes(v) ? values.filter((x) => x !== v) : [...values, v].slice(-2)).join(', ') });

  const miss = missingInputs(input);
  const regionDiff = profile && input.region && !input.region.replace(/\s/g, '').includes(profile.region.replace(/\s/g, '')) && !profile.region.replace(/\s/g, '').includes(input.region.replace(/\s/g, ''));

  const start = async () => {
    if (miss.length) { msg.err(new Error(`먼저 채워 주세요: ${miss.join(', ')}`)); return; }
    setBusy('start');
    try {
      const chosen = keywords.filter((k) => k.keyword === input.mainKeyword || input.subKeywords.includes(k.keyword));
      const art = await call<{ id: string }>('article:create', { input, keywords: chosen });
      local.set(`card-pref-${art.id}`, card);
      // 글은 만들었는데 생성 시작이 실패하면 같은 글을 또 만들지 않고 그 글 화면으로 (거기서 다시 시도)
      try { await call('article:generate', art.id); } catch (e) { local.del(KEY); go({ page: 'article', id: art.id }); throw e; }
      local.del(KEY);
      go({ page: 'article', id: art.id });
    } catch (e) { msg.err(e); setBusy(''); }
  };

  // 빠른 작성: 주제(또는 메모) 한 줄 → 도장 정보 + 일반 교육 설명으로 바로 글 + 카드
  const [quick, setQuick] = useState(local.get('quick-memo', ''));
  const [quickCards, setQuickCards] = useState(true);
  const [quickPrefix, setQuickPrefixState] = useState(local.get('quick-prefix', true));
  const setQuickPrefix = (v: boolean) => { setQuickPrefixState(v); local.set('quick-prefix', v); };
  const [detail, setDetail] = useState(false); // 항상 한 줄로 쓰기부터 (자세히 쓰기 입력은 그대로 보관)
  useEffect(() => { local.set('quick-memo', quick); }, [quick]);
  const quickStart = async (text?: string) => {
    const memo = (text ?? quick).trim();
    if (!memo) return;
    setBusy('quick'); msg.clear();
    try {
      // 네이버 검색광고 키가 있으면 실제 검색량으로 키워드 자동 고르기 (실패하면 주제를 키워드로 — buildQuickInput)
      let main = '', subs: string[] = [], chosen: KeywordRow[] = [];
      if (naverReady) {
        setBusy('quick-kw');
        try {
          const r = await call<{ rows: KeywordRow[] }>('keywords:naver', hintWords(memo, profile?.region ?? ''));
          const pick = pickKeywords(r.rows, memo, profile?.region ?? '');
          if (pick.main) { main = pick.main; subs = pick.subs; chosen = r.rows.filter((x) => x.keyword === pick.main || pick.subs.includes(x.keyword)); }
        } catch { /* 키워드 조회가 안 돼도 글은 만듦 */ }
        setBusy('quick');
      }
      // 제목 앞 동네 이름: 글마다 돌아가며 ([신대방동 태권도] → [대길초 근처 태권도] → …)
      const titlePrefix = quickPrefix ? autoPrefix(profile?.region ?? '', profile?.nearbyAreas ?? [], (await call<unknown[]>('article:list').catch(() => [])).length) : '';
      const q = buildQuickInput({ memo, profile, main, subs, withCards: quickCards, titlePrefix });
      const art = await call<{ id: string }>('article:create', { input: q, keywords: chosen });
      local.set(`card-pref-${art.id}`, card);
      // 시작부터 실패하면(키 없음 · 잠김 등) 빈 글로 넘어가지 않고 이 화면에 이유를 보여 줌 (처음 사용자 시험 불편 12)
      try { await call('article:generate', art.id); } catch (e) { await call('article:delete', art.id).catch(() => {}); throw e; }
      local.del('quick-memo');
      go({ page: 'article', id: art.id });
    } catch (e) { msg.err(e); setBusy(''); }
  };
  // 자비스가 넘긴 주제: 도장 정보를 불러온 뒤 한 번만 바로 시작
  useEffect(() => {
    if (!jarvis || !profile || busy) return;
    onJarvisDone?.();
    setDetail(false); setQuick(jarvis.text);
    quickStart(jarvis.text);
  }, [jarvis, profile, busy]); // eslint-disable-line

  const k = input.kind;
  if (!detail) return (
    <>
      <div className="head"><h1>새 글 작성</h1></div>
      <LockBanner />
      {guideAt && <SetupGuide start={guideAt} onClose={() => setGuideAt(null)} />}
      {!info.secrets.openai && <div className="note warn">AI 연결(OpenAI 키)이 아직 안 됐어요. 연결해야 글을 만들 수 있어요. <button className="btn link" onClick={() => setGuideAt('A03')}>🔊 비서와 같이 연결하기</button></div>}
      {!profile && <div className="note warn">도장 정보를 먼저 저장해 주세요. <button className="btn link" onClick={() => go({ page: 'profile' })}>도장 정보로 가기</button></div>}
      <div className="panel">
        <h2>주제 한 줄로 바로 쓰기</h2>
        <p className="hint">주제나 오늘 있었던 일을 한 줄 적으면, 도장 정보(지역 · 경력 · 수업 특징 · 교육 철학)와 함께 1,500자 이상 글을 만들어요 (행사 · 모집 안내는 1,000자 이상). 적지 않은 장면 · 대화 · 수상은 만들지 않으니, 실제 있었던 일을 적을수록 글이 풍성해져요.</p>
        <textarea rows={4} value={quick} onChange={(e) => setQuick(e.target.value)}
          placeholder={['예: 품새 대회 나가서 1학년 친구들이 단체 3등 했어요', '예: 유치부 태권도 몇 살부터 시작하면 좋을까요?', '예: 줄넘기 수행평가 준비'].join(String.fromCharCode(10))} />
        <div className="row" style={{ marginTop: 8 }}><MicButton disabled={!info.secrets.openai || !!busy} onText={(t) => setQuick((q) => appendSpoken(q, t))} /></div>
        <div className="row" style={{ marginTop: 10 }}>
          <label className="row"><input type="checkbox" checked={quickPrefix} onChange={(e) => setQuickPrefix(e.target.checked)} /> 제목 앞에 동네 이름 붙이기 <span className="hint">({prefixNames(profile?.region ?? '', profile?.nearbyAreas ?? []).join(' · ') || '도장 정보에 지역 · 주변 장소가 없어요'} 중 돌아가며{dongOf(profile?.region ?? '') ? `, [${dongOf(profile?.region ?? '')} 태권도]는 세 편에 한 번` : ''})</span></label>
          <label className="row"><input type="checkbox" checked={quickCards} onChange={(e) => setQuickCards(e.target.checked)} /> 카드뉴스 3장도 만들기 {quickCards && card.mode === 'ai' && <span className="hint">(AI 그림 3장 비용 발생)</span>}</label>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn primary" disabled={!quick.trim() || !!busy || !profile} onClick={() => quickStart()}>{busy === 'quick-kw' ? '키워드 고르는 중…' : busy === 'quick' ? '시작하는 중…' : '바로 글 만들기'}</button>
          <span className="hint">지역: {profile?.region ?? '-'} · 문체: {profile?.tone ?? '-'} · 키워드: {naverReady ? '네이버 검색량으로 자동 선택' : '주제 그대로 (설정에 검색광고 키가 없음)'}</span>
        </div>
        <Msg m={msg.m} />
      </div>
      <div className="row"><button className="btn" onClick={() => setDetail(true)}>자세히 쓰기 (글 종류 · 키워드 · 재료를 직접 고르기)</button></div>
    </>
  );
  return (
    <>
      <div className="head">
        <h1>새 글 작성</h1>
        <span className="sp" />
        <button className="btn small" onClick={() => setDetail(false)}>← 한 줄로 쓰기</button>
        <button className="btn small" onClick={() => { if (confirm('입력한 내용을 비울까요?')) { local.del(KEY); setInput(emptyInput(profile)); setKeywords([]); setStep(1); } }}>새로 쓰기</button>
      </div>
      <LockBanner />
      {!profile && <div className="note warn">도장 정보를 먼저 저장해 주세요. <button className="btn link" onClick={() => go({ page: 'profile' })}>도장 정보로 가기</button></div>}

      <div className="steps">
        {['1 주제 · 키워드', '2 실제 재료', '3 생성 설정'].map((t, i) => <button key={t} className={`step ${step === i + 1 ? 'on' : ''}`} onClick={() => setStep(i + 1)}>{t}</button>)}
      </div>

      {step === 1 && (
        <div className="split">
          <div className="panel">
            <Field label="글 종류" req><Chips options={ARTICLE_KINDS} value={input.kind} onChange={(v) => set({ kind: v })} /></Field>
            <Field label="주요 독자" req><Chips options={AUDIENCES} value={input.audience as any} onChange={(v) => set({ audience: v })} /></Field>
            <Field label="목표 지역" req hint={regionDiff ? `도장 소재지(${profile!.region})와 달라요. 글에는 그 지역에 있다고 쓰지 않아요.` : '도장 소재지가 기본값이에요'}>
              <input type="text" value={input.region} onChange={(e) => set({ region: e.target.value })} />
            </Field>
            <Field label="주제" req hint="예: 태극 1·2장 품새 발표 수업"><input type="text" value={input.topic} onChange={(e) => { set({ topic: e.target.value }); if (!hint || hint === input.topic) setHint(e.target.value); }} /></Field>
            <Field label="제목 앞 동네 이름 (선택)" hint="고른 그대로 제목 앞에 붙여요 (AI가 만들지 않음). 후보는 도장 정보의 주변 장소에서 와요">
              <select value={input.titlePrefix ?? ''} onChange={(e) => set({ titlePrefix: e.target.value })}>
                <option value="">붙이지 않음</option>
                {prefixes.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
          </div>
          <div className="panel">
            <h3>키워드</h3>
            <p className="hint">지역 · 수업에 맞는지를 먼저 보고, 검색량은 참고만 해 주세요. 광고 경쟁 정도는 블로그 난이도가 아니에요.</p>
            <div className="row" style={{ marginBottom: 8 }}>
              <input className="grow" type="text" value={hint} onChange={(e) => setHint(e.target.value)} placeholder={input.topic ? `비우면 주제로 조회: ${input.topic}` : '조회할 단어 (쉼표로 최대 5개)'} />
              <button className="btn small" disabled={!!busy || !naverReady} title={naverReady ? '' : '설정에 검색광고 키가 없어요'} onClick={lookupNaver}>{busy === 'naver' ? '조회 중…' : '네이버 조회'}</button>
              <button className="btn small" disabled={!!busy} onClick={aiIdeas}>{busy === 'ai' ? '제안 중…' : 'AI 제안'}</button>
            </div>
            <div className="row" style={{ marginBottom: 8 }}>
              <input className="grow" type="text" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="직접 입력" onKeyDown={(e) => { if (e.key === 'Enter' && manual.trim()) { addRows([{ keyword: manual.trim(), source: 'manual' }]); setManual(''); } }} />
              <button className="btn small" disabled={!manual.trim()} onClick={() => { addRows([{ keyword: manual.trim(), source: 'manual' }]); setManual(''); }}>추가</button>
            </div>
            {!naverReady && <p className="hint">검색광고 키가 없어 네이버 조회는 꺼져 있어요. [AI 제안]이나 직접 입력을 쓰거나, 키워드 없이 넘어가도 돼요 (주제를 키워드로 써요).</p>}
            <Msg m={kwMsg.m} />
            {keywords.length > 0 && (
              <div style={{ maxHeight: 360, overflow: 'auto' }}>
                <table className="kw">
                  <thead><tr><th>주요</th><th>보조</th><th>키워드</th><th>PC</th><th>모바일</th><th>광고 경쟁</th><th>출처</th></tr></thead>
                  <tbody>
                    {keywords.map((r) => (
                      <tr key={r.source + r.keyword}>
                        <td><input type="radio" checked={input.mainKeyword === r.keyword} onChange={() => pickMain(r.keyword)} /></td>
                        <td><input type="checkbox" checked={input.subKeywords.includes(r.keyword)} disabled={r.keyword === input.mainKeyword || (!input.subKeywords.includes(r.keyword) && input.subKeywords.length >= 2)} onChange={() => toggleSub(r.keyword)} /></td>
                        <td>{r.keyword}{r.cached && <span className="hint"> (저장된 결과)</span>}</td>
                        <td className="num">{r.pc ?? '–'}</td><td className="num">{r.mobile ?? '–'}</td><td>{r.competition ?? '–'}</td>
                        <td>{srcBadge(r.source)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="hint" style={{ marginTop: 8 }}>주요 키워드: <b>{input.mainKeyword || (input.topic ? `${input.topic} (주제 그대로)` : '없음')}</b> · 보조: {input.subKeywords.join(', ') || '없음'} (최대 2개)</p>
            {keywords.some((r) => r.fetchedAt) && <p className="hint">조회 시각: {new Date(keywords.find((r) => r.fetchedAt)!.fetchedAt!).toLocaleString()}</p>}
            <button className="btn primary" onClick={() => setStep(2)}>다음: 실제 재료</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="panel">
          <div className="panel" style={{ background: 'var(--main-soft)', borderColor: 'transparent' }}>
            <h3>한 줄 메모로 채우기</h3>
            <p className="hint">오늘 수업에서 있었던 일을 말하듯 적고 버튼을 누르면 아래 칸에 나눠 넣어요. 메모에 없는 내용은 만들지 않아요.</p>
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={3}
              placeholder={k === '성장 이야기' ? '예: 6살 친구가 처음엔 엄마랑 안 떨어지려고 울었는데, 3주 동안 인사부터 같이 했더니 이제 혼자 들어와서 큰 소리로 인사해요. 자신감 전하고 싶어요' : '예: 오늘 유치부 앞차기 연습했어요. 무릎 먼저 올리라고 계속 말해줬고, 한 친구가 처음엔 못 하다가 끝에 제대로 찼어요. 도전 전하고 싶어요'} />
            <div className="row" style={{ marginTop: 8 }}>
              <MicButton disabled={!info.secrets.openai || !!busy} onText={(t) => setMemo((m) => appendSpoken(m, t))} />
              <button className="btn primary small" disabled={!memo.trim() || !!busy} onClick={fromMemo}>{busy === 'memo' ? '나누는 중…' : '메모로 칸 채우기'}</button>
              <span className="hint">이미 적어 둔 칸은 그대로 둬요.</span>
            </div>
            <Msg m={factsMsg.m} />
          </div>
          <p className="note info">여기 적은 사실로만 글을 써요. 적지 않은 장면 · 대화 · 수상 · 경력 · 가격 · 일정은 만들지 않아요. 아이 이름은 적지 않아도 되고, 적어도 글에는 익명으로 써요.</p>
          <div className="grid2">
            <Field label="진행 활동" req={k === '수업 후기'} hint="예: 태극 1·2장, 발표 연습"><textarea value={input.facts.activities} onChange={(e) => setF({ activities: e.target.value })} /></Field>
            <Field label="지도 포인트" hint="구체적으로 (예: 방향을 보고 움직이기)"><textarea value={input.facts.coachingPoints} onChange={(e) => setF({ coachingPoints: e.target.value })} /></Field>
            <Field label="관찰 장면" hint="실제로 본 장면. 없으면 비워 두세요 (사례를 만들지 않아요)"><textarea value={input.facts.scenes} onChange={(e) => setF({ scenes: e.target.value })} /></Field>
            <Field label="전달 가치" hint="눌러서 고르기 (최대 2개) 또는 직접 적기">
              <div className="chips" style={{ marginBottom: 6 }}>{VALUE_CHIPS.map((v) => <button type="button" key={v} className={`chip ${values.includes(v) ? 'on' : ''}`} onClick={() => toggleValue(v)}>{v}</button>)}</div>
              <input type="text" value={input.facts.values} onChange={(e) => setF({ values: e.target.value })} />
            </Field>
            <Field label="추가 안내" hint="준비물, 행사 일정 등 사실"><textarea value={input.facts.extra} onChange={(e) => setF({ extra: e.target.value })} /></Field>
            <Field label="사진 설명 (선택)" hint="실제 사진 내용. 사진 넣을 자리 제안에만 써요"><input type="text" value={input.facts.photoNotes} onChange={(e) => setF({ photoNotes: e.target.value })} /></Field>
          </div>
          {k === '행사 안내' && (
            <div className="grid2">
              {(['when', 'where', 'who', 'bring', 'apply'] as const).map((f) => (
                <Field key={f} label={{ when: '일시', where: '장소', who: '대상', bring: '준비물', apply: '신청 방법' }[f]} req={f !== 'bring'}>
                  <input type="text" value={input.facts.event?.[f] ?? ''} onChange={(e) => setF({ event: { ...input.facts.event!, [f]: e.target.value } })} />
                </Field>
              ))}
            </div>
          )}
          {k === '모집 안내' && (
            <div className="grid2">
              <Field label="모집 대상" req><input type="text" value={input.facts.recruit?.who ?? ''} onChange={(e) => setF({ recruit: { ...input.facts.recruit!, who: e.target.value } })} /></Field>
              <Field label="체험 방법"><input type="text" value={input.facts.recruit?.trial ?? ''} onChange={(e) => setF({ recruit: { ...input.facts.recruit!, trial: e.target.value } })} /></Field>
            </div>
          )}
          {k === '성장 이야기' && (
            <div className="grid2">
              <Field label="이전 모습" req><textarea value={input.facts.growth?.before ?? ''} onChange={(e) => setF({ growth: { ...input.facts.growth!, before: e.target.value } })} /></Field>
              <Field label="현재 관찰" req><textarea value={input.facts.growth?.now ?? ''} onChange={(e) => setF({ growth: { ...input.facts.growth!, now: e.target.value } })} /></Field>
              <Field label="지도 과정"><textarea value={input.facts.growth?.process ?? ''} onChange={(e) => setF({ growth: { ...input.facts.growth!, process: e.target.value } })} /></Field>
            </div>
          )}
          <div className="row"><button className="btn" onClick={() => setStep(1)}>이전</button><button className="btn primary" onClick={() => setStep(3)}>다음: 생성 설정</button></div>
        </div>
      )}

      {step === 3 && (
        <div className="split">
          <div className="panel">
            <Field label="문체"><Chips options={TONES} value={input.tone} onChange={(v) => set({ tone: v })} /></Field>
            <Field label="마무리"><Chips options={ENDINGS} value={input.ending as any} onChange={(v) => set({ ending: v })} /></Field>
            <Field label="이번 글에 넣을 도장 정보" hint="도장 정보는 매 글에 무조건 넣지 않아요">
              <div className="chips">
                {([['philosophy', '교육 철학'], ['classFeatures', '수업 특징'], ['credentials', '경력 · 자격'], ['contact', '연락처 · 상담 링크'], ['address', '상세 주소']] as const).map(([key, label]) => (
                  <button key={key} type="button" className={`chip ${input.includeProfile[key] ? 'on' : ''}`} onClick={() => set({ includeProfile: { ...input.includeProfile, [key]: !input.includeProfile[key] } })}>{label}</button>
                ))}
              </div>
            </Field>
            <p className="hint">분량: 본문 공백 제외 최소 1,500자, 목표 1,800~2,200자 (행사 · 모집 안내는 최소 1,000자, 목표 1,200~1,600자). 모자라면 사실을 더하지 않고 최대 2번 보완해요.</p>
          </div>
          <div className="panel">
            <Field label="만들 것"><Chips options={['글만', '글 + 카드 3장'] as const} value={input.withCards ? '글 + 카드 3장' : '글만'} onChange={(v) => set({ withCards: v !== '글만' })} /></Field>
            {input.withCards && (
              <>
                <Field label="카드 스타일"><Chips options={CARD_STYLES} value={card.style} onChange={(v) => setCard({ ...card, style: v })} /></Field>
                <Field label="크기"><Chips options={['1080x1350', '1080x1080'] as const} value={card.size} onChange={(v) => setCard({ ...card, size: v })} /></Field>
                <Field label="배경" hint={card.mode === 'ai' ? 'AI가 글자 없는 그림을 그리고, 한글 · 로고는 프로그램이 얹어요 (그림 3장 비용 발생)' : 'AI 그림 없이 색 · 모양 템플릿 (그림 비용 없음)'}>
                  <Chips options={['AI 배경', '템플릿'] as const} value={card.mode === 'ai' ? 'AI 배경' : '템플릿'} onChange={(v) => setCard({ ...card, mode: v === 'AI 배경' ? 'ai' : 'template' })} />
                </Field>
              </>
            )}
            {miss.length > 0 && <div className="note warn">먼저 채워 주세요: {miss.join(', ')}</div>}
            <div className="row">
              <button className="btn" onClick={() => setStep(2)}>이전</button>
              <button className="btn primary" disabled={!!busy || miss.length > 0 || !profile} onClick={start}>{busy === 'start' ? '시작하는 중…' : '글 만들기'}</button>
            </div>
            <Msg m={msg.m} />
          </div>
        </div>
      )}
    </>
  );
}
