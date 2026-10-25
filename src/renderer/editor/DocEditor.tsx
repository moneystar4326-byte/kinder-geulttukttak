// 본문 편집: 소제목 · 문단을 안정적인 id 로 유지
import type { ArticleDoc } from '../../shared/types';
import { countChars, countDoc, minCharsFor } from '../../shared/count';

export interface Draft { title: string; doc: ArticleDoc }
export interface ParaSel { sectionId: string; index: number }

export function DocEditor({ draft, onChange, sel, onSelect, prefix, readOnly, kind }: { draft: Draft; onChange: (d: Draft) => void; sel: ParaSel | null; onSelect: (s: ParaSel | null) => void; prefix?: string; readOnly?: boolean; kind?: string }) {
  const MIN = minCharsFor(kind);
  const { doc } = draft;
  const counts = countDoc(doc);
  const setDoc = (d: Partial<ArticleDoc>) => onChange({ ...draft, doc: { ...doc, ...d } });
  const setSection = (id: string, f: (s: ArticleDoc['sections'][number]) => ArticleDoc['sections'][number]) => setDoc({ sections: doc.sections.map((s) => (s.id === id ? f(s) : s)) });
  const withPrefix = (t: string) => (prefix && !t.startsWith(prefix) ? `${prefix} ${t}` : t);
  const titleCount = countChars(draft.title);

  return (
    <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, opacity: readOnly ? 0.7 : 1 }}>
      <h3>제목 후보</h3>
      <div className="titles">
        {doc.titleCandidates.map((t, i) => (
          <label key={i}><input type="radio" checked={draft.title === withPrefix(t)} onChange={() => onChange({ ...draft, title: withPrefix(t) })} /><span>{withPrefix(t)}</span></label>
        ))}
      </div>
      <label className="field" style={{ marginTop: 8 }}>
        <span>제목 (직접 고치기)</span>
        <input type="text" value={draft.title} onChange={(e) => onChange({ ...draft, title: e.target.value })} />
        <small>{titleCount.withSpaces}자 · 제목은 본문 글자 수에 넣지 않아요</small>
      </label>

      <div className="row" style={{ margin: '10px 0' }}>
        <b className="counts">본문 공백 포함 {counts.withSpaces.toLocaleString()}자 · 공백 제외 {counts.withoutSpaces.toLocaleString()}자</b>
        {counts.withoutSpaces < MIN ? <span className="badge err">최소 {MIN.toLocaleString()}자 미만</span> : <span className="badge ok">최소 분량 충족</span>}
      </div>

      {doc.sections.map((s) => (
        <div className="sec" key={s.id}>
          <input type="text" className="h" value={s.heading ?? ''} placeholder="(소제목 없음 — 도입 문단)" onChange={(e) => setSection(s.id, (x) => ({ ...x, heading: e.target.value || undefined }))} />
          {s.paragraphs.map((p, i) => {
            const on = sel?.sectionId === s.id && sel.index === i;
            return (
              <div className={`para ${on ? 'sel' : ''}`} key={i}>
                <textarea value={p} rows={Math.max(3, Math.ceil(p.length / 60))} onFocus={() => onSelect({ sectionId: s.id, index: i })}
                  onChange={(e) => setSection(s.id, (x) => ({ ...x, paragraphs: x.paragraphs.map((y, j) => (j === i ? e.target.value : y)) }))} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <button className="btn small" title="문단 지우기" onClick={() => { if (confirm('이 문단을 지울까요?')) { setSection(s.id, (x) => ({ ...x, paragraphs: x.paragraphs.filter((_, j) => j !== i) })); onSelect(null); } }}>×</button>
                </div>
              </div>
            );
          })}
          <button className="btn link small" onClick={() => setSection(s.id, (x) => ({ ...x, paragraphs: [...x.paragraphs, ''] }))}>+ 문단 추가</button>
        </div>
      ))}

      <h3 style={{ marginTop: 14 }}>태그 후보</h3>
      <input type="text" value={doc.tags.join(', ')} onChange={(e) => setDoc({ tags: e.target.value.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean) })} />
      <p className="hint">쉼표로 구분. 태그 · 제목 · 사진 안내는 본문 복사에 섞이지 않아요.</p>

      {doc.photoSuggestions.length > 0 && (
        <>
          <h3 style={{ marginTop: 14 }}>사진 넣기 좋은 자리 (안내)</h3>
          <ul className="flags">{doc.photoSuggestions.map((p, i) => {
            const sec = doc.sections.find((s) => s.id === p.afterSectionId);
            return <li key={i}>"{sec?.heading ?? '도입'}" 뒤: {p.caption}</li>;
          })}</ul>
        </>
      )}
    </fieldset>
  );
}
