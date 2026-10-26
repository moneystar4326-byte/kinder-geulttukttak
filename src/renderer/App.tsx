import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { call, onJarvis, type AppInfo } from './api';
import { Setup } from './pages/Setup';
import { SettingsPage } from './pages/Settings';
import { ProfilePage } from './pages/Profile';
import { NewArticle } from './pages/NewArticle';
import { History } from './pages/History';
import { ArticlePage } from './pages/ArticlePage';
import { AccountChip, UpdateBar, type Latest, type LicenseStatus } from './components/Account';
import { APP } from '../shared/daycare';

export type Route = { page: 'new' } | { page: 'history' } | { page: 'profile' } | { page: 'settings' } | { page: 'article'; id: string };

type CtxValue = { info: AppInfo; reload: () => Promise<void>; go: (r: Route) => void; license: LicenseStatus | null; setLicense: (l: LicenseStatus) => void };
const Ctx = createContext<CtxValue>(null as any);
export const useApp = () => useContext(Ctx);

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [route, setRoute] = useState<Route>({ page: 'new' });
  const [err, setErr] = useState('');
  const reload = useCallback(async () => { try { setInfo(await call<AppInfo>('app:info')); } catch (e) { setErr((e as Error).message); } }, []);
  useEffect(() => { reload(); }, [reload]);
  // 이용권 상태: 켤 때 · 1분마다 · 창으로 돌아올 때 (메인이 6시간마다 서버에서 새로 받음)
  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [latest, setLatest] = useState<Latest>(null);
  useEffect(() => {
    const load = () => call<LicenseStatus>('license:status').then(setLicense).catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    window.addEventListener('focus', load);
    call<Latest>('app:latest').then(setLatest).catch(() => {});
    return () => { clearInterval(t); window.removeEventListener('focus', load); };
  }, []);
  // 자비스가 넘긴 주제 (켤 때 · 이미 켜져 있을 때) → 새 글 작성 화면에서 바로 쓰기
  const [jarvis, setJarvis] = useState<{ text: string; n: number } | null>(null);
  useEffect(() => {
    const take = () => call<string>('jarvis:take').then((t) => { if (t) { setJarvis({ text: t, n: Date.now() }); setRoute({ page: 'new' }); } }).catch(() => {});
    take();
    return onJarvis(take);
  }, []);
  const value = { info: info!, reload, go: setRoute, license, setLicense };

  if (err) return <div className="main"><div className="note err">프로그램을 시작하지 못했어요: {err}</div></div>;
  if (!info) return <div className="main muted">불러오는 중…</div>;
  if (!info.settings.setupDone) return <Ctx.Provider value={value}><div className="main"><Setup /></div></Ctx.Provider>;

  const nav = (page: Route['page'], label: string) => (
    <button className={`nav ${route.page === page || (page === 'history' && route.page === 'article') ? 'on' : ''}`} onClick={() => setRoute({ page } as Route)}>{label}</button>
  );
  return (
    <Ctx.Provider value={value}>
      <div className="app">
        <aside className="side">
          <div className="brand">{APP.appName}<small>{APP.appSub}</small></div>
          {nav('new', '새 글 작성')}
          {nav('history', '작성 이력')}
          {nav('profile', `${APP.place} 정보`)}
          {nav('settings', '설정')}
          <AccountChip />
          <div className="foot">
            v{info.version}
          </div>
        </aside>
        <main className="main">
          <UpdateBar latest={latest} onClose={() => setLatest(null)} />
          <div className="page">
            {route.page === 'new' && <NewArticle jarvis={jarvis} onJarvisDone={() => setJarvis(null)} />}
            {route.page === 'history' && <History />}
            {route.page === 'profile' && <ProfilePage />}
            {route.page === 'settings' && <SettingsPage />}
            {route.page === 'article' && <ArticlePage id={route.id} key={route.id} />}
          </div>
        </main>
      </div>
    </Ctx.Provider>
  );
}
