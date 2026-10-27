import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { call } from '../api';
import { Field, Msg, useMsg } from '../components/ui';
import { AccountPanel } from '../components/Account';
import { SetupGuide } from '../guide/SetupGuide';
import { KeyGuide } from '../guide/KeyGuide';
import { Speak } from '../guide/voice';
import { APP } from '../../shared/kinder';

type SecretName = 'openai' | 'naverApiKey' | 'naverSecret' | 'naverCustomer' | 'kakao';

function SecretRow({ name, label, hint }: { name: SecretName; label: string; hint: string }) {
  const { info, reload } = useApp();
  const [v, setV] = useState('');
  const [edit, setEdit] = useState(false);
  const msg = useMsg();
  const masked = info.secrets[name];
  const save = async () => {
    try { await call('secrets:set', { name, value: v }); setV(''); setEdit(false); msg.ok('저장했어요 (Windows 암호화 저장)'); await reload(); } catch (e) { msg.err(e); }
  };
  const remove = async () => { if (!confirm(`${label}을(를) 삭제할까요?`)) return; await call('secrets:remove', name); msg.clear(); await reload(); };
  return (
    <div className="field">
      <span>{label}</span>
      {masked && !edit ? (
        <div className="row"><span className="mask grow">{masked}</span><button className="btn small" onClick={() => setEdit(true)}>교체</button><button className="btn small danger" onClick={remove}>삭제</button></div>
      ) : (
        <div className="row">
          <input className="grow" type="password" autoComplete="off" value={v} onChange={(e) => setV(e.target.value)} placeholder="붙여넣기" />
          <button className="btn small primary" disabled={!v.trim()} onClick={save}>저장</button>
          {edit && <button className="btn small" onClick={() => { setEdit(false); setV(''); }}>취소</button>}
        </div>
      )}
      <small>{hint}</small>
      <Msg m={msg.m} />
    </div>
  );
}

