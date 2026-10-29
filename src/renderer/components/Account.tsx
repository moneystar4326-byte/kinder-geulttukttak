// 계정 연결 · 이용권 표시 (앱 2.1). 상태는 메인의 license 모듈이 판단하고 여기선 보여 주기만
import { useState } from 'react';
import { call } from '../api';
import { useApp } from '../App';
import { Speak } from '../guide/voice';

export type LicenseStatus =
  | { state: 'none' }
  | { state: 'ok'; plan: 'trial' | 'paid'; daysLeft: number; inGrace: boolean; until: string | null; dojang: string; checkedAt: string | null }
  | { state: 'locked'; why: string; message: string; dojang: string | null; checkedAt: string | null };

export type Latest = { latest: string; must: boolean; notes: string[]; download: string } | null;

const SITE = 'https://kinder.growmoment.co.kr';
const open = (url: string) => call('shell:open', url).catch(() => {});
// 기한은 한국 시각 자정에 끝남 → 그 전날까지로 보여 줌
const lastDay = (iso: string) => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' }).format(new Date(new Date(iso).getTime() - 1));

export function planLine(l: LicenseStatus) {
  if (l.state === 'none') return '계정 연결 전';
  if (l.state === 'locked') return '새 글 만들기 잠김';
  if (l.inGrace) return '입금 확인 기다리는 중';
  if (l.plan === 'paid' && l.until && new Date(l.until).getUTCFullYear() >= 2090) return 'VIP 회원 · 기간 제한 없음'; // 홈페이지 admin_grant_vip (기한 2099-12-31)
  return `${l.plan === 'paid' ? '구독 중' : '무료 체험'} · ${l.daysLeft}일 남음`;
}

function useConnect() {
  const { setLicense } = useApp();
  const [busy, setBusy] = useState<'connect' | 'refresh' | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const connect = async () => {
    setBusy('connect');
    setMsg({ kind: 'info', text: '브라우저에서 카카오로 로그인한 뒤 [이 PC 연결하기]를 눌러 주세요. 기다리는 중…' });
    try { const s = await call<LicenseStatus>('license:connect'); setLicense(s); setMsg({ kind: 'ok', text: '연결됐어요!' }); } catch (e) { setMsg({ kind: 'err', text: (e as Error).message }); } finally { setBusy(null); }
  };
  const refresh = async () => {
    setBusy('refresh');
    try { const s = await call<LicenseStatus>('license:refresh'); setLicense(s); setMsg({ kind: s.state === 'ok' ? 'ok' : 'info', text: s.state === 'ok' ? '최신 이용권으로 확인했어요' : s.state === 'locked' ? s.message : '연결이 해제됐어요. 다시 연결해 주세요' }); } catch (e) { setMsg({ kind: 'err', text: (e as Error).message }); } finally { setBusy(null); }
  };
  return { busy, msg, connect, refresh };
}

// 왼쪽 아래: 지금 상태 한 줄 + 필요하면 [계정 연결]
export function AccountChip() {
  const { license, info, go } = useApp();
  const { busy, connect } = useConnect();
  if (!license) return null;
  const tone = license.state === 'ok' ? (license.inGrace || license.daysLeft <= 3 ? 'warn' : 'ok') : 'err';
  return (
    <div className="acct">
      <button className="acct-line" onClick={() => go({ page: 'settings' })} title="설정에서 자세히">
        <span className={`badge ${tone}`}>{planLine(license)}</span>
        {license.state !== 'none' && license.dojang && <small>{license.dojang}</small>}
      </button>
      {license.state !== 'ok' && (
        <button className="btn small primary" disabled={!!busy} onClick={connect}>{busy ? '연결 기다리는 중…' : '계정 연결'}</button>
      )}
    </div>
  );
}

