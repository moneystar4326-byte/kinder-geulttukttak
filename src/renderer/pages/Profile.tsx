import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { assetUrl, call, type DojoProfile } from '../api';
import { Chips, Field, Msg, useMsg } from '../components/ui';
import { TONES } from '../../shared/types';
import { STRENGTHS } from '../../shared/strengths';
import { APP, KINDER_TYPES, type Writer } from '../../shared/kinder';

const EMPTY: DojoProfile = {
  id: 'default', name: '', region: '', address: '', audiences: [], philosophy: '', classFeatures: '', hours: '', classes: '', promoDay: '', strengths: [], strengthsEtc: '', otherFacts: '', credentials: '', contact: '', consultLink: '', blogUrl: '',
  brand: APP.brand, tone: '따뜻한 설명형', avoidWords: '최고, 무조건', nearbyAreas: [],
};

// 화면 문구
const TX = {
  region: '실제 동 · 구 · 시 (예: 서울 동작구 신대방동)', panel: '교육과정 · 운영 (사실만)', hours: '운영 시간', hoursHint: '예: 교육과정 09:00~13:30, 방과후과정 13:30~17:00, 아침 돌봄 08:00부터',
  classesHint: '예: 햇님반 5세, 달님반 6세, 별님반 7세', promo: '정기 행사', promoHint: '예: 매달 마지막 주 금요일 생일잔치, 분기마다 부모 참여 수업',
  strengths: '우리 유치원 강점', etc: '그 밖의 강점 (쉼표로, 예: 텃밭 가꾸기, 영어 놀이)', other: '학부모에게 알려도 되는 자세한 내용 (예: 등원 시간, 급식 · 간식 방식, 특성화 활동 요일)',
  cred: '원장 · 교사 경력 · 자격', logo: '그림 속 원복에 로고', logoHint: '켜면 AI 그림 속 아이 원복 왼쪽 가슴에 로고를 작게 그려요 (원복 참고 사진이 있을 때만). AI가 그려서 모양 · 글자가 조금 다를 수 있어요 (카드 아래 로고는 늘 원본 그대로)', logoBox: '원복에 로고 넣기',
  refDobok: '원복 참고 사진', refDobokHint: '원복이 있으면 카드 그림의 아이들이 이 옷을 따라 입어요. 아이 얼굴이 나오지 않은 사진만 골라 주세요 (사진 속 로고 · 글자는 따라 그리지 않아요)',
  refCoach: '교실 참고 사진', refCoachHint: '카드 그림의 교실 색 · 가구 느낌만 따라 그려요. 아이 · 선생님 얼굴이 나오지 않은 사진만 골라 주세요',
  nearby: '"[롯데낙천대아파트 유치원]"처럼 제목 앞에 붙일 이름이에요. 가까운 아파트를 먼저 써요. AI가 아니라 고른 이름을 그대로 붙여요.', areaPh: '예: 롯데낙천대아파트, 보라매초',
};