export function SettingsPage() {
  const { info, reload } = useApp();
  const s = info.settings;
  const [form, setForm] = useState(s);
  const [naver, setNaver] = useState<{ open: boolean; loggedIn: boolean | null; browser: string | null } | null>(null);
  const [usage, setUsage] = useState<{ since: string; rows: { provider: string; model: string; kind: string; calls: number; last: string }[] } | null>(null);
  const msg = useMsg();
  // 연결 확인 결과는 누른 버튼 바로 아래에 (한곳에 모아 띄우면 화면 밖이라 "반응 없음"으로 보임 · 2026-10-21 버그)
  const tests = { openai: useMsg(), naver: useMsg(), kakao: useMsg() };
  const [testing, setTesting] = useState<'openai' | 'naver' | 'kakao' | null>(null);
  useEffect(() => { setForm(info.settings); }, [info.settings]);
  useEffect(() => { call('naver:status').then(setNaver).catch(() => {}); call('usage:summary').then(setUsage).catch(() => {}); }, []);
  const set = (p: Partial<typeof form>) => setForm({ ...form, ...p });
  const save = async () => { try { await call('settings:save', form); await reload(); msg.ok('저장했어요'); } catch (e) { msg.err(e); } };
  const runTest = async (kind: 'openai' | 'naver' | 'kakao') => {
    const t = tests[kind];
    setTesting(kind);
    t.info('확인 중…');
    try { t.ok(await call('secrets:test', kind)); } catch (e) { t.err(e); } finally { setTesting(null); }
  };
  const open = (url: string) => call('shell:open', url).catch(() => {});
  const [guideAt, setGuideAt] = useState<string | null>(null);
  const [keyGuide, setKeyGuide] = useState<'naver' | 'kakao' | null>(null);

  return (
    <>
      <div className="head"><h1>설정</h1></div>
      {guideAt && <SetupGuide start={guideAt} onClose={() => setGuideAt(null)} />}
      {keyGuide && <KeyGuide flow={keyGuide} onClose={() => setKeyGuide(null)} />}

      <SecretaryPanel onGuide={setGuideAt} />

      <AccountPanel />

      <div className="panel">
        <h2 className="h2-row">OpenAI (글 · 카드 그림) <Speak ids={['P02', 'P03']} /></h2>
        <SecretRow name="openai" label="OpenAI API 키" hint={`OpenAI 사이트에서 만든 키 (sk- 로 시작). 글 · 그림 사용료는 ${APP.owner} OpenAI 계정에서 쓴 만큼 나가요.`} />
        <div className="row" style={{ marginBottom: 10 }}>
          <button className="btn primary" onClick={() => setGuideAt('A03')}>🔊 비서와 같이 키 만들기</button>
          <button className="btn link" onClick={() => open('https://growmoment.co.kr/guide')}>캡처로 보는 안내 (홈페이지)</button>
        </div>
        <details className="expert"><summary>전문가 설정 · 그대로 두셔도 돼요</summary>
        <div className="grid2">
          <Field label="글 모델" hint="공식 문서에서 지원을 확인한 이름으로 바꿀 수 있어요"><input type="text" value={form.textModel} onChange={(e) => set({ textModel: e.target.value })} /></Field>
          <Field label="이미지 모델" hint="권한이 없으면 카드는 템플릿 모드로 만들 수 있어요"><input type="text" value={form.imageModel} onChange={(e) => set({ imageModel: e.target.value })} /></Field>
        </div>
        <p className="hint">모델 이름을 바꾸면 아래 [설정 저장]을 눌러야 적용돼요. <button className="btn link" onClick={() => open('https://platform.openai.com/docs/')}>OpenAI 공식 문서</button></p>
        </details>
        <div className="row">
          <button className="btn" disabled={!info.secrets.openai || testing !== null} onClick={() => runTest('openai')}>{testing === 'openai' ? '확인 중…' : '연결 확인'}</button>
          <span className="hint">모델 정보만 조회해요 (글 · 그림 생성 비용 없음).</span>
        </div>
        <Msg m={tests.openai.m} />
      </div>

      <details className="optional-group">
      <summary>더 좋게 쓰는 방법 (선택) · 네이버 검색광고 · 카카오 지도 <span className="hint">없어도 글은 잘 나와요</span></summary>
      <div className="panel">
        <h2 className="h2-row">네이버 검색광고 (키워드 검색량, 선택) <Speak ids={['P04', 'P05a', 'P05b', 'P05c', 'P05d', 'P06']} /></h2>
        <p className="hint">없어도 키워드를 직접 적어 글을 만들 수 있어요. 네이버 광고주센터 왼쪽 [도구] → [SA API 사용 관리]에서 발급해요.</p>
        <div className="row" style={{ marginBottom: 10 }}><button className="btn primary" onClick={() => setKeyGuide('naver')}>🔊 비서와 같이 연결하기</button></div>
        <SecretRow name="naverApiKey" label="API Key (액세스 라이선스)" hint="SA API 사용 관리의 '엑세스라이선스' 줄 [복사] (옆 [재발급]은 누르지 마세요)" />
        <SecretRow name="naverSecret" label="Secret Key (비밀 키)" hint="'비밀키' 줄 [복사]. 저장하면 화면 · 로그에 다시 보이지 않아요" />
        <SecretRow name="naverCustomer" label="Customer ID" hint="SA API 사용 관리 화면 위 'CUSTOMER_ID =' 옆 숫자" />
        <div className="row">
          <button className="btn" disabled={!info.secrets.naverApiKey || !info.secrets.naverSecret || !info.secrets.naverCustomer || testing !== null} onClick={() => runTest('naver')}>{testing === 'naver' ? '확인 중…' : '연결 확인'}</button>
          <span className="hint">"{APP.term}" 한 번 조회해요 (검색광고 API 호출 한도에 1회 포함).</span>
          <button className="btn link" onClick={() => open('https://naver.github.io/searchad-apidoc/')}>공식 API 문서</button>
        </div>
        <Msg m={tests.naver.m} />
      </div>

      <div className="panel">
        <h2 className="h2-row">카카오 로컬 (주변 학교 · 아파트 이름, 선택) <Speak ids={['P07', 'P08']} /></h2>
        <p className="hint">제목 앞 "{'[○○아파트 유치원]'}" 같은 동네 이름 후보를 모을 때만 써요. 없으면 {APP.place} 정보에서 직접 적으면 돼요.</p>
        <div className="row" style={{ marginBottom: 10 }}><button className="btn primary" onClick={() => setKeyGuide('kakao')}>🔊 비서와 같이 연결하기</button></div>
        <SecretRow name="kakao" label="카카오 REST API 키" hint="카카오 개발자 → 앱 → [플랫폼 키] → REST API 키. 앱의 [제품 설정 → 카카오맵] 사용 설정도 켜야 해요" />
        <div className="row">
          <button className="btn" disabled={!info.secrets.kakao || testing !== null} onClick={() => runTest('kakao')}>{testing === 'kakao' ? '확인 중…' : '연결 확인'}</button>
          <button className="btn link" onClick={() => open('https://developers.kakao.com/')}>카카오 개발자 사이트</button>
        </div>
        <Msg m={tests.kakao.m} />
      </div>
      </details>

      <div className="panel">
        <h2 className="h2-row">네이버 블로그 로그인 (초안 입력용) <Speak ids={['P09', 'P10']} /></h2>
        <p>네이버 전용 브라우저 창에서 {APP.owner}이 직접 로그인해요. 프로그램은 비밀번호를 받지 않고, 평소 크롬 로그인 정보도 가져오지 않아요.</p>
        <p className="hint">브라우저: {naver?.browser ?? info.browser ?? '찾지 못함 (크롬 또는 엣지 필요)'} · 창 {naver?.open ? '열림' : '닫힘'} · 로그인 {naver?.loggedIn == null ? '확인 전' : naver.loggedIn ? '됨' : '안 됨'}</p>
        <div className="row">
          <button className="btn" onClick={() => call('naver:openLogin').then(() => call('naver:status').then(setNaver)).catch((e) => msg.err(e))}>브라우저 열기 · 로그인</button>
          <button className="btn" onClick={() => call('naver:status').then(setNaver)}>로그인 상태 확인</button>
          <button className="btn danger" onClick={() => { if (confirm('네이버 전용 창을 닫고 로그인 정보를 지울까요? 다음에 다시 로그인해야 해요.')) call('naver:clearSession').then(() => call('naver:status').then(setNaver)); }}>로그아웃 · 전용 세션 삭제</button>
        </div>
        <Field label="브라우저 위치 (보통 비워 둠)" hint="크롬 · 엣지가 기본 위치에 없을 때만 .exe 경로"><input type="text" value={form.browserPath} onChange={(e) => set({ browserPath: e.target.value })} /></Field>
      </div>

      <div className="panel">
        <h2 className="h2-row">저장 · 화면 <Speak ids={['P11a', 'P11b', 'P11c']} /></h2>
        <Field label="내보내기 폴더"><div className="row"><input className="grow" type="text" value={form.saveDir} readOnly /><button className="btn small" onClick={async () => { const d = await call<string | null>('settings:pickDir'); if (d) { set({ saveDir: d }); await reload(); } }}>바꾸기</button></div></Field>
        <div className="grid2">
          <Field label="타이핑 연출 속도 (초당 글자)" hint="5~80까지 넣을 수 있어요 (촬영엔 15~30 권장). 네이버 타이핑 입력에도 같은 속도"><input type="number" min={5} max={80} value={form.typingSpeed} onChange={(e) => set({ typingSpeed: Number(e.target.value) })} /></Field>
          <Field label="이번 달 AI 그림 한도 (장)" hint="한도에 닿으면 그림 요청을 보내지 않아요"><input type="number" min={0} max={500} value={form.monthlyImageLimit} onChange={(e) => set({ monthlyImageLimit: Number(e.target.value) })} /></Field>
          <Field label="그림 실패 시 자동 재시도 (회)" hint="일시 오류에만. 이미 과금됐을 수 있어 0~2회"><input type="number" min={0} max={2} value={form.imageAutoRetry} onChange={(e) => set({ imageAutoRetry: Number(e.target.value) })} /></Field>
          <Field label="같은 키워드 재조회 간격 (시간)" hint="이 시간 안에는 저장된 조회 결과를 보여 주고 '저장된 결과'로 표시"><input type="number" min={0} max={168} value={form.keywordCacheHours} onChange={(e) => set({ keywordCacheHours: Number(e.target.value) })} /></Field>
        </div>
        <button className="btn primary" onClick={save}>설정 저장</button>
        <Msg m={msg.m} />
      </div>

      <div className="panel">
        <h2 className="h2-row">백업 · 복원 <Speak ids={['P12']} /></h2>
        <p className="hint">백업에는 글 · 카드 · {APP.place} 정보 · 일반 설정이 들어가요. API 키와 네이버 로그인은 넣지 않아요.</p>
        <div className="row">
          <button className="btn" onClick={() => call('backup:create').then((f) => f && msg.ok(`백업했어요: ${f}`)).catch((e) => msg.err(e))}>백업 만들기</button>
          <button className="btn" onClick={() => call('backup:restore').catch((e) => msg.err(e))}>백업에서 복원</button>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>데이터 폴더: {info.dataDir}</p>
      </div>

      <div className="panel">
        <h2 className="h2-row">이번 달 API 사용 기록 <Speak ids={['P13']} /></h2>
        <p className="hint">요청 횟수 기록이에요. 실제 청구액은 OpenAI 사용량 화면에서 확인해 주세요.</p>
        {usage?.rows.length ? (
          <table className="kw"><thead><tr><th>종류</th><th>모델</th><th>횟수</th><th>마지막</th></tr></thead>
            <tbody>{usage.rows.map((r) => <tr key={r.model + r.kind}><td>{r.kind === 'image' ? '그림' : '글'}</td><td>{r.model}</td><td className="num">{r.calls}</td><td>{r.last.slice(0, 16).replace('T', ' ')}</td></tr>)}</tbody></table>
        ) : <p className="muted">아직 기록이 없어요.</p>}
      </div>
    </>
  );
}

