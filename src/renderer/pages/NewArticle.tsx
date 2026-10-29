import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { call, local, type ArticleInput, type DojoProfile, type KeywordRow } from '../api';
import { Chips, Field, Msg, useMsg } from '../components/ui';
import { LockBanner } from '../components/Account';
import { SetupGuide } from '../guide/SetupGuide';
import { ARTICLE_KINDS, AUDIENCES, CARD_STYLES, ENDINGS, TONES, type ArticleBrief, type CardMode, type CardSize, type CardStyle, type KeywordPlanItem } from '../../shared/types';
import { fallbackKeyword, missingInputs } from '../../shared/validation';
import { foreignKeyword, hintWords, pickKeywords, planCandidates } from '../../shared/keywords';
import { autoPrefix, dongOf, prefixNames } from '../../shared/areas';
import { buildQuickInput, emptyInput, thinMemo } from '../../shared/quickInput';
import { MicButton } from '../components/MicButton';
import { APP, kindLabel, writerLabel, type Writer } from '../../shared/kinder';

// 말로 넣은 글은 적어 둔 메모 뒤에 이어 붙임
const appendSpoken = (prev: string, text: string) => (prev.trim() ? `${prev.trimEnd()} ${text}` : text);

// 화면 문구
const TX = {
  thinMemo: '아이들이 가장 좋아한 것이나 기억에 남는 장면을 한 줄만 더 적으면 글이 훨씬 구체적으로 나와요. (예: 분수대 앞에서 비눗방울을 불었어요)',
  quickPh: ['예: 햇님반 친구들이랑 가을 낙엽 밟기 놀이를 했어요', '예: 7세반 아이 초등학교 입학 준비는 어떻게 하나요?', '예: 10월 30일 할로윈 파티 안내'],
  quickHint: '주제나 오늘 있었던 일을 한 줄 적으면, 유치원 정보(지역 · 교육과정 특징 · 교육 철학)와 함께 1,500자 이상 글을 만들어요 (행사 · 입학 · 원아 모집 안내는 1,000자 이상). 적지 않은 장면 · 대화 · 아이 이름 · 금액은 만들지 않으니, 실제 있었던 일을 적을수록 글이 풍성해져요.',
  topicHint: '예: 낙엽 밟기 바깥놀이',
  values: ['호기심', '배려', '나눔', '자신감', '도전', '협동', '즐거움', '자립', '감사'],
  // 자세히 쓰기 "어떤 일이 있었나요?" (글 종류별 예시 — 태권 글뚝딱 2026-10-28 흐름을 유치원 말로)
  storyHint: '짧게 적어도 괜찮아요. 기억나는 장면이나 아이들 모습을 한 줄 넣으면 글이 훨씬 살아나요 (없어도 돼요). 적지 않은 장면 · 대화 · 금액 · 일정은 만들지 않아요. 아이 이름은 글에 "한 친구"처럼 익명으로 써요.',
  storyEx: {
    '수업 후기': '예: 오늘 햇님반은 밀가루 반죽 촉감놀이를 했어요. 처음엔 손끝으로 콕콕 찔러 보던 친구들이 조물조물 주무르더니 동그란 경단을 만들었어요. 한 친구는 만든 경단을 접시에 담아 선생님께 가져다줬어요.',
    '성장 이야기': '예: 3월에 입학한 5세반 친구가 2주 동안 엄마 품에서 떨어지지 못했어요. 억지로 떼지 않고 좋아하는 블록 놀이로 아침을 시작했더니, 이번 주에는 웃으며 손을 흔들고 들어와요.',
    '행사 안내': '예: 10월 24일 보라매공원에서 가을 운동회를 했어요. 햇살반 친구들이 이어달리기를 끝까지 달렸고, 부모님들과 함께 큰 공 굴리기도 했어요.',
    '모집 안내': '예: 2027학년도 만 3세반 원아를 모집해요. 11월 8일 오전 10시에 유치원 강당에서 입학설명회를 열어요. 일반모집은 처음학교로에서 신청해 주세요.',
    '교육 정보': '예: 학부모님들이 "입학 전 적응 기간은 얼마나 걸려요?"를 자주 물어보세요. 우리 유치원은 첫 주에는 부모님과 함께 1시간, 둘째 주부터 점심 먹기까지 조금씩 시간을 늘려요.',
  } as Record<string, string>,
};

// 유치원: 누가 쓰는 글인가요? (유치원 정보의 글쓴이 목록, 없으면 원장님)
const DIRECTOR: Writer = { id: 'director', role: '원장', name: '' };
function WriterPick({ writers, value, onChange, sign, onSign }: { writers: Writer[]; value?: Writer; onChange: (w: Writer) => void; sign: boolean; onSign: (v: boolean) => void }) {
  const list = writers.some((w) => w.role === '원장') ? writers : [DIRECTOR, ...writers];
  return (
    <div className="row" style={{ marginBottom: 10 }}>
      <span>누가 쓰는 글인가요?</span>
      <select value={value?.id ?? list[0].id} onChange={(e) => onChange(list.find((w) => w.id === e.target.value) ?? list[0])}>
        {list.map((w) => <option key={w.id} value={w.id}>{writerLabel(w)}</option>)}
      </select>
      <label className="row"><input type="checkbox" checked={sign} onChange={(e) => onSign(e.target.checked)} /> 글 끝에 글쓴이 한 줄 넣기</label>
    </div>
  );
}

