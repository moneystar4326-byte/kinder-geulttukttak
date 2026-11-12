// 붙여넣기 도우미 (태권 글뚝딱 2.8.0에서 옮김)
// 앱은 한 단계씩 클립보드에 담고 파일 위치만 열어 줌. 네이버 창은 건드리지 않고, 붙여넣기(Ctrl+V)와 발행은 원장님 · 선생님이 직접
// 유치원판에는 아직 만든 영상이 없어서 영상 고르기 · 영상 단계는 뺐어요 (생기면 '같이 넣을 것' 안에 넣으면 돼요)
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { call, local } from '../api';
import { Msg, useMsg } from './ui';
import { checklist, PASTE_STALE, remap, tagPos as tag, type PastePos as Pos, type PasteStep } from '../../shared/paste';
import { APP } from '../../shared/kinder';

type Opts = { map: boolean };
type Plan = { steps: PasteStep[]; stamp: string; notes: string[]; canOpen: boolean };
const START: Pos = { step: 0, item: 0 };
const STYLE_DONE = '서식을 골랐으면 이제 본문을 붙여 넣어요. 다음 글은 그 서식을 따라가요.';
// 맥은 ⌘ 키. 안내 문구에 같이 씀
const MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);
const PASTE_KEY = MAC ? 'Cmd(⌘)+V' : 'Ctrl+V';
const ALL_KEY = MAC ? 'Cmd(⌘)+A' : 'Ctrl+A';
const UNDO_KEY = MAC ? 'Cmd(⌘)+Z' : 'Ctrl+Z';
const RICH_KEY = 'paste-rich'; // 소제목 꾸며서 복사 (기본 켬). 네이버에서 서식이 이상하면 꺼서 글자만

const stepTitle = (s: PasteStep) => s.kind === 'title' ? '제목' : s.kind === 'style' ? '본문 서식 정하기' : s.kind === 'text' ? `글 · ${s.label}` : s.kind === 'media' ? `그림 · ${s.label}` : `${APP.place} 지도`;

