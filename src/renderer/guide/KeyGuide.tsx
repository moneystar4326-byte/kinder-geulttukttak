// 선택 기능 연결 도우미: 네이버 검색광고 키(N) · 카카오 지도 키(K)
// 화면 이름 · 캡처는 2026-10-23 실제 화면 기준 (광고주센터 도구 → SA API 사용 관리 / 카카오 개발자 앱 → 플랫폼 키 · 제품 설정 → 카카오맵)
// 설치 도우미(SetupGuide)와 같은 틀: 대본 말풍선 · 캡처 · [화면 열기] · [복사한 값 가져오기] · 막히면 담당자
import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { call } from '../api';
import { Bubble, HelpBox, line, open } from './voice';
import { KeyImport } from './SetupGuide';
import { IND } from '../../shared/industry';

type Step = { id: string; title: string; shot?: string; url?: string };
const FLOWS: Record<'naver' | 'kakao', { name: string; steps: Step[] }> = {
  naver: {
    name: '네이버 검색광고 연결',
    steps: [
      { id: 'N00', title: '시작' },
      { id: 'N01', title: '로그인', url: 'https://searchad.naver.com/' },
      { id: 'N01b', title: '처음 가입', url: 'https://searchad.naver.com/' },
      { id: 'N02', title: '메뉴 찾기', shot: 'nv-1-menu.jpg' },
      { id: 'N03', title: 'API 신청', shot: 'nv-2-keys.jpg' },
      { id: 'N04', title: '엑세스라이선스', shot: 'nv-2-keys.jpg' },
      { id: 'N05', title: '비밀키', shot: 'nv-2-keys.jpg' },
      { id: 'N06', title: 'CUSTOMER_ID', shot: 'nv-2-keys.jpg' },
      { id: 'N07', title: '끝' },
    ],
  },
  kakao: {
    name: '카카오 지도 연결',
    steps: [
      { id: 'K00', title: '시작' },
      { id: 'K01', title: '앱 목록', shot: 'kk-1-apps.jpg', url: 'https://developers.kakao.com/console/app' },
      { id: 'K02', title: '앱 만들기', shot: 'kk-1b-create.jpg' },
      { id: 'K03', title: '카카오맵 메뉴', shot: 'kk-2-menu.jpg' },
      { id: 'K04', title: '카카오맵 켜기', shot: 'kk-3-map.jpg' },
      { id: 'K05', title: '플랫폼 키 찾기', shot: 'kk-2-menu.jpg' },
      { id: 'K05b', title: 'REST API 키', shot: 'kk-4-key.jpg' },
      { id: 'K06', title: '끝' },
    ],
  },
};

