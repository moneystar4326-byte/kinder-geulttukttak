// 로컬 SQLite (node:sqlite, Electron 44 · Node 24 내장 — 따로 빌드할 모듈 없음)
// API 비밀키 · 네이버 쿠키는 여기에 저장하지 않음 (credentials · browser-profile 따로)
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { Article, ArticleInput, ArticleStatus, ArticleSummary, ArticleVersion, Card, CardSet, DojoProfile, Job, JobState, KeywordRow } from '../../shared/types';
import { IND } from '../../shared/industry';

export const SCHEMA_VERSION = 1;

const MIGRATIONS: string[] = [
  // 1
  `CREATE TABLE dojo_profiles (id TEXT PRIMARY KEY, name TEXT NOT NULL, region TEXT NOT NULL, facts_json TEXT NOT NULL, brand_json TEXT NOT NULL, updated_at TEXT NOT NULL);
   CREATE TABLE articles (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, input_json TEXT NOT NULL, selected_keywords_json TEXT NOT NULL, current_version_id TEXT, status TEXT NOT NULL, demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
   CREATE TABLE article_versions (id TEXT PRIMARY KEY, article_id TEXT NOT NULL, title TEXT NOT NULL, titles_json TEXT NOT NULL, document_json TEXT NOT NULL, tags_json TEXT NOT NULL, counts_json TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL);
   CREATE INDEX article_versions_article ON article_versions(article_id, created_at);
   CREATE TABLE keyword_lookups (id INTEGER PRIMARY KEY AUTOINCREMENT, query TEXT NOT NULL, source TEXT NOT NULL, raw_response TEXT NOT NULL, normalized_json TEXT NOT NULL, fetched_at TEXT NOT NULL);
   CREATE INDEX keyword_lookups_query ON keyword_lookups(query, source, fetched_at);
   CREATE TABLE card_sets (id TEXT PRIMARY KEY, article_version_id TEXT NOT NULL, status TEXT NOT NULL, style_json TEXT NOT NULL, created_at TEXT NOT NULL);
   CREATE TABLE cards (id TEXT PRIMARY KEY, card_set_id TEXT NOT NULL, idx INTEGER NOT NULL, copy_json TEXT NOT NULL, background_path TEXT, output_path TEXT, status TEXT NOT NULL, error TEXT, overflow INTEGER NOT NULL DEFAULT 0, after_section_id TEXT);
   CREATE TABLE jobs (id TEXT PRIMARY KEY, type TEXT NOT NULL, entity_id TEXT NOT NULL, state TEXT NOT NULL, step TEXT NOT NULL, progress_json TEXT NOT NULL DEFAULT '{}', error_code TEXT, message TEXT, started_at TEXT NOT NULL, updated_at TEXT NOT NULL);
   CREATE TABLE usage_records (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT, provider TEXT NOT NULL, model TEXT NOT NULL, kind TEXT NOT NULL, reported_usage_json TEXT NOT NULL, estimate_json TEXT NOT NULL, created_at TEXT NOT NULL);
   CREATE TABLE settings (key TEXT PRIMARY KEY, nonsecret_value TEXT NOT NULL);`,
];

const now = () => new Date().toISOString();
const j = (v: unknown) => JSON.stringify(v);
const p = <T>(s: unknown, d: T): T => { try { return s == null ? d : (JSON.parse(String(s)) as T); } catch { return d; } };

export type Db = ReturnType<typeof openDb>;