// 새 글 화면 위: 잠겼거나 연결 전이면 이유와 할 일
export function LockBanner() {
  const { license, info } = useApp();
  const { busy, msg, connect, refresh } = useConnect();
  if (!license) return null;
  if (license.state === 'ok') {
    if (license.inGrace) return <div className="note warn">구독 기간이 지났어요. 입금 확인을 기다리는 동안 며칠은 그대로 쓸 수 있어요.</div>;
    if (license.plan === 'trial' && license.daysLeft <= 3) return <div className="note warn">무료 체험이 {license.daysLeft}일 남았어요. <button className="btn link" onClick={() => open(`${SITE}/price`)}>구독 안내 보기</button></div>;
    return null;
  }
  return (
    <div className="note warn lock">
      <b>{license.state === 'none' ? '계정을 연결해 주세요' : '새 글 만들기가 잠겨 있어요'}</b>
      <p>{license.state === 'none' ? '홈페이지에 가입한 카카오 계정으로 이 PC를 연결하면 바로 쓸 수 있어요. 처음이면 14일 무료예요.' : license.message}</p>
      <p className="muted">지난 글 보기 · 복사 · 내보내기 · 네이버 초안은 그대로 쓸 수 있어요.</p>
      <div className="row">
        {license.state === 'none' || ['other-device', 'other-dojang', 'broken', 'other-product'].includes((license as { why: string }).why)
          ? <button className="btn primary" disabled={!!busy} onClick={connect}>{busy === 'connect' ? '연결 기다리는 중…' : '계정 연결'}</button>
          : <button className="btn primary" disabled={!!busy} onClick={refresh}>{busy === 'refresh' ? '확인 중…' : '다시 확인'}</button>}
        {license.state === 'locked' && ['trial-ended', 'paid-ended'].includes(license.why) && <button className="btn" onClick={() => open(`${SITE}/my`)}>구독 신청 (마이페이지)</button>}
      </div>
      {msg && <div className={`note ${msg.kind}`}>{msg.text}</div>}
    </div>
  );
}

// 설정 화면 맨 위 칸
export function AccountPanel() {
  const { license } = useApp();
  const { busy, msg, connect, refresh } = useConnect();
  const [confirm, setConfirm] = useState(false);
  const { setLicense } = useApp();
  if (!license) return null;
  const unlink = async () => { setLicense(await call<LicenseStatus>('license:unlink')); setConfirm(false); };
  return (
    <div className="panel">
      <h2 className="h2-row">계정 · 이용 기간 <Speak ids={['P01', 'P01b']} /></h2>
      {license.state === 'none' ? (
        <p>아직 이 PC가 계정에 연결되지 않았어요. [계정 연결]을 누르면 브라우저에서 홈페이지 카카오 로그인 화면이 열려요.</p>
      ) : (
        <div className="kv">
          {license.dojang && <><span className="muted">계정</span><b>{license.dojang}</b></>}
          <span className="muted">상태</span><span>{planLine(license)}{license.state === 'ok' && license.until ? ` (${lastDay(license.until)}까지)` : ''}</span>
          {license.state === 'locked' && <><span className="muted">안내</span><span>{license.message}</span></>}
          <span className="muted">마지막 확인</span><span>{license.checkedAt ? new Date(license.checkedAt).toLocaleString('ko-KR') : '-'}</span>
        </div>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        {license.state === 'none'
          ? <button className="btn primary" disabled={!!busy} onClick={connect}>{busy === 'connect' ? '연결 기다리는 중…' : '계정 연결'}</button>
          : <button className="btn" disabled={!!busy} onClick={refresh}>{busy === 'refresh' ? '확인 중…' : '다시 확인'}</button>}
        {license.state !== 'none' && <button className="btn" disabled={!!busy} onClick={connect}>다른 계정으로 다시 연결</button>}
        <button className="btn link" onClick={() => open(`${SITE}/my`)}>마이페이지 (구독 · 입금)</button>
      </div>
      {msg && <div className={`note ${msg.kind}`} style={{ marginTop: 10 }}>{msg.text}</div>}
      {license.state !== 'none' && (
        <p className="hint" style={{ marginTop: 12 }}>
          PC를 바꾸시면 예전 PC 해제를 카카오톡으로 요청해 주세요.{' '}
          {!confirm ? <button className="btn link" onClick={() => setConfirm(true)}>이 PC에서 연결 지우기</button>
            : <>정말 지울까요? 새 글 만들기가 잠겨요. <button className="btn small danger" onClick={unlink}>지우기</button> <button className="btn small" onClick={() => setConfirm(false)}>취소</button></>}
        </p>
      )}
    </div>
  );
}

// 새 버전 알림 띠 (홈페이지가 알려 주는 최신 버전이 더 높을 때)
export function UpdateBar({ latest, onClose }: { latest: Latest; onClose: () => void }) {
  if (!latest) return null;
  return (
    <div className={`updatebar ${latest.must ? 'must' : ''}`}>
      <b>새 버전 {latest.latest}{latest.must ? ' · 꼭 업데이트해 주세요' : '이 나왔어요'}</b>
      {latest.notes.length > 0 && <span className="muted">{latest.notes.join(' · ')}</span>}
      <span style={{ flex: 1 }} />
      <button className="btn small primary" onClick={() => open(latest.download)}>받는 곳 열기</button>
      {!latest.must && <button className="btn small" onClick={onClose}>나중에</button>}
      <Speak ids={['F04']} label="업데이트 방법" />
    </div>
  );
}