// 설정 맨 위 "전담 비서": 꼭 할 준비 네 가지가 끝났는지 보여 주고, 안 끝난 건 비서와 같이
function SecretaryPanel({ onGuide }: { onGuide: (stepId: string) => void }) {
  const { info, license, go } = useApp();
  const [posts, setPosts] = useState<number | null>(null);
  useEffect(() => { call<unknown[]>('article:list').then((r) => setPosts(r.length)).catch(() => setPosts(0)); }, []);
  const items = [
    { label: '계정 연결', done: !!license && license.state !== 'none', step: 'A01' },
    { label: `${APP.place} 정보`, done: info.hasProfile, step: 'A02' },
    { label: 'AI 연결 (OpenAI)', done: !!info.secrets.openai, step: 'A03' },
    { label: '첫 글 만들어 보기', done: (posts ?? 0) > 0, step: 'A10' },
  ];
  const left = items.filter((i) => !i.done).length;
  const name = license && license.state !== 'none' ? license.dojang : null;
  return (
    <div className="panel secretary">
      <h2>전담 비서</h2>
      <p>{name ? `${name} ${APP.owner}, ` : `${APP.owner}, `}{left ? `블로그를 쓰실 준비 네 가지 중 ${4 - left}가지가 끝났어요. 남은 건 제가 같이 챙겨 드릴게요.` : '준비가 모두 끝났어요. 이제 수업 메모 한 줄이면 블로그 글이 나와요.'}</p>
      <ul className="checklist">
        {items.map((i) => (
          <li key={i.label} className={i.done ? 'done' : ''}>
            <span className="mark" aria-hidden="true">{i.done ? '●' : '○'}</span>
            <span className="grow">{i.label}</span>
            {i.done ? <span className="badge ok">끝</span> : i.step === 'A10'
              ? <button className="btn small primary" onClick={() => go({ page: 'new' })}>새 글 쓰러 가기</button>
              : <button className="btn small primary" onClick={() => onGuide(i.step)}>🔊 비서와 같이 하기</button>}
          </li>
        ))}
      </ul>
      <p className="hint">각 칸 제목 옆 [🔊 설명 듣기]를 누르면 그 칸을 설명해 드려요 (안내 음성은 AI 목소리예요). 처음부터 다시 하려면 <button className="btn link" onClick={() => onGuide('A00')}>설치 도우미 처음부터</button></p>
    </div>
  );
}