export function ProfilePage() {
  const { info, reload } = useApp();
  const [p, setP] = useState<DojoProfile>(EMPTY);
  const [area, setArea] = useState('');
  const [editAt, setEditAt] = useState<number | null>(null); // 유치원: 주변 장소 이름 고쳐 쓰기 (종류 · 거리는 그대로)
  const msg = useMsg();
  useEffect(() => { call<DojoProfile | null>('profile:get').then((x) => x && setP({ ...EMPTY, ...x, ...(x.strengths ? {} : { strengths: [], otherFacts: x.otherFacts || x.classFeatures }) })); }, []);
  const set = (x: Partial<DojoProfile>) => setP({ ...p, ...x });
  const save = async () => {
    try { setP({ ...EMPTY, ...(await call<DojoProfile>('profile:save', p)) }); await reload(); msg.ok('저장했어요'); } catch (e) { msg.err(e); }
  };
  const nearby = async () => {
    msg.info('주변 장소를 찾는 중…');
    try { setP({ ...EMPTY, ...(await call<DojoProfile>('profile:nearby')) }); msg.ok('주변 학교 · 유치원 · 아파트 · 역 이름을 모았어요. 필요 없는 것은 지워 주세요.'); } catch (e) { msg.err(e); }
  };
  const areas = p.nearbyAreas ?? [];

  return (
    <>
      <div className="head"><h1>{APP.place} 정보</h1><span className="hint">글마다 넣을 항목은 글 작성 화면에서 골라요.</span></div>
      <div className="grid2">
        <div className="panel">
          <h2>기본</h2>
          <Field label={APP.nameLabel} req hint="공식 표기"><input type="text" value={p.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          {<Field label={`${APP.place} 유형`}><Chips options={KINDER_TYPES} value={(p.facilityType ?? '') as any} onChange={(v) => set({ facilityType: v === p.facilityType ? undefined : v })} /></Field>}
          <Field label="소재 지역" req hint={TX.region}><input type="text" value={p.region} onChange={(e) => set({ region: e.target.value })} /></Field>
          <Field label="상세 주소" hint="필요할 때만 본문에 넣어요. 주변 장소 찾기에도 써요"><input type="text" value={p.address ?? ''} onChange={(e) => set({ address: e.target.value })} /></Field>
          <Field label="기본 문체" req><Chips options={TONES} value={p.tone} onChange={(v) => set({ tone: v })} /></Field>
          <Field label="네이버 지도 검색 이름" hint={`글 끝 ${APP.place} 지도 카드를 찾을 때 써요. 네이버 지도에 나오는 이름 그대로 (비우면 ${APP.nameLabel})`}><input type="text" value={p.mapName ?? ''} placeholder={p.name} onChange={(e) => set({ mapName: e.target.value })} /></Field>
          <Field label="네이버 블로그 주소" hint="초안 입력에 필요 (예: https://blog.naver.com/아이디). 블로그가 여러 개면 글을 넣을 블로그"><input type="url" value={p.blogUrl ?? ''} onChange={(e) => set({ blogUrl: e.target.value })} /></Field>
        </div>
        <div className="panel">
          <h2>{TX.panel}</h2>
          <Field label={APP.philLabel} req><textarea value={p.philosophy} onChange={(e) => set({ philosophy: e.target.value })} /></Field>
          <p className="hint" style={{ margin: '4px 0 12px' }}>아래 칸은 지금 실제로 운영하는 것만 적어 주세요. 글을 쓸 때 모아서 AI에게 전달해요.</p>
          <Field label={TX.hours} hint={TX.hoursHint}><input type="text" value={p.hours ?? ''} onChange={(e) => set({ hours: e.target.value })} /></Field>
          <Field label="반 구성" hint={TX.classesHint}><textarea value={p.classes ?? ''} onChange={(e) => set({ classes: e.target.value })} /></Field>
          <Field label={TX.promo} hint={TX.promoHint}><input type="text" value={p.promoDay ?? ''} onChange={(e) => set({ promoDay: e.target.value })} /></Field>
          <Field label={TX.strengths} hint="실제로 하는 것만 눌러 주세요. 누르지 않은 서비스가 글에 나오면 점검 결과에서 알려 드려요">
            <div className="chips">{STRENGTHS.map((x) => {
              const on = (p.strengths ?? []).includes(x.id);
              return <button type="button" key={x.id} className={`chip ${on ? 'on' : ''}`} onClick={() => set({ strengths: on ? (p.strengths ?? []).filter((v) => v !== x.id) : [...(p.strengths ?? []), x.id] })}>{x.label}</button>;
            })}</div>
            <input type="text" style={{ marginTop: 8 }} placeholder={TX.etc} value={p.strengthsEtc ?? ''} onChange={(e) => set({ strengthsEtc: e.target.value })} />
          </Field>
          <Field label="그 밖의 운영 사실" hint={TX.other}><textarea value={p.otherFacts ?? ''} onChange={(e) => set({ otherFacts: e.target.value })} /></Field>
          <Field label={TX.cred} hint="확인 가능한 내용만 적어 주세요. 글에는 고른 경우에만 들어가요"><textarea value={p.credentials ?? ''} onChange={(e) => set({ credentials: e.target.value })} /></Field>
          <Field label="피할 표현" hint="쉼표로 구분 (예: 최고, 무조건)"><input type="text" value={p.avoidWords} onChange={(e) => set({ avoidWords: e.target.value })} /></Field>
        </div>
        {<Writers list={p.writers ?? []} onChange={(writers) => set({ writers })} />}
        <div className="panel">
          <h2>연락 · 브랜드</h2>
          <Field label="연락처" hint="글마다 넣을지 골라요"><input type="text" value={p.contact ?? ''} onChange={(e) => set({ contact: e.target.value })} /></Field>
          <Field label="상담 링크"><input type="url" value={p.consultLink ?? ''} onChange={(e) => set({ consultLink: e.target.value })} /></Field>
          <Field label="첫인사" hint="모든 글 맨 앞에 적은 그대로 붙여요 (AI가 바꾸지 않음). 비우면 AI가 알아서 시작해요">
            <textarea rows={2} value={p.greeting ?? ''} placeholder={`예: 안녕하세요, ${p.name || '○○유치원'}입니다 😊`} onChange={(e) => set({ greeting: e.target.value })} />
          </Field>
          <Field label="끝인사" hint="모든 글 맨 끝에 적은 그대로 붙여요. 글마다 [만들기 설정]에서 뺄 수 있어요">
            <textarea rows={2} value={p.closing ?? ''} placeholder={`예: 오늘도 ${p.name || '○○유치원'}을 아껴 주셔서 감사합니다. 궁금한 점은 언제든 편하게 연락 주세요!`} onChange={(e) => set({ closing: e.target.value })} />
          </Field>
          <Field label="로고" hint="PNG · JPG (투명 PNG 권장). 카드에 따로 얹어요 (AI가 다시 그리지 않음)">
            <div className="row">
              {p.logoPath ? <img src={assetUrl(info.dataDir, p.logoPath)} alt="로고" style={{ height: 48, border: '1px solid var(--line)', borderRadius: 6, padding: 4, background: '#fff' }} /> : <span className="muted">없음</span>}
              <button className="btn small" onClick={async () => { try { const f = await call<string | null>('profile:pickLogo'); if (f) set({ logoPath: f }); } catch (e) { msg.err(e); } }}>파일 고르기</button>
              {p.logoPath && <button className="btn small danger" onClick={() => set({ logoPath: undefined })}>빼기</button>}
            </div>
          </Field>
          {p.logoPath && <LogoSize logo={assetUrl(info.dataDir, p.logoPath)} scale={p.logoScale ?? 120} onChange={(v) => set({ logoScale: v })} />}
          {p.logoPath && (
            <Field label={TX.logo} hint={TX.logoHint}>
              <label className="row"><input type="checkbox" checked={!!p.logoOnDobok} onChange={(e) => set({ logoOnDobok: e.target.checked })} /> {TX.logoBox}</label>
            </Field>
          )}
          {(['dobok', 'coach'] as const).map((kind) => {
            const key = kind === 'dobok' ? 'dobokRefPath' : 'coachRefPath';
            const file = p[key];
            return (
              <Field key={kind} label={kind === 'dobok' ? TX.refDobok : TX.refCoach} hint={kind === 'dobok' ? TX.refDobokHint : TX.refCoachHint}>
                <div className="row">
                  {file ? <img src={assetUrl(info.dataDir, file)} alt="" style={{ height: 72, border: '1px solid var(--line)', borderRadius: 6, background: '#fff' }} /> : <span className="muted">{'없음 (글로만 설명해서 그려요)'}</span>}
                  <button className="btn small" onClick={async () => { try { const f = await call<string | null>('profile:pickRef', kind); if (f) set({ [key]: f } as any); } catch (e) { msg.err(e); } }}>사진 고르기</button>
                  {file && <button className="btn small danger" onClick={() => set({ [key]: undefined } as any)}>빼기</button>}
                </div>
              </Field>
            );
          })}
          <div className="row">
            <Field label="기본색"><input type="color" value={p.brand.main} onChange={(e) => set({ brand: { ...p.brand, main: e.target.value } })} /></Field>
            <Field label="강조색"><input type="color" value={p.brand.accent} onChange={(e) => set({ brand: { ...p.brand, accent: e.target.value } })} /></Field>
          </div>
        </div>
        <div className="panel">
          <h2>주변 장소 이름 (제목 앞 동네 이름용)</h2>
          <p className="hint">{TX.nearby}</p>
          <div className="row" style={{ marginBottom: 10 }}>
            <button className="btn small" disabled={!info.secrets.kakao || !p.address} onClick={nearby}>카카오로 주변 찾기</button>
            {!info.secrets.kakao && <span className="hint">설정에 카카오 키가 없으면 직접 적어 주세요</span>}
          </div>
          <div className="row" style={{ marginBottom: 10 }}>
            <input className="grow" type="text" placeholder={TX.areaPh} value={area} onChange={(e) => setArea(e.target.value)} />
            {editAt != null
              ? <>
                  <button className="btn small primary" disabled={!area.trim()} onClick={() => { set({ nearbyAreas: areas.map((a, j) => (j === editAt ? { ...a, name: area.trim() } : a)) }); setArea(''); setEditAt(null); }}>고치기</button>
                  <button className="btn small" onClick={() => { setArea(''); setEditAt(null); }}>그만두기</button>
                </>
              : <button className="btn small" disabled={!area.trim() || areas.some((a) => a.name.trim() === area.trim())} title={areas.some((a) => a.name.trim() === area.trim()) ? '이미 있는 이름이에요' : undefined} onClick={() => { set({ nearbyAreas: [...areas, { name: area.trim(), kind: /초$/.test(area.trim()) ? '학교' : '직접 입력', source: 'manual' }] }); setArea(''); }}>추가</button>}
          </div>
          {<p className="hint">이름을 누르면 위 칸에서 고쳐 쓸 수 있어요 (종류 · 거리는 그대로). 카카오 아파트 이름에는 제목 · 태그에서 "아파트"가 자동으로 붙어요 ("롯데낙천대" → [롯데낙천대아파트 유치원]).</p>}
          <div className="chips">
            {areas.map((a, i) => (
              <span key={a.name + i} className="chip"><button type="button" className="btn link" title="고쳐 쓰기" onClick={() => { setArea(a.name); setEditAt(i); }}>{a.name}</button> <span className="muted">{a.kind}{a.distance ? ` · ${a.distance}m` : ''}</span>
                <button className="btn link" onClick={() => { set({ nearbyAreas: areas.filter((_, j) => j !== i) }); if (editAt != null) { setEditAt(null); setArea(''); } }}>×</button></span>
            ))}
            {!areas.length && <span className="muted">아직 없어요</span>}
          </div>
        </div>
      </div>
      <div className="row"><button className="btn primary" onClick={save}>{APP.place} 정보 저장</button></div>
      <Msg m={msg.m} />
    </>
  );
}

// 카드 로고 크기 (60~200%). 미리보기는 카드 아래쪽을 1/3 크기로 줄여 보여 줌 (카드 로고 높이 = 64px × 비율)
const PRESETS = [{ v: 80, label: '작게' }, { v: 120, label: '보통' }, { v: 170, label: '크게' }];
function LogoSize({ logo, scale, onChange }: { logo: string; scale: number; onChange: (v: number) => void }) {
  const h = Math.round(64 * scale / 100) / 3;
  return (
    <Field label="카드에 들어가는 로고 크기" hint={`움직이면 미리보기가 바로 바뀌어요. [${APP.place} 정보 저장]을 누르면 새로 만드는 카드부터 적용돼요. 이미 만든 카드는 글 화면 카드 칸의 [이 문구로 스타일 · 크기만 바꾸기]를 누르면 새 크기로 바뀌어요 (스타일을 그대로 두면 AI 그림 비용 없음).`}>
      <div className="logo-size">
        <div className="logo-size-ctl">
          <div className="row">
            <span className="hint">작게</span>
            <input id="logo-scale" type="range" min={60} max={200} step={10} value={scale} onChange={(e) => onChange(Number(e.target.value))} style={{ flex: 1, minWidth: 0 }} />
            <span className="hint">크게</span>
            <b style={{ minWidth: '3.5em', textAlign: 'right' }}>{scale}%</b>
          </div>
          <div className="row">
            {PRESETS.map((p) => <button key={p.v} type="button" className={`chip ${scale === p.v ? 'on' : ''}`} onClick={() => onChange(p.v)}>{p.label}</button>)}
          </div>
        </div>
        <div className="logo-size-preview" aria-label="카드 아래쪽 미리보기">
          <div className="lsp-title">카드 제목이 여기 들어가요</div>
          <div className="lsp-rule" />
          <div className="lsp-sub">부제는 이 정도 길이로 들어가요.</div>
          <img src={logo} alt="" style={{ height: h, maxWidth: '50%', objectFit: 'contain', objectPosition: 'left center', display: 'block', marginTop: 'auto' }} />
        </div>
      </div>
    </Field>
  );
}

// 유치원 글쓴이 (원장님 · 선생님이 같이 씀, 기획안 v0.2 4장). 글 작성 화면에서 "누가 쓰는 글인가요?"로 고름
function Writers({ list, onChange }: { list: Writer[]; onChange: (w: Writer[]) => void }) {
  const add = (role: Writer['role']) => onChange([...list, { id: `w-${Date.now()}`, role, name: '', ...(role === '교사' ? { className: '' } : {}) }]);
  const edit = (i: number, x: Partial<Writer>) => onChange(list.map((w, j) => (j === i ? { ...w, ...x } : w)));
  return (
    <div className="panel">
      <h2>글쓴이 (원장님 · 선생님)</h2>
      <p className="hint">글을 쓸 사람을 적어 두면 글 작성 화면에서 골라요. 선생님 글은 "저희 ○○반" 시점, 원장님 글은 유치원 전체 시점으로 써요. 이름은 글 끝 글쓴이 한 줄을 넣을 때만 써요 (비워도 돼요).</p>
      {list.map((w, i) => (
        <div className="row" key={w.id} style={{ marginBottom: 8 }}>
          <b style={{ minWidth: '4em' }}>{w.role === '원장' ? '원장님' : '선생님'}</b>
          {w.role === '교사' && <input type="text" placeholder="반 이름 (예: 햇님반)" value={w.className ?? ''} onChange={(e) => edit(i, { className: e.target.value })} style={{ width: '10em' }} />}
          <input className="grow" type="text" placeholder="이름 (선택)" value={w.name} onChange={(e) => edit(i, { name: e.target.value })} />
          <button className="btn small danger" onClick={() => onChange(list.filter((_, j) => j !== i))}>빼기</button>
        </div>
      ))}
      {!list.length && <p className="muted">아직 없어요. 없으면 원장님 글로 써요.</p>}
      <div className="row">
        {!list.some((w) => w.role === '원장') && <button className="btn small" onClick={() => add('원장')}>원장님 추가</button>}
        <button className="btn small" onClick={() => add('교사')}>선생님 추가</button>
      </div>
    </div>
  );
}