export function openDb(file: string) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const ver = Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
  if (ver > SCHEMA_VERSION) throw new Error(`이 자료는 더 새 버전(${ver})의 ${IND.appName}에서 만들어졌어요. 프로그램을 업데이트해 주세요.`);
  for (let v = ver; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try { db.exec(MIGRATIONS[v]); db.exec(`PRAGMA user_version = ${v + 1}`); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  const all = (sql: string, ...a: any[]) => db.prepare(sql).all(...a) as any[];
  const get = (sql: string, ...a: any[]) => db.prepare(sql).get(...a) as any;
  const run = (sql: string, ...a: any[]) => db.prepare(sql).run(...a);

  // ---------- 도장 프로필 (MVP는 기본 1개, 모델은 여러 개 가능) ----------
  const rowToProfile = (r: any): DojoProfile => ({ ...p<any>(r.facts_json, {}), id: r.id, name: r.name, region: r.region, brand: p(r.brand_json, IND.brand), updatedAt: r.updated_at });
  function saveProfile(pr: DojoProfile) {
    const { id, name, region, brand, updatedAt: _u, ...facts } = pr;
    run(`INSERT INTO dojo_profiles (id,name,region,facts_json,brand_json,updated_at) VALUES (?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, region=excluded.region, facts_json=excluded.facts_json, brand_json=excluded.brand_json, updated_at=excluded.updated_at`,
      id || 'default', name, region, j(facts), j(brand), now());
    return getProfile(id || 'default')!;
  }
  const getProfile = (id = 'default'): DojoProfile | null => { const r = get('SELECT * FROM dojo_profiles WHERE id=?', id); return r ? rowToProfile(r) : null; };

  // ---------- 글 ----------
  const rowToArticle = (r: any): Article => ({
    id: r.id, profileId: r.profile_id, input: p(r.input_json, {} as ArticleInput), keywords: p(r.selected_keywords_json, [] as KeywordRow[]),
    currentVersionId: r.current_version_id, status: r.status, demo: !!r.demo, createdAt: r.created_at, updatedAt: r.updated_at,
  });
  function createArticle(profileId: string, input: ArticleInput, keywords: KeywordRow[], demo: boolean): Article {
    const id = randomUUID();
    run('INSERT INTO articles (id,profile_id,input_json,selected_keywords_json,current_version_id,status,demo,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
      id, profileId, j(input), j(keywords), null, 'draft', demo ? 1 : 0, now(), now());
    return getArticle(id)!;
  }
  const getArticle = (id: string): Article | null => { const r = get('SELECT * FROM articles WHERE id=?', id); return r ? rowToArticle(r) : null; };
  function updateArticleInput(id: string, input: ArticleInput, keywords: KeywordRow[]) {
    run('UPDATE articles SET input_json=?, selected_keywords_json=?, updated_at=? WHERE id=?', j(input), j(keywords), now(), id);
  }
  const setArticleStatus = (id: string, status: ArticleStatus) => run('UPDATE articles SET status=?, updated_at=? WHERE id=?', status, now(), id);
  function listArticles(): ArticleSummary[] {
    return all(`SELECT a.id, a.input_json, a.status, a.demo, a.updated_at, v.title FROM articles a LEFT JOIN article_versions v ON v.id = a.current_version_id ORDER BY a.updated_at DESC`)
      .map((r) => { const i = p<ArticleInput>(r.input_json, {} as ArticleInput); return { id: r.id, kind: i.kind, topic: i.topic, status: r.status, title: r.title ?? '', updatedAt: r.updated_at, demo: !!r.demo }; });
  }
  function deleteArticle(id: string) {
    db.exec('BEGIN');
    try {
      for (const s of all('SELECT cs.id FROM card_sets cs JOIN article_versions v ON v.id = cs.article_version_id WHERE v.article_id=?', id)) run('DELETE FROM cards WHERE card_set_id=?', s.id);
      run('DELETE FROM card_sets WHERE article_version_id IN (SELECT id FROM article_versions WHERE article_id=?)', id);
      run('DELETE FROM article_versions WHERE article_id=?', id);
      run('DELETE FROM articles WHERE id=?', id);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }

  // ---------- 버전 ----------
  // 비동기 결과가 사용자가 고치는 글을 덮어쓰지 않게: baseVersionId 가 현재 버전과 다르면 새 버전은 만들되 현재 버전으로 올리지 않음
  function addVersion(v: Omit<ArticleVersion, 'id' | 'createdAt'>, opts: { baseVersionId?: string | null; makeCurrent?: boolean } = {}) {
    const id = randomUUID();
    const art = getArticle(v.articleId);
    if (!art) throw new Error('글을 찾지 못했어요');
    const stale = opts.baseVersionId !== undefined && opts.baseVersionId !== art.currentVersionId;
    run('INSERT INTO article_versions (id,article_id,title,titles_json,document_json,tags_json,counts_json,note,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      id, v.articleId, v.title, j(v.doc.titleCandidates), j(v.doc), j(v.doc.tags), j(v.counts), v.note, now());
    const current = (opts.makeCurrent ?? true) && !stale;
    if (current) run('UPDATE articles SET current_version_id=?, updated_at=? WHERE id=?', id, now(), v.articleId);
    return { version: getVersion(id)!, current, stale };
  }
  const rowToVersion = (r: any): ArticleVersion => ({ id: r.id, articleId: r.article_id, title: r.title, doc: p(r.document_json, null as any), counts: p(r.counts_json, { withSpaces: 0, withoutSpaces: 0 }), note: r.note, createdAt: r.created_at });
  const getVersion = (id: string): ArticleVersion | null => { const r = get('SELECT * FROM article_versions WHERE id=?', id); return r ? rowToVersion(r) : null; };
  const listVersions = (articleId: string) => all('SELECT * FROM article_versions WHERE article_id=? ORDER BY created_at DESC, rowid DESC', articleId).map(rowToVersion);
  // 직접 편집 자동 저장: 같은 편집 묶음(현재 버전이 '직접 편집'이고 30분 안)이면 그 버전을 고쳐 씀 → 버전이 쌓이지 않게
  function saveUserEdit(articleId: string, title: string, doc: ArticleVersion['doc'], counts: ArticleVersion['counts']) {
    const art = getArticle(articleId);
    if (!art) throw new Error('글을 찾지 못했어요');
    const cur = art.currentVersionId ? getVersion(art.currentVersionId) : null;
    // 덮어쓰기는 현재 버전이 가장 최근 '직접 편집'이고 30분 안이며, 그 글에 AI 작업이 돌지 않을 때만
    // (AI 작업이 base 로 잡은 버전을 그 자리에서 바꾸면 늦게 온 AI 결과가 최신 편집을 밀어냄 — 2026-10-18 버그 점검)
    const latest = get('SELECT id FROM article_versions WHERE article_id=? ORDER BY created_at DESC, rowid DESC LIMIT 1', articleId)?.id;
    const aiBusy = !!get("SELECT 1 FROM jobs WHERE entity_id=? AND type IN ('article','revise') AND state IN ('queued','running') LIMIT 1", articleId);
    if (cur && cur.note === '직접 편집' && cur.id === latest && !aiBusy && Date.now() - Date.parse(cur.createdAt) < 30 * 60_000) {
      run('UPDATE article_versions SET title=?, titles_json=?, document_json=?, tags_json=?, counts_json=? WHERE id=?', title, j(doc.titleCandidates), j(doc), j(doc.tags), j(counts), cur.id);
      run('UPDATE articles SET updated_at=? WHERE id=?', now(), articleId);
      return getVersion(cur.id)!;
    }
    return addVersion({ articleId, title, doc, counts, note: '직접 편집' }, { makeCurrent: true }).version;
  }
  const setCurrentVersion = (articleId: string, versionId: string) => run('UPDATE articles SET current_version_id=?, updated_at=? WHERE id=? AND EXISTS (SELECT 1 FROM article_versions WHERE id=? AND article_id=?)', versionId, now(), articleId, versionId, articleId);

  // ---------- 키워드 조회 기록 ----------
  function saveLookup(query: string, source: string, raw: string, rows: KeywordRow[]) {
    run('INSERT INTO keyword_lookups (query,source,raw_response,normalized_json,fetched_at) VALUES (?,?,?,?,?)', query, source, raw, j(rows), now());
  }
  function cachedLookup(query: string, source: string, maxAgeMs: number): { rows: KeywordRow[]; fetchedAt: string } | null {
    const r = get('SELECT normalized_json, fetched_at FROM keyword_lookups WHERE query=? AND source=? ORDER BY fetched_at DESC LIMIT 1', query, source);
    if (!r || Date.now() - Date.parse(r.fetched_at) > maxAgeMs) return null;
    return { rows: p(r.normalized_json, []), fetchedAt: r.fetched_at };
  }

  // ---------- 카드 ----------
  const rowToCard = (r: any): Card => ({ id: r.id, cardSetId: r.card_set_id, index: r.idx, copy: p(r.copy_json, { title: '', sub: '', scene: '' }), backgroundPath: r.background_path ?? undefined, outputPath: r.output_path ?? undefined, status: r.status, error: r.error ?? undefined, overflow: !!r.overflow, afterSectionId: r.after_section_id ?? undefined });
  function createCardSet(articleVersionId: string, style: CardSet['style'], copies: (Card['copy'] & { afterSectionId?: string })[]): CardSet {
    const id = randomUUID();
    db.exec('BEGIN');
    try {
      run('INSERT INTO card_sets (id,article_version_id,status,style_json,created_at) VALUES (?,?,?,?,?)', id, articleVersionId, 'pending', j(style), now());
      copies.forEach((c, i) => run('INSERT INTO cards (id,card_set_id,idx,copy_json,status,after_section_id) VALUES (?,?,?,?,?,?)', randomUUID(), id, i, j({ title: c.title, sub: c.sub, scene: c.scene }), 'pending', c.afterSectionId ?? null));
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return getCardSet(id)!;
  }
  function getCardSet(id: string): CardSet | null {
    const r = get('SELECT * FROM card_sets WHERE id=?', id);
    if (!r) return null;
    return { id: r.id, articleVersionId: r.article_version_id, status: r.status, style: p(r.style_json, { style: '따뜻한 일러스트', size: '1080x1350', mode: 'template' }), cards: all('SELECT * FROM cards WHERE card_set_id=? ORDER BY idx', id).map(rowToCard) };
  }
  // 글의 가장 최근 카드 세트 (버전이 바뀌어도 카드는 이어서 씀)
  function latestCardSet(articleId: string): CardSet | null {
    const r = get('SELECT cs.id FROM card_sets cs JOIN article_versions v ON v.id = cs.article_version_id WHERE v.article_id=? ORDER BY cs.created_at DESC, cs.rowid DESC LIMIT 1', articleId);
    return r ? getCardSet(r.id) : null;
  }
  function updateCard(id: string, patch: Partial<Pick<Card, 'copy' | 'backgroundPath' | 'outputPath' | 'status' | 'error' | 'overflow' | 'afterSectionId'>>) {
    const c = rowToCard(get('SELECT * FROM cards WHERE id=?', id));
    const n = { ...c, ...patch };
    run('UPDATE cards SET copy_json=?, background_path=?, output_path=?, status=?, error=?, overflow=?, after_section_id=? WHERE id=?',
      j(n.copy), n.backgroundPath ?? null, n.outputPath ?? null, n.status, patch.status === 'done' ? null : (n.error ?? null), n.overflow ? 1 : 0, n.afterSectionId ?? null, id);
    return rowToCard(get('SELECT * FROM cards WHERE id=?', id));
  }
  const getCard = (id: string): Card | null => { const r = get('SELECT * FROM cards WHERE id=?', id); return r ? rowToCard(r) : null; };
  function refreshCardSetStatus(id: string) {
    const cs = getCardSet(id)!;
    const done = cs.cards.filter((c) => c.status === 'done').length, failed = cs.cards.filter((c) => c.status === 'failed').length;
    const st = cs.cards.some((c) => c.status === 'running') ? 'running' : done === cs.cards.length ? 'done' : failed === cs.cards.length ? 'failed' : done || failed ? 'partial' : 'pending';
    run('UPDATE card_sets SET status=? WHERE id=?', st, id);
    return getCardSet(id)!;
  }
  const setCardSetStyle = (id: string, style: CardSet['style']) => run('UPDATE card_sets SET style_json=? WHERE id=?', j(style), id);

  // ---------- 작업 ----------
  const rowToJob = (r: any): Job => ({ id: r.id, type: r.type, entityId: r.entity_id, state: r.state, step: r.step, startedAt: r.started_at, updatedAt: r.updated_at, errorCode: r.error_code ?? undefined, message: r.message ?? undefined });
  function createJob(type: Job['type'], entityId: string, step: string): Job {
    const id = randomUUID();
    run('INSERT INTO jobs (id,type,entity_id,state,step,started_at,updated_at) VALUES (?,?,?,?,?,?,?)', id, type, entityId, 'running', step, now(), now());
    return getJob(id)!;
  }
  const getJob = (id: string): Job | null => { const r = get('SELECT * FROM jobs WHERE id=?', id); return r ? rowToJob(r) : null; };
  function updateJob(id: string, patch: { state?: JobState; step?: string; errorCode?: string | null; message?: string | null }) {
    const c = getJob(id)!;
    run('UPDATE jobs SET state=?, step=?, error_code=?, message=?, updated_at=? WHERE id=?', patch.state ?? c.state, patch.step ?? c.step,
      patch.errorCode === undefined ? (c.errorCode ?? null) : patch.errorCode, patch.message === undefined ? (c.message ?? null) : patch.message, now(), id);
    return getJob(id)!;
  }
  const activeJob = (type: Job['type'], entityId: string): Job | null => { const r = get("SELECT * FROM jobs WHERE type=? AND entity_id=? AND state IN ('queued','running') ORDER BY started_at DESC LIMIT 1", type, entityId); return r ? rowToJob(r) : null; };
  const recentJobs = (entityId: string) => all('SELECT * FROM jobs WHERE entity_id=? ORDER BY started_at DESC LIMIT 20', entityId).map(rowToJob);
  // 앱 재실행: 돌던 작업은 interrupted (재시도는 사용자 선택). 글 상태도 되돌림
  function recoverInterrupted() {
    const rows = all("SELECT * FROM jobs WHERE state IN ('queued','running')");
    for (const r of rows) run("UPDATE jobs SET state='interrupted', message='프로그램이 꺼져서 멈췄어요. 다시 시도할 수 있어요.', updated_at=? WHERE id=?", now(), r.id);
    run("UPDATE articles SET status = CASE WHEN current_version_id IS NULL THEN 'draft' ELSE 'review' END WHERE status IN ('generating','validating')");
    const sets = all("SELECT DISTINCT card_set_id FROM cards WHERE status='running'");
    run("UPDATE cards SET status='failed', error='프로그램이 꺼져서 멈췄어요' WHERE status='running'");
    for (const s of sets) refreshCardSetStatus(s.card_set_id);
    return rows.length;
  }

  // ---------- 사용량 ----------
  function addUsage(r: { jobId?: string; provider: string; model: string; kind: string; reported: unknown; estimate: unknown }) {
    run('INSERT INTO usage_records (job_id,provider,model,kind,reported_usage_json,estimate_json,created_at) VALUES (?,?,?,?,?,?,?)', r.jobId ?? null, r.provider, r.model, r.kind, j(r.reported), j(r.estimate), now());
  }
  function usageSummary(sinceIso: string) {
    return all('SELECT provider, model, kind, COUNT(*) AS calls, MAX(created_at) AS last FROM usage_records WHERE created_at >= ? GROUP BY provider, model, kind ORDER BY provider, kind', sinceIso) as { provider: string; model: string; kind: string; calls: number; last: string }[];
  }
  const countUsage = (kind: string, sinceIso: string) => Number(get('SELECT COUNT(*) AS n FROM usage_records WHERE kind=? AND created_at >= ?', kind, sinceIso).n);

  // ---------- 일반 설정 (비밀 아님) ----------
  const getSetting = <T>(key: string, d: T): T => p(get('SELECT nonsecret_value FROM settings WHERE key=?', key)?.nonsecret_value, d);
  const setSetting = (key: string, v: unknown) => run('INSERT INTO settings (key, nonsecret_value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET nonsecret_value=excluded.nonsecret_value', key, j(v));

  return {
    raw: db, close: () => db.close(),
    saveProfile, getProfile,
    createArticle, getArticle, updateArticleInput, setArticleStatus, listArticles, deleteArticle,
    addVersion, getVersion, listVersions, setCurrentVersion, saveUserEdit,
    saveLookup, cachedLookup,
    createCardSet, getCardSet, latestCardSet, updateCard, getCard, refreshCardSetStatus, setCardSetStyle,
    createJob, getJob, updateJob, activeJob, recentJobs, recoverInterrupted,
    addUsage, usageSummary, countUsage,
    getSetting, setSetting,
  };
}