const KEY = 'new-article-form';
export interface CardPref { style: CardStyle; size: CardSize; mode: CardMode }

// 자세히 쓰기 검색어 확인 상태 (찾기 → 네이버 → AI 고르기 → 끝)
type Phase = 'idle' | 'find' | 'naver' | 'pick' | 'done';
type PlanPick = { keyword: string; sentence: string; why: string };
interface PlanState { basis: string; items: KeywordPlanItem[]; others: PlanPick[]; naver: 'ok' | 'none' | 'fail'; edited: boolean }
// 재료를 읽고 정한 글 성격 · 애매한 숫자 확인 · 주제 설명 글감 (검색어 고르기와 같이 부름)
interface BriefState { basis: string; data: ArticleBrief | null; loading?: boolean; failed?: boolean }

export function NewArticle({ jarvis, onJarvisDone }: { jarvis?: { text: string; n: number } | null; onJarvisDone?: () => void } = {}) {
  const { info, go } = useApp();
  const [guideAt, setGuideAt] = useState<string | null>(null);
  const [profile, setProfile] = useState<DojoProfile | null>(null);
  const saved = local.get<{ input: ArticleInput; keywords: KeywordRow[]; card: CardPref; step: number; memo?: string; plan?: PlanState | null; brief?: BriefState | null } | null>(KEY, null);
  const [input, setInput] = useState<ArticleInput>(saved?.input ?? emptyInput());
  const [keywords, setKeywords] = useState<KeywordRow[]>(saved?.keywords ?? []);
  const [card, setCard] = useState<CardPref>(saved?.card ?? { style: '따뜻한 일러스트', size: '1080x1350', mode: 'ai' });
  const [step, setStep] = useState(saved?.step ?? 1);
  const [prefixes, setPrefixes] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [memo, setMemo] = useState(saved?.memo ?? '');
  const msg = useMsg();

  useEffect(() => {
    call<DojoProfile | null>('profile:get').then((p) => {
      setProfile(p);
      if (!saved) setInput(emptyInput(p));
      // 유치원 정보에 있는 것은 다시 묻지 않음: 비어 있으면 채움
      else if (p) setInput((cur) => ({ ...cur, region: cur.region || p.region, audience: AUDIENCES[0] }));
    });
  }, []); // eslint-disable-line
  useEffect(() => { call<string[]>('profile:prefixOptions', { region: input.region }).then(setPrefixes).catch(() => {}); }, [input.region, profile]);

  const set = (p: Partial<ArticleInput>) => setInput({ ...input, ...p });
  const setF = (p: Partial<ArticleInput['facts']>) => setInput({ ...input, facts: { ...input.facts, ...p } });
  const naverReady = !!(info.secrets.naverApiKey && info.secrets.naverSecret && info.secrets.naverCustomer);
  // 이야기 → 질문 칸 나누기. 메모에 없는 칸은 비어 있음 (지어내지 않음). 이미 적은 칸은 덮어쓰지 않음
  const factsMsg = useMsg();
  const fromMemo = async () => {
    setBusy('memo'); factsMsg.clear();
    try {
      const r = await call<Record<string, string>>('facts:fromMemo', { memo: input.facts.story ?? '', kind: input.kind, topic: input.topic });
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
      setMore(true);
      factsMsg.ok('이야기를 아래 칸에 나눠 정리했어요. 이야기에 없던 칸은 비워 뒀어요. 맞는지 한 번 읽어 주세요.');
    } catch (e) { factsMsg.err(e); }
    setBusy('');
  };
  // 작성 중인 입력은 이 컴퓨터에 임시 보관 (종료해도 복원)
  // ---------- 자세히 쓰기: ① 주제 · 재료 → ② 검색어 확인 → ③ 만들기 설정 (태권 글뚝딱 2026-10-28 GPT 화면 설계안에서 옮김)
  // 재료(이야기)를 먼저 쓰고, 검색어는 그 재료로 네이버 조회 + AI가 골라 넣을 문장 예시까지 보여 줌
  const material = [input.facts.story, input.facts.activities, input.facts.coachingPoints, input.facts.scenes, input.facts.extra,
    input.facts.growth?.before, input.facts.growth?.now, input.facts.growth?.process, input.facts.event?.when, input.facts.event?.where, input.facts.recruit?.who]
    .filter((x) => x && x.trim()).join(' ');
  const basis = `${input.kind}|${input.topic}|${material}`;
  const [phase, setPhase] = useState<Phase>(saved?.plan ? 'done' : 'idle');
  const [plan, setPlan] = useState<PlanState | null>(saved?.plan ?? null);
  const [more, setMore] = useState(false);
  const [changing, setChanging] = useState<number | null>(null); // 바꾸는 카드 (0 주요, 1~2 보조, items.length = 보조 더하기)
  const [own, setOwn] = useState('');
  const planMsg = useMsg();
  const [brief, setBrief] = useState<BriefState | null>(saved?.brief?.loading ? null : saved?.brief ?? null);
  useEffect(() => { local.set(KEY, { input, keywords, card, step, memo, plan, brief }); }, [input, keywords, card, step, memo, plan, brief]);

  // 글 성격 정리는 실패해도 글은 만듦 (예전 방식으로)
  const runBrief = async () => {
    const b = basis;
    setBrief({ basis: b, data: null, loading: true });
    try {
      const data = await call<ArticleBrief>('article:brief', { kind: input.kind, topic: input.topic, story: material });
      setBrief((cur) => (cur?.basis === b ? { basis: b, data } : cur));
    } catch {
      setBrief((cur) => (cur?.basis === b ? { basis: b, data: null, failed: true } : cur));
    }
  };
  const answerBrief = (answer: ArticleBrief['answer']) => brief?.data && setBrief({ ...brief, data: { ...brief.data, answer } });
  const briefReady = brief && brief.basis === basis && !brief.loading ? brief : null;

  const runPlan = async () => {
    planMsg.clear(); setChanging(null);
    setPhase('find');
    const words = hintWords(`${input.topic} ${material}`, input.region);
    let rows: KeywordRow[] = [];
    let naver: PlanState['naver'] = 'none';
    if (naverReady) {
      setPhase('naver');
      try { rows = (await call<{ rows: KeywordRow[] }>('keywords:naver', words)).rows; naver = 'ok'; } catch { naver = 'fail'; }
    }
    setKeywords(rows);
    setPhase('pick');
    try {
      const r = await call<{ main: PlanPick; subs: PlanPick[]; others: PlanPick[] }>('keywords:plan', { kind: input.kind, topic: input.topic, story: material || input.topic, rows });
      setPlan({ basis, naver, edited: false, others: r.others, items: [{ role: '주요', ...r.main }, ...r.subs.map((s) => ({ role: '보조' as const, ...s }))] });
    } catch (e) {
      // AI가 고르지 못해도 글은 만듦: 주제를 그대로 검색어로
      setPlan({ basis, naver, edited: false, others: [], items: [{ role: '주요', keyword: input.topic.trim(), sentence: '', why: '주제를 그대로 써요' }] });
      planMsg.warn(`검색어를 고르지 못했어요 (${(e as Error).message}). 주제를 그대로 쓰거나 [바꾸기]로 직접 적어 주세요.`);
    }
    setPhase('done');
  };
  const goKeywords = () => {
    if (!input.topic.trim()) return msg.err(new Error('주제를 한 줄 적어 주세요.'));
    if (!material) return msg.err(new Error('"어떤 일이 있었나요?"를 적어 주세요. 짧아도 괜찮아요.'));
    msg.clear(); setStep(2);
    if (!brief || brief.basis !== basis) runBrief();
    // 재료가 바뀌었으면 다시 고름. 직접 바꾼 검색어는 묻지 않고 덮어쓰지 않음
    if (!plan || (plan.basis !== basis && !plan.edited)) runPlan();
  };
  const pickAt = (i: number, p: PlanPick) => {
    if (!plan) return;
    const items = [...plan.items];
    const old = items[i];
    items[i] = { role: i === 0 ? '주요' : '보조', ...p };
    const others = [...plan.others.filter((o) => o.keyword !== p.keyword), ...(old && old.keyword ? [{ keyword: old.keyword, sentence: old.sentence, why: old.why ?? '' }] : [])];
    setPlan({ ...plan, items, others, edited: true }); setChanging(null); setOwn(''); planMsg.clear();
  };
  const dropAt = (i: number) => plan && setPlan({ ...plan, items: plan.items.filter((_, j) => j !== i), others: [...plan.others, { keyword: plan.items[i].keyword, sentence: plan.items[i].sentence, why: plan.items[i].why ?? '' }], edited: true });
  const useOwn = (i: number) => {
    const w = own.trim();
    if (!w) return;
    if (foreignKeyword(w, profile?.region ?? input.region, profile)) return planMsg.err(new Error(`"${w}"는 다른 유치원 이름이나 어린이집 · 학원, 다른 지역, 또는 원장 · 교사 쪽 검색어 같아요. 우리 유치원 · 동네 말로 적어 주세요.`));
    pickAt(i, { keyword: w, sentence: '', why: '직접 적은 말이에요' });
  };
  const volText = (kw: string) => {
    const r = keywords.find((x) => x.keyword.replace(/\s/g, '') === kw.replace(/\s/g, ''));
    if (!r) return plan?.naver === 'ok' ? '검색량 기록 없음' : '확인 안 함';
    return `PC ${r.pc ?? '–'} · 모바일 ${r.mobile ?? '–'}`;
  };
  // 바꿀 때 보여 줄 후보: AI 후보 + 네이버에서 온 것 중 재료와 관련 있고 아직 안 쓴 것 (우리와 맞지 않는 것 · 넓은 말은 뺌)
  const choices = (): PlanPick[] => {
    const used = new Set((plan?.items ?? []).map((x) => x.keyword));
    const fromRows = planCandidates(keywords, `${input.topic} ${material}`, profile?.region ?? input.region, profile)
      .filter((r) => !used.has(r.keyword)).slice(0, 6).map((r) => ({ keyword: r.keyword, sentence: '', why: '' }));
    const ai = (plan?.others ?? []).filter((o) => !used.has(o.keyword));
    return [...ai, ...fromRows.filter((r) => !ai.some((a) => a.keyword === r.keyword))].slice(0, 8);
  };
  const STATUS: [Phase, string, string][] = [
    ['find', '재료에서 검색어를 찾고 있어요', '재료에서 검색어를 찾았어요'],
    ...(naverReady ? [['naver', '네이버 검색량을 확인하고 있어요', '네이버 검색량을 확인했어요'] as [Phase, string, string]] : []),
    ['pick', '이야기에 맞는 말을 고르고 있어요', '이야기에 맞는 말을 골랐어요'],
  ];
  const ORDER: Phase[] = ['idle', 'find', 'naver', 'pick', 'done'];

  const VALUE_CHIPS = TX.values;
  const values = input.facts.values.split(',').map((v) => v.trim()).filter(Boolean);
  const toggleValue = (v: string) => setF({ values: (values.includes(v) ? values.filter((x) => x !== v) : [...values, v].slice(-2)).join(', ') });

  const miss = missingInputs(input);
  const regionDiff = profile && input.region && !input.region.replace(/\s/g, '').includes(profile.region.replace(/\s/g, '')) && !profile.region.replace(/\s/g, '').includes(input.region.replace(/\s/g, ''));

  // 유치원 글쓴이: 고른 사람 (이 PC에 기억), 없으면 목록 첫 사람 · 원장님
  const writers = profile?.writers ?? [];
  const [writerId, setWriterIdState] = useState(local.get('writer-id', ''));
  const [writerSign, setWriterSignState] = useState(local.get('writer-sign', false));
  const setWriterId = (id: string) => { setWriterIdState(id); local.set('writer-id', id); };
  const setWriterSign = (v: boolean) => { setWriterSignState(v); local.set('writer-sign', v); };
  const writer = writers.find((w) => w.id === writerId) ?? writers.find((w) => w.role === '원장') ?? DIRECTOR;

  const start = async () => {
    if (miss.length) { msg.err(new Error(`먼저 채워 주세요: ${miss.join(', ')}`)); return; }
    setBusy('start');
    try {
      const items = (plan?.items ?? []).filter((x) => x.keyword.trim());
      const withWriter: ArticleInput = { ...(writer ? { ...input, writer, writerSign } : input), brief: briefReady?.data ?? undefined };
      const ready: ArticleInput = items.length
        ? { ...withWriter, keywordPlan: items.map(({ role, keyword, sentence, why }) => ({ role, keyword, sentence, why })), mainKeyword: items[0].keyword, subKeywords: items.slice(1).map((x) => x.keyword) }
        : withWriter;
      const chosen = keywords.filter((k) => k.keyword === ready.mainKeyword || ready.subKeywords.includes(k.keyword));
      const art = await call<{ id: string }>('article:create', { input: ready, keywords: chosen });
      local.set(`card-pref-${art.id}`, card);
      // 글은 만들었는데 생성 시작이 실패하면 같은 글을 또 만들지 않고 그 글 화면으로 (거기서 다시 시도)
      try { await call('article:generate', art.id); } catch (e) { local.del(KEY); go({ page: 'article', id: art.id }); throw e; }
      local.del(KEY);
      go({ page: 'article', id: art.id });
    } catch (e) { msg.err(e); setBusy(''); }
  };

  // 빠른 작성: 주제(또는 메모) 한 줄 → 유치원 정보 + 일반 교육 설명으로 바로 글 + 카드
  const [quick, setQuick] = useState(local.get('quick-memo', ''));
  const [quickCards, setQuickCards] = useState(true);
  const [quickPrefix, setQuickPrefixState] = useState(local.get('quick-prefix', true));
  // 태권 글뚝딱 2.2.11에서 옮김: 주변 장소가 비면 [동 유치원] 하나만 계속 붙는데 "돌아가며"로 안내돼 헷갈림
  const quickNames = prefixNames(profile?.region ?? '', profile?.nearbyAreas ?? []);
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
          const pick = pickKeywords(r.rows, memo, profile?.region ?? '', profile);
          if (pick.main) { main = pick.main; subs = pick.subs; chosen = r.rows.filter((x) => x.keyword === pick.main || pick.subs.includes(x.keyword)); }
        } catch { /* 키워드 조회가 안 돼도 글은 만듦 */ }
        setBusy('quick');
      }
      // 제목 앞 동네 이름: 글마다 돌아가며 ([신대방동 유치원] → [롯데낙천대아파트 유치원] → …)
      const titlePrefix = quickPrefix ? autoPrefix(profile?.region ?? '', profile?.nearbyAreas ?? [], (await call<unknown[]>('article:list').catch(() => [])).length) : '';
      const q = buildQuickInput({ memo, profile, main, subs, withCards: quickCards, titlePrefix, writer, writerSign });
      const art = await call<{ id: string }>('article:create', { input: q, keywords: chosen });
      local.set(`card-pref-${art.id}`, card);
      // 시작부터 실패하면(키 없음 · 잠김 등) 빈 글로 넘어가지 않고 이 화면에 이유를 보여 줌 (처음 사용자 시험 불편 12)
      try { await call('article:generate', art.id); } catch (e) { await call('article:delete', art.id).catch(() => {}); throw e; }
      local.del('quick-memo');
      go({ page: 'article', id: art.id });
    } catch (e) { msg.err(e); setBusy(''); }
  };
  // 자비스가 넘긴 주제: 유치원 정보를 불러온 뒤 한 번만 바로 시작
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
      {!profile && <div className="note warn">{APP.place} 정보를 먼저 저장해 주세요. <button className="btn link" onClick={() => go({ page: 'profile' })}>{APP.place} 정보로 가기</button></div>}
      <div className="panel">
        <h2>주제 한 줄로 바로 쓰기</h2>
        <p className="hint">{TX.quickHint}</p>
        {<WriterPick writers={writers} value={writer} onChange={(w) => setWriterId(w.id)} sign={writerSign} onSign={setWriterSign} />}
        <textarea rows={4} value={quick} onChange={(e) => setQuick(e.target.value)}
          placeholder={TX.quickPh.join(String.fromCharCode(10))} />
        {thinMemo(quick) && <p className="hint">💡 {TX.thinMemo}</p>}
        <div className="row" style={{ marginTop: 8 }}><MicButton disabled={!info.secrets.openai || !!busy} onText={(t) => setQuick((q) => appendSpoken(q, t))} /></div>
        <div className="row" style={{ marginTop: 10 }}>
          <label className="row"><input type="checkbox" checked={quickPrefix} onChange={(e) => setQuickPrefix(e.target.checked)} /> 제목 앞에 동네 이름 붙이기 <span className="hint">{quickNames.length > 1 ? `(${quickNames.join(' · ')} 중 돌아가며${dongOf(profile?.region ?? '') ? `, [${dongOf(profile?.region ?? '')} ${APP.term}]은 세 편에 한 번` : ''})` : quickNames.length ? `(주변 장소가 없어 ${quickNames[0]}만 붙어요)` : `(${APP.place} 정보에 지역 · 주변 장소가 없어요)`}</span></label>
          {quickPrefix && quickNames.length <= 1 && <span className="hint" style={{ flexBasis: "100%", order: 1 }}>가까운 아파트 · 초등학교 · 역 이름을 {APP.place} 정보 → 주변 장소에 적으면 제목 앞 이름이 돌아가며 붙어요. <button className="btn link" onClick={() => go({ page: 'profile' })}>주변 장소 적으러 가기</button></span>}
          <label className="row"><input type="checkbox" checked={quickCards} onChange={(e) => setQuickCards(e.target.checked)} /> 카드뉴스 3장도 만들기 {quickCards && card.mode === 'ai' && <span className="hint">(AI 그림 3장 비용 발생)</span>}</label>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn primary" disabled={!quick.trim() || !!busy || !profile} onClick={() => quickStart()}>{busy === 'quick-kw' ? '키워드 고르는 중…' : busy === 'quick' ? '시작하는 중…' : '바로 글 만들기'}</button>
          <span className="hint">지역: {profile?.region ?? '-'} · 문체: {profile?.tone ?? '-'} · 키워드: {naverReady ? '네이버 검색량으로 자동 선택' : `${fallbackKeyword(profile?.region ?? '', '주제')} (설정에 검색광고 키가 없음)`}</span>
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
        <button className="btn small" onClick={() => { if (confirm('입력한 내용을 비울까요?')) { local.del(KEY); setInput(emptyInput(profile)); setKeywords([]); setPlan(null); setBrief(null); setPhase('idle'); setStep(1); } }}>새로 쓰기</button>
      </div>
      <LockBanner />
      {!profile && <div className="note warn">{APP.place} 정보를 먼저 저장해 주세요. <button className="btn link" onClick={() => go({ page: 'profile' })}>{APP.place} 정보로 가기</button></div>}

      <div className="steps">
        {['1 주제 · 재료', '2 검색어 확인', '3 만들기 설정'].map((t, i) => <button key={t} className={`step ${step === i + 1 ? 'on' : ''}`} onClick={() => (i === 1 ? goKeywords() : setStep(i + 1))}>{t}</button>)}
      </div>

      {step === 1 && (
        <div className="panel">
          {<WriterPick writers={writers} value={writer} onChange={(w) => setWriterId(w.id)} sign={writerSign} onSign={setWriterSign} />}
          <div className="grid2">
            <Field label="글 종류" req><Chips options={ARTICLE_KINDS} value={input.kind} label={kindLabel} onChange={(v) => set({ kind: v })} /></Field>
          </div>
          <div className="grid2">
            <Field label="주제" req hint={TX.topicHint}><input type="text" value={input.topic} onChange={(e) => set({ topic: e.target.value })} /></Field>
            <Field label="목표 지역" req hint={regionDiff ? `${APP.place} 소재지(${profile!.region})와 달라요. 글에는 그 지역에 있다고 쓰지 않아요.` : `${APP.place} 소재지가 기본값이에요`}>
              <input type="text" value={input.region} onChange={(e) => set({ region: e.target.value })} />
            </Field>
          </div>
          <Field label="어떤 일이 있었나요?" req hint={TX.storyHint}>
            <textarea className="story" rows={6} value={input.facts.story ?? ''} onChange={(e) => setF({ story: e.target.value })} placeholder={TX.storyEx[k]} />
          </Field>
          <div className="row">
            <MicButton disabled={!info.secrets.openai || !!busy} onText={(t) => setF({ story: appendSpoken(input.facts.story ?? '', t) })} />
            <button className="btn small" aria-expanded={more} onClick={() => setMore(!more)}>{more ? '접기 ▴' : '조금 더 적기 ▾'}</button>
            <button className="btn small" disabled={!(input.facts.story ?? '').trim() || !!busy} onClick={fromMemo}>{busy === 'memo' ? '정리하는 중…' : '내용 정리'}</button>
            <span className="hint">[내용 정리]는 이야기를 아래 질문 칸에 나눠 적어 줘요 (안 해도 돼요).</span>
          </div>
          <Msg m={factsMsg.m} />
          {k === '행사 안내' && (
            <div className="grid2 more">
              {(['when', 'where', 'who', 'bring', 'apply'] as const).map((f) => (
                <Field key={f} label={{ when: '언제 (선택)', where: '어디서 (선택)', who: '누가 (선택)', bring: '준비물 (선택)', apply: '신청 방법 (선택)' }[f]}>
                  <input type="text" value={input.facts.event?.[f] ?? ''} onChange={(e) => setF({ event: { ...input.facts.event!, [f]: e.target.value } })} />
                </Field>
              ))}
            </div>
          )}
          {k === '모집 안내' && (
            <div className="grid2 more">
              <Field label="모집 대상은 누구인가요? (선택)"><input type="text" value={input.facts.recruit?.who ?? ''} onChange={(e) => setF({ recruit: { ...input.facts.recruit!, who: e.target.value } })} /></Field>
              <Field label="입학설명회 · 신청은 어떻게 하나요? (선택)"><input type="text" value={input.facts.recruit?.trial ?? ''} onChange={(e) => setF({ recruit: { ...input.facts.recruit!, trial: e.target.value } })} /></Field>
            </div>
          )}
          {k === '성장 이야기' && (
            <div className="grid2 more">
              <Field label="전에는 어땠나요? (선택)"><textarea value={input.facts.growth?.before ?? ''} onChange={(e) => setF({ growth: { ...input.facts.growth!, before: e.target.value } })} /></Field>
              <Field label="지금은 어떤가요? (선택)"><textarea value={input.facts.growth?.now ?? ''} onChange={(e) => setF({ growth: { ...input.facts.growth!, now: e.target.value } })} /></Field>
            </div>
          )}
          {more && (
            <div className="grid2 more">
              <Field label="무엇을 했나요?"><textarea value={input.facts.activities} onChange={(e) => setF({ activities: e.target.value })} /></Field>
              <Field label="어떤 도움을 주셨나요?" hint="예: 먼저 손끝으로 만져 보게 기다려 줬어요"><textarea value={input.facts.coachingPoints} onChange={(e) => setF({ coachingPoints: e.target.value })} /></Field>
              <Field label="특히 기억나는 모습이 있나요?" hint="실제로 본 장면만"><textarea value={input.facts.scenes} onChange={(e) => setF({ scenes: e.target.value })} /></Field>
              <Field label="부모님께 전하고 싶은 말이 있나요?">
                <div className="chips" style={{ marginBottom: 6 }}>{VALUE_CHIPS.map((v) => <button type="button" key={v} className={`chip ${values.includes(v) ? 'on' : ''}`} aria-pressed={values.includes(v)} onClick={() => toggleValue(v)}>{values.includes(v) ? '✓ ' : ''}{v}</button>)}</div>
                <input type="text" value={input.facts.values} onChange={(e) => setF({ values: e.target.value })} />
              </Field>
              <Field label="따로 알릴 것이 있나요?" hint="일정 · 준비물 같은 사실"><textarea value={input.facts.extra} onChange={(e) => setF({ extra: e.target.value })} /></Field>
              <Field label="사진 설명 (선택)" hint="사진 넣을 자리 제안에만 써요"><input type="text" value={input.facts.photoNotes} onChange={(e) => setF({ photoNotes: e.target.value })} /></Field>
              {k === '성장 이야기' && <Field label="어떻게 도우셨나요?"><textarea value={input.facts.growth?.process ?? ''} onChange={(e) => setF({ growth: { ...input.facts.growth!, process: e.target.value } })} /></Field>}
            </div>
          )}
          <Msg m={msg.m} />
          <div className="row end"><button className="btn primary" disabled={!!busy} onClick={goKeywords}>다음: 검색어 확인</button></div>
        </div>
      )}

      {step === 2 && (
        <div className="panel">
          {brief?.loading && <div className="plan-status"><div className="doing">재료를 읽고 글 성격을 정리하고 있어요</div></div>}
          {briefReady?.failed && <div className="note info">글 성격을 정리하지 못했어요. 글은 그대로 만들 수 있어요. <button className="btn link" onClick={runBrief}>다시 정리</button></div>}
          {briefReady?.data && (
            <div className="brief">
              <p className="brief-note">✓ {briefReady.data.note}</p>
              {briefReady.data.check && (briefReady.data.answer ? (
                <p className="hint">“{briefReady.data.check.quote}” — {briefReady.data.answer === '맞아요' ? '적어 주신 대로 써요.' : '숫자는 빼고 써요.'} <button className="btn link" onClick={() => answerBrief(undefined)}>다시 고르기</button></p>
              ) : (
                <div className="brief-check">
                  <b>한 가지만 확인할게요</b>
                  <p className="hint">“{briefReady.data.check.quote}”</p>
                  <p>{briefReady.data.check.question}</p>
                  <div className="row">
                    <button className="btn small" onClick={() => answerBrief('맞아요')}>맞아요</button>
                    <button className="btn small" onClick={() => setStep(1)}>고칠게요</button>
                    <button className="btn small" onClick={() => answerBrief('빼기')}>숫자는 빼 주세요</button>
                  </div>
                  <p className="hint">고르지 않으면 이 숫자는 글에 쓰지 않아요.</p>
                </div>
              ))}
              {briefReady.data.topicGap && (
                <div className="brief-check">
                  <b>주제와 재료가 조금 달라요</b>
                  <p className="hint">주제: “{input.topic}”</p>
                  <p>{briefReady.data.topicGap}</p>
                  <textarea rows={2} maxLength={500} value={briefReady.data.topicAnswer ?? ''} placeholder="한두 줄이면 돼요" onChange={(e) => setBrief({ ...briefReady, data: { ...briefReady.data!, topicAnswer: e.target.value || undefined } })} />
                  <p className="hint">비워 두면 이유는 지어내지 않고, 적어 주신 재료 이야기로만 써요.</p>
                </div>
              )}
              {!!briefReady.data.asks?.length && (
                <div className="brief-check">
                  <b>한두 줄만 더 적어 주시면 글이 길고 생생해져요</b>
                  <p className="hint">지금 재료로는 900~1,200자쯤 나와요. 하나라도 답하시면 1,200~1,500자를 목표로 써요.</p>
                  {briefReady.data.asks.map((a, i) => (
                    <label key={i} className="brief-ask">
                      <span>{a.question}</span>
                      <input value={a.answer ?? ''} maxLength={500} placeholder="한 줄이면 돼요 (비워 둬도 돼요)" onChange={(e) => setBrief({ ...briefReady, data: { ...briefReady.data!, asks: briefReady.data!.asks!.map((x, j) => (j === i ? { ...x, answer: e.target.value || undefined } : x)) } })} />
                    </label>
                  ))}
                  <p className="hint">적어 주신 답은 재료와 똑같이 사실로 써요. 답에 없는 장면은 만들지 않아요.</p>
                </div>
              )}
            </div>
          )}
          {phase !== 'done' ? (
            <div className="plan-status" aria-live="polite">
              {STATUS.map(([p, doing, done]) => {
                const at = ORDER.indexOf(phase), me = ORDER.indexOf(p);
                return <div key={p} className={at > me ? 'done' : at === me ? 'doing' : 'wait'}>{at > me ? done : doing}</div>;
              })}
            </div>
          ) : plan && (
            <>
              <p className="plan-lead">이야기와 맞는 검색어를 골랐어요. 그대로 진행해도 돼요.</p>
              {plan.naver === 'none' && <div className="note info">네이버 연결 없이 재료 속 말로 골랐어요. 글은 만들 수 있어요. (설정에 검색광고 키를 넣으면 실제 검색량도 봐요)</div>}
              {plan.naver === 'fail' && <div className="note warn">검색량을 확인하지 못했어요. 재료 속 말로 계속할 수 있어요. <button className="btn link" onClick={runPlan}>다시 확인</button></div>}
              {plan.basis !== basis && <div className="note warn">검색어를 고른 뒤 재료가 바뀌었어요. <button className="btn link" onClick={runPlan}>다시 고르기</button></div>}
              <Msg m={planMsg.m} />
              {[...plan.items, ...(changing === plan.items.length ? [null] : [])].map((it, i) => (
                <div key={i} className="kwcard">
                  {it && (
                    <>
                      <div className="kwcard-top">
                        <span className={`role ${i === 0 ? 'main' : ''}`}>{i === 0 ? '주요' : '보조'}</span>
                        <b>{it.keyword}</b>
                        {it.why && <span className="hint">{it.why}</span>}
                      </div>
                      {it.sentence ? <p className="kwcard-ex">“{it.sentence}”</p> : <p className="hint">문장 예시 없이 글에 자연스럽게 넣어요.</p>}
                      <div className="row end">
                        <button className="btn small" onClick={() => { setChanging(changing === i ? null : i); setOwn(''); }}>바꾸기</button>
                        {i > 0 && <button className="btn small" onClick={() => dropAt(i)}>빼기</button>}
                      </div>
                    </>
                  )}
                  {changing === i && (
                    <div className="kwcard-change">
                      <div className="chips">
                        {choices().map((c) => <button key={c.keyword} type="button" className="chip" title={c.sentence || volText(c.keyword)} onClick={() => pickAt(i, c)}>{c.keyword}</button>)}
                        {!choices().length && <span className="hint">다른 후보가 없어요. 직접 적어 주세요.</span>}
                      </div>
                      <div className="row" style={{ marginTop: 8 }}>
                        <input className="grow" type="text" value={own} onChange={(e) => setOwn(e.target.value)} placeholder="직접 쓸 검색어" aria-label="직접 쓸 검색어" />
                        <button className="btn small" disabled={!own.trim()} onClick={() => useOwn(i)}>이 말로 쓰기</button>
                        <button className="btn small" onClick={() => setChanging(null)}>닫기</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {plan.items.length < 3 && changing !== plan.items.length && <button className="btn small" onClick={() => { setChanging(plan.items.length); setOwn(''); }}>+ 보조 검색어 더하기</button>}
              <p className="hint">문장 예시처럼 자연스럽게 넣어요. 완성 글에서는 조금 달라질 수 있어요.</p>
              {plan.naver === 'ok' && (
                <details className="kw-vol">
                  <summary>검색량도 보기</summary>
                  <table className="kw"><tbody>{plan.items.map((it) => <tr key={it.keyword}><td>{it.keyword}</td><td className="num">{volText(it.keyword)}</td></tr>)}</tbody></table>
                  <p className="hint">한 달 검색 수예요. 숫자가 크다고 우리 글에 맞는 건 아니에요.</p>
                </details>
              )}
            </>
          )}
          <div className="row split-row">
            <button className="btn" onClick={() => setStep(1)}>재료 고치기</button>
            <button className="btn primary" disabled={phase !== 'done' || !!brief?.loading} onClick={() => setStep(3)}>다음: 만들기 설정</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="split">
          <div className="panel">
            <Field label="문체"><Chips options={TONES} value={input.tone} onChange={(v) => set({ tone: v })} /></Field>
            <Field label="마무리"><Chips options={ENDINGS} value={input.ending as any} onChange={(v) => set({ ending: v })} /></Field>
            <Field label={`이번 글에 넣을 ${APP.place} 정보`} hint={`${APP.place} 정보는 매 글에 무조건 넣지 않아요`}>
              <div className="chips">
                {([['philosophy', APP.philLabel], ['classFeatures', APP.featLabel], ['credentials', '경력 · 자격'], ['contact', '연락처 · 상담 링크'], ['address', '상세 주소']] as const).map(([key, label]) => (
                  <button key={key} type="button" aria-pressed={input.includeProfile[key]} className={`chip ${input.includeProfile[key] ? 'on' : ''}`} onClick={() => set({ includeProfile: { ...input.includeProfile, [key]: !input.includeProfile[key] } })}>{input.includeProfile[key] ? '✓ ' : ''}{label}</button>
                ))}
              </div>
            </Field>
            <Field label="제목 앞 동네 이름 (선택)" hint={prefixes.length > 1 ? `고른 그대로 제목 앞에 붙여요 (AI가 만들지 않음). 후보는 ${APP.place} 정보의 주변 장소에서 와요` : `고른 그대로 제목 앞에 붙여요. ${APP.place} 정보 → 주변 장소에 가까운 아파트 · 초등학교 · 역 이름을 적으면 후보가 늘어요`}>
              <select value={input.titlePrefix ?? ''} onChange={(e) => set({ titlePrefix: e.target.value })}>
                <option value="">붙이지 않음</option>
                {prefixes.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            {(profile?.greeting?.trim() || profile?.closing?.trim()) && (
              <Field label="첫인사 · 끝인사" hint={`${APP.place} 정보에 적은 문장을 글 맨 앞 · 맨 끝에 그대로 붙여요`}>
                <label className="row"><input type="checkbox" checked={input.greetings !== false} onChange={(e) => set({ greetings: e.target.checked })} /> 이 글에 넣기</label>
              </Field>
            )}
            <p className="hint">{input.facts.story?.trim() ? '분량: 본문 공백 제외 약 900~1,200자 (② 단계 물음에 답하면 1,200~1,500자). 모자란 분량은 주제 설명으로 채우고, 지어내지 않아요.' : `분량: 본문 공백 제외 최소 1,500자, 목표 1,800~2,200자 (행사 · ${kindLabel('모집 안내')}는 최소 1,000자). 모자라면 사실을 더하지 않고 최대 2번 보완해요.`}</p>
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
            <p className="hint">검색어: {plan?.items.length ? plan.items.map((x) => x.keyword).join(' · ') : `${input.topic || '-'} (주제 그대로)`}</p>
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