export function PasteHelper({ articleId, opts, beforeStart, blocked, refreshKey, children }: { articleId: string; opts: Opts; beforeStart: () => Promise<void>; blocked?: string; refreshKey?: string; children?: ReactNode }) {
  const key = `paste-pos-${articleId}`;
  const [plan, setPlan] = useState<Plan | null>(null);
  const [active, setActive] = useState(false); // 한 번 시작하면 설정이 바뀔 때 저절로 다시 만듦
  const [pos, setPosState] = useState<Pos>(() => local.get<Pos>(key, START));
  const [copied, setCopied] = useState('');
  const [busy, setBusy] = useState(false); // 누르는 중에는 다른 버튼을 막음 (두 번 눌러 단계를 건너뛰지 않게)
  const [rich, setRichState] = useState(() => local.get<boolean>(RICH_KEY, true) !== false);
  const setRich = (v: boolean) => { setRichState(v); local.set(RICH_KEY, v); };
  const [checked, setChecked] = useState<Record<string, boolean>>({}); // 끝 점검표 (단계를 다시 만들거나 처음부터 하면 비움)
  const msg = useMsg();
  const busyRef = useRef(false);
  const planRef = useRef<Plan | null>(null);
  const posRef = useRef(pos);
  planRef.current = plan;
  posRef.current = pos;
  const pendingRef = useRef(false); // 복사 중에 설정이 바뀌면 끝난 뒤 다시 만듦
  const setPos = (p: Pos, pl: Plan | null = planRef.current) => { const t = pl ? tag(pl, p) : p; posRef.current = t; setPosState(t); local.set(key, t); };

  // 다른 글로 옮기면 그 글의 진행 위치로
  useEffect(() => { setPlan(null); setActive(false); setCopied(''); setChecked({}); msg.clear(); const p = local.get<Pos>(key, START); posRef.current = p; setPosState(p); }, [articleId]); // eslint-disable-line
  // 지도 설정 · 카드가 바뀌면 단계를 다시 만듦
  const optKey = `${JSON.stringify(opts)}|${refreshKey ?? ''}|${blocked ?? ''}`;
  useEffect(() => {
    if (!active) return;
    if (blocked) { setPlan(null); return; }
    if (busyRef.current) { pendingRef.current = true; return; }
    prepare(false);
  }, [optKey]); // eslint-disable-line

  const arg = { articleId, map: opts.map };

  // 단계 만들기. 처음부터(restart)가 아니면 기억해 둔 단계를 새 목록에서 찾아 이어 감
  // (다른 화면에 다녀와도, 단계가 늘거나 줄어도 같은 단계로)
  async function prepare(restart: boolean) {
    try {
      await beforeStart();
      const p = await call<Plan>('paste:plan', arg);
      if (restart || planRef.current?.stamp !== p.stamp) setChecked({}); // 단계가 바뀌면 점검표도 새로
      planRef.current = p;
      setPlan(p);
      setActive(true);
      if (restart) { setPos(START, p); setCopied(''); return; }
      setPos(remap(p, posRef.current), p);
    } catch (e) { setPlan(null); msg.err(e); }
  }

  // 버튼 공통: 저장 안 된 글을 먼저 저장 → 실행. 준비한 뒤 내용이 바뀌었으면 단계를 다시 만들고 알려 줌
  const act = (f: (p: Plan) => Promise<void>) => async () => {
    const p = planRef.current;
    if (!p || busyRef.current) return;
    busyRef.current = true;
    msg.clear();
    setBusy(true);
    try {
      await beforeStart();
      await f(p);
    } catch (e) {
      if (e instanceof Error && e.message === PASTE_STALE) { setCopied(''); pendingRef.current = false; await prepare(false); }
      msg.err(e);
    } finally {
      busyRef.current = false;
      setBusy(false);
      if (pendingRef.current) { pendingRef.current = false; prepare(false); }
    }
  };
  const at = (p: Plan, step: number, item?: number) => ({ ...arg, stamp: p.stamp, step, ...(item !== undefined ? { item } : {}) });
  const copyText = async (p: Plan, step: number, what: string) => { await call('paste:copy', { ...at(p, step), rich }); setCopied(`${what} 복사했어요. 네이버 편집기에서 넣을 자리를 클릭하고 키보드 ${PASTE_KEY} 를 눌러 주세요.`); };
  const copyImage = async (p: Plan, step: number, item: number, label: string) => { await call('paste:copy', at(p, step, item)); setCopied(`"${label}" 그림을 복사했어요. 편집기에서 넣을 자리를 클릭하고 키보드 ${PASTE_KEY} 를 눌러 주세요.`); };
  const show = async (p: Plan, step: number, item: number, label: string) => { await call('paste:show', at(p, step, item)); setCopied(`"${label}" 파일 위치를 열었어요. 편집기로 끌어 놓거나, 편집기 버튼으로 이 파일을 골라 주세요.`); };
  // 다음 단계로. 끝까지 갔으면 사진 글의 사진을 '사용한 사진'으로 기록 (태권 글뚝딱 2.8.0에서 옮김 · 실패해도 진행은 그대로)
  const advance = (p: Plan, step: number) => {
    setPos({ step, item: 0 });
    if (step >= p.steps.length) call('paste:finish', { ...arg, stamp: p.stamp }).catch(() => {});
  };
  // 목록의 단계 버튼: 지금 단계(또는 그 뒤)면 다음으로. 이미 지난 단계를 다시 복사할 때는 위치를 그대로 둠
  // (빠진 것만 다시 붙이려다 위치가 뒤로 가서 뒤쪽 글을 또 붙여 두 번 들어가지 않게)
  const pass = (p: Plan, i: number) => { if (i >= posRef.current.step) advance(p, i + 1); };

  // [다음 ▶]: 지금 단계를 복사(또는 파일 위치 열기)하고 다음으로
  const next = act(async (p) => {
    const { step, item } = posRef.current;
    const s = p.steps[step];
    if (!s) return;
    if (s.kind === 'media') {
      const it = s.items[item];
      if (it) await (it.image ? copyImage(p, step, item, it.label) : show(p, step, item, it.label));
      if (item + 1 < s.items.length) { setPos({ step, item: item + 1 }); return; }
    } else if (s.kind === 'style') setCopied(STYLE_DONE);
    else await copyText(p, step, s.kind === 'place' ? `${APP.place} 이름을` : `"${s.label}"을`);
    advance(p, step + 1);
  });

  const done = plan && pos.step >= plan.steps.length;
  const images = plan?.steps.reduce((n, s) => n + (s.kind === 'media' ? s.items.length : 0), 0) ?? 0;
  return (
    <div className="panel" data-testid="paste-helper">
      <h2>붙여넣기 도우미 <span className="badge warn">시험판</span></h2>
      <p>글을 네이버에 넣는 순서대로 하나씩 복사해 드려요. <b>프로그램은 네이버 창을 건드리지 않아요.</b> 붙여넣기({PASTE_KEY})와 저장 · 발행은 {APP.owner}이 직접 해 주세요.</p>
      <p className="hint">네이버에서는 <b>키보드 {PASTE_KEY}</b>로 붙여 주세요. 오른쪽 클릭 메뉴의 '붙여넣기'는 브라우저가 막는 경우가 많아요.</p>
      <p className="hint">복사한 뒤 카톡 같은 다른 곳에서 또 복사하면 담아 둔 내용이 바뀌어요. 그럴 땐 그 단계의 [복사]를 다시 눌러 주세요. (지난 단계도 다시 누를 수 있어요)</p>
      <label className="row" data-testid="paste-rich"><input type="checkbox" checked={rich} onChange={(e) => setRich(e.target.checked)} disabled={busy} /> 소제목을 굵고 크게 꾸며서 복사</label>
      <p className="hint">{rich ? `네이버에 붙인 글 서식이 이상하면 ${UNDO_KEY} 로 되돌리고, 이 칸을 끈 뒤 다시 복사해 주세요 (글자만 복사 · 소제목은 직접 꾸미기).` : '글자만 복사해요. 소제목은 네이버에서 줄을 고른 뒤 굵게 · 크기 24로 직접 꾸며 주세요.'}</p>
      {children && (
        <details open data-testid="paste-extras" style={{ margin: '8px 0' }}>
          <summary><b style={{ fontSize: 14 }}>같이 넣을 것</b> <span className="hint">(바꾸면 단계가 다시 만들어져요)</span></summary>
          {children}
        </details>
      )}
      {blocked && <p className="note warn">{blocked}</p>}
      <div className="row" style={{ marginBottom: 10 }}>
        <button className="btn small primary" disabled={!!blocked || busy} onClick={() => { msg.clear(); prepare(false); }}>{plan ? '다시 준비' : '도우미 시작'}</button>
        {plan && pos.step > 0 && <button className="btn small" disabled={busy} onClick={() => { setPos(START); setCopied(''); setChecked({}); }}>처음부터</button>}
        {plan?.canOpen && <button className="btn small" disabled={busy} onClick={act(async () => { await call('paste:openWrite'); setCopied('평소 쓰는 브라우저에서 글쓰기 화면을 열었어요. 로그인이 안 돼 있으면 직접 로그인해 주세요.'); })}>네이버 글쓰기 열기</button>}
      </div>
      {plan?.notes.map((n, i) => <p key={i} className="hint">· {n}</p>)}
      {plan && (
        <ol className="paste-steps" style={{ paddingLeft: 0, listStyle: 'none', margin: '8px 0' }}>
          {plan.steps.map((s, i) => {
            const st = i < pos.step ? '✅' : i === pos.step ? '▶' : '○';
            return (
              <li key={i} data-testid={`paste-step-${i}`} style={{ padding: '6px 0', borderTop: '1px solid var(--line, #e5e7eb)', opacity: i < pos.step ? 0.6 : 1 }}>
                <div className="row">
                  <span style={{ width: 22 }}>{st}</span>
                  <b className="grow">{i + 1}. {stepTitle(s)}</b>
                  {(s.kind === 'title' || s.kind === 'text') && <button className="btn small" disabled={busy} onClick={act(async (p) => { await copyText(p, i, `"${s.label}"을`); pass(p, i); })}>복사</button>}
                  {s.kind === 'style' && <button className="btn small" disabled={busy} onClick={act(async (p) => { setCopied(STYLE_DONE); pass(p, i); })}>다 골랐어요</button>}
                  {s.kind === 'place' && <button className="btn small" disabled={busy} onClick={act(async (p) => { await copyText(p, i, `${APP.place} 이름을`); pass(p, i); })}>이름 복사</button>}
                </div>
                {s.kind === 'style' && (
                  <p className="hint" style={{ margin: '4px 0 0 22px' }}>
                    본문을 붙이기 <b>전에</b> 네이버 본문 첫 줄을 클릭하고, 위쪽 도구 모음에서 차례로 골라 주세요: <b>{s.picks.join(' → ')}</b>
                    <br />먼저 골라 두면 이후 붙이는 글이 모두 이 서식을 따라가요. 이미 붙였다면 본문 클릭 → {ALL_KEY} → 같은 값을 고르면 한 번에 바뀌어요.
                  </p>
                )}
                {s.kind === 'text' && i === pos.step && <p className="hint" style={{ margin: '4px 0 0 22px', whiteSpace: 'pre-line' }}>{s.text.length > 120 ? `${s.text.slice(0, 120)}…` : s.text}</p>}
                {s.kind === 'media' && (
                  <div style={{ margin: '4px 0 0 22px' }}>
                    {s.items.map((it, j) => (
                      <div className="row" key={j}>
                        <span className="grow hint">{it.label}{!it.image ? (/움직이는/.test(it.label) ? ' (움직이는 그림이라 파일로 올려요)' : ' (그림으로 복사할 수 없어 파일로 올려요)') : ''}</span>
                        {it.image && <button className="btn small" disabled={busy} onClick={act((p) => copyImage(p, i, j, it.label))}>그림 복사</button>}
                        <button className="btn small" disabled={busy} onClick={act((p) => show(p, i, j, it.label))}>파일 위치</button>
                      </div>
                    ))}
                    {s.missing.map((m, j) => <p key={`m${j}`} className="hint warn-text">{m}: 파일이 없어 빠져요 (다시 만든 뒤 [다시 준비])</p>)}
                  </div>
                )}
                {s.kind === 'place' && <p className="hint" style={{ margin: '4px 0 0 22px' }}>편집기의 [장소] 버튼 → 검색 칸에 붙여넣기 → {s.address ? `주소가 "${s.address}"인 곳을` : `우리 ${APP.place}를`} 골라 주세요.</p>}
              </li>
            );
          })}
        </ol>
      )}
      {plan && !done && <button className="btn primary" data-testid="paste-next" disabled={busy} onClick={next}>다음 복사 ▶ ({pos.step + 1}/{plan.steps.length})</button>}
      {copied && <p className="note ok" style={{ marginTop: 8 }}>{copied}</p>}
      {done && (
        <div className="note ok" style={{ marginTop: 8 }}>
          <b>다 복사했어요.</b> 네이버 창에서 확인해 주세요: 그림 {images}장이 다 들어갔는지, 글 순서가 맞는지.
          <br />저장 · 발행은 {APP.owner}이 직접 눌러 주세요.
        </div>
      )}
      {done && plan && (() => {
        const list = checklist(plan.steps);
        const all = list.every((c) => checked[c.key]);
        return (
          <div className="note" data-testid="paste-check" style={{ marginTop: 8 }}>
            <b>발행 전 점검표</b> <span className="hint">(네이버 창을 보면서 하나씩 체크)</span>
            {list.map((c) => <label className="row" key={c.key} style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}><input type="checkbox" style={{ flex: 'none', marginTop: 3 }} checked={!!checked[c.key]} onChange={(e) => setChecked((m) => ({ ...m, [c.key]: e.target.checked }))} /> <span style={{ flex: 1, minWidth: 0 }}>{c.label}</span></label>)}
            <p className={all ? 'note ok' : 'hint'} style={{ marginTop: 6 }}>{all ? '다 확인했어요. 이제 네이버에서 저장 · 발행을 눌러 주세요.' : `빠진 게 있으면 위 단계의 [복사]를 다시 눌러 그 자리에 붙여 주세요. (${list.filter((c) => checked[c.key]).length}/${list.length})`}</p>
          </div>
        );
      })()}
      <Msg m={msg.m} />
    </div>
  );
}