export function KeyGuide({ flow, onClose }: { flow: 'naver' | 'kakao'; onClose: () => void }) {
  const { info, reload } = useApp();
  const F = FLOWS[flow];
  const [idx, setIdx] = useState(0);
  const [extra, setExtra] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const step = F.steps[idx];
  const l = line(step.id);
  const at = (id: string) => setIdx(F.steps.findIndex((s) => s.id === id));
  const next = () => setIdx((i) => Math.min(i + 1, F.steps.length - 1));
  useEffect(() => { setExtra(null); setHelp(false); }, [step.id]);
  const done = async () => { await reload(); onClose(); };
  const hasNaver = !!info.secrets.naverApiKey && !!info.secrets.naverSecret;

  const btn = (i: number, onClick: () => void, primary = false) => l.buttons?.[i] && <button type="button" className={`btn ${primary ? 'primary' : ''}`} onClick={onClick}>{l.buttons[i]}</button>;
  const body = (() => {
    switch (step.id) {
      case 'N00': case 'K00': return <div className="row">{btn(0, next, true)}{btn(1, onClose)}</div>;
      case 'N01': return <div className="row"><button type="button" className="btn" onClick={() => open(step.url!)}>광고주센터 열기</button>{btn(0, () => at('N02'), true)}{btn(1, next)}</div>;
      case 'N01b': return <div className="row"><button type="button" className="btn" onClick={() => open(step.url!)}>광고주센터 열기</button>{btn(0, next, true)}{btn(1, () => setHelp(true))}</div>;
      case 'N02': case 'K03': case 'K05': return <div className="row">{btn(0, next, true)}{btn(1, () => setExtra('E05'))}</div>;
      case 'N03': case 'K04': return <div className="row">{btn(0, next, true)}{btn(1, () => setExtra('E05'))}</div>;
      case 'N04': return <KeyImport name="naverApiKey" test={null} label="복사한 값 가져오기" placeholder="엑세스라이선스 붙여넣기" hasKey={!!info.secrets.naverApiKey} onDone={async () => { await reload(); next(); }} />;
      case 'N05': return <KeyImport name="naverSecret" test={null} label="복사한 값 가져오기" placeholder="비밀키 붙여넣기" hasKey={!!info.secrets.naverSecret} onDone={async () => { await reload(); next(); }} />;
      case 'N06': return <CustomerId ready={hasNaver} onOk={async () => { await reload(); next(); }} onFail={() => setExtra('E09')} />;
      case 'K01': return <div className="row"><button type="button" className="btn" onClick={() => open(step.url!)}>카카오 개발자 열기</button>{btn(0, next, true)}{btn(1, () => at('K03'))}</div>;
      case 'K02': return <div className="row">{btn(0, next, true)}{btn(1, () => setExtra('E05'))}</div>;
      case 'K05b': return <KeyImport name="kakao" test="kakao" label="복사한 값 가져오기" placeholder="REST API 키 붙여넣기" hasKey={!!info.secrets.kakao} onDone={async () => { await reload(); next(); }} onError={() => setExtra('E09')} />;
      case 'N07': case 'K06': return <div className="row"><button type="button" className="btn primary" onClick={done}>닫기</button></div>;
      default: return null;
    }
  })();

  return (
    <div className="guide modal" role="dialog" aria-label={`글뚝딱 전담 비서 · ${F.name}`}>
      <div className="guide-card">
        <div className="guide-bar">
          <b>{F.name} · {idx + 1} / {F.steps.length} · {step.title}</b>
          <div className="guide-prog" aria-hidden="true">{F.steps.map((s, i) => <i key={s.id} className={i < idx ? 'done' : i === idx ? 'now' : ''} />)}</div>
          <button type="button" className="btn small" onClick={onClose}>닫기</button>
        </div>
        <div className={`guide-body ${step.shot ? 'two' : ''}`}>
          <div className="guide-chat">
            <Bubble id={step.id} key={step.id} />
            {extra && <Bubble id={extra} key={extra} />}
            {extra === 'E09' && flow === 'kakao' && <button type="button" className="btn link" onClick={() => at('K04')}>카카오맵 켜기 단계로 돌아가기</button>}
            {body}
            {help ? <HelpBox where={`${F.name} ${idx + 1}번 (${step.title})`} onClose={() => setHelp(false)} /> : (
              <button type="button" className="btn help" onClick={() => setHelp(true)}>막혔어요 · 담당자 부르기</button>
            )}
            {idx > 0 && <button type="button" className="btn link back" onClick={() => setIdx(idx - 1)}>← 이전 단계</button>}
          </div>
          {step.shot && (
            <div className="guide-shot">
              <img src={`./guide/${step.shot}`} alt={`${step.title} 화면 예시`} />
              <span className="hint">실제 화면 (2026-10-23, 키 · 계정 번호는 가렸어요). 누를 곳은 빨간 테두리예요. 화면이 다르면 짐작해서 누르지 말고 "화면이 달라요"를 눌러 주세요.</span>
            </div>
          )}
        </div>
        <p className="hint ai-voice">안내 음성은 AI로 만든 목소리예요.</p>
      </div>
    </div>
  );
}

// 네이버 CUSTOMER_ID: 복사 버튼이 없어서 숫자를 적어 넣고 → 저장 → 세 값으로 연결 확인
function CustomerId({ ready, onOk, onFail }: { ready: boolean; onOk: () => void; onFail: () => void }) {
  const { info } = useApp();
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const run = async (save: boolean) => {
    setBusy(true); setMsg(null);
    try {
      if (save) await call('secrets:set', { name: 'naverCustomer', value: v.replace(/\D/g, '') });
      setMsg({ kind: 'ok', text: `연결을 확인하는 중이에요… "${IND.term}"를 한 번 검색해 봐요.` });
      await call('secrets:test', 'naver');
      setMsg({ kind: 'ok', text: '연결됐어요!' }); setTimeout(onOk, 900);
    } catch (e) { setMsg({ kind: 'err', text: (e as Error).message }); onFail(); } finally { setBusy(false); }
  };
  return (
    <div className="mini-form">
      {!ready && <div className="note warn">엑세스라이선스와 비밀키를 먼저 가져와 주세요 (← 이전 단계).</div>}
      <div className="row">
        <input className="grow" inputMode="numeric" placeholder="CUSTOMER_ID 숫자" value={v} onChange={(e) => setV(e.target.value)} />
        <button type="button" className="btn primary" disabled={busy || !ready || !/\d{3,}/.test(v)} onClick={() => run(true)}>{busy ? '확인 중…' : '저장하고 연결 확인'}</button>
        {info.secrets.naverCustomer && <button type="button" className="btn link" disabled={busy || !ready} onClick={() => run(false)}>이미 넣은 값으로 다시 확인</button>}
      </div>
      {msg && <div className={`note ${msg.kind}`}>{msg.text}</div>}
    </div>
  );
}
