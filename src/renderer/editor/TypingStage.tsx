// 타이핑 연출 (기획서 8장): 저장된 완성 글을 다시 재생만 함 — API 호출 없음, 원본 문서를 바꾸지 않는 별도 층
// 한글은 완성형 글자 단위 (자모로 쪼개지 않음). 무작위 오타 · 사람 흉내 없음
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ArticleDoc } from '../../shared/types';

type Piece = { kind: 'title' | 'heading' | 'para'; chars: string[] };

const seg = new Intl.Segmenter('ko', { granularity: 'grapheme' });
const split = (s: string) => Array.from(seg.segment(s), (x) => x.segment);

export function TypingStage({ title, doc, speed: initial, onClose }: { title: string; doc: ArticleDoc; speed: number; onClose: () => void }) {
  // 문서 사본으로 재생 (원본 수정 없음)
  const pieces = useMemo<Piece[]>(() => [
    { kind: 'title', chars: split(title) },
    ...doc.sections.flatMap((s) => [...(s.heading ? [{ kind: 'heading' as const, chars: split(s.heading) }] : []), ...s.paragraphs.map((p) => ({ kind: 'para' as const, chars: split(p) }))]),
  ], [title, doc]);
  const total = pieces.reduce((n, p) => n + p.chars.length, 0);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(initial);
  const [shape, setShape] = useState<'wide' | 'tall'>('wide');
  const docRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!playing || pos >= total) return;
    const t = setTimeout(() => setPos((p) => Math.min(total, p + 1)), 1000 / Math.max(1, speed));
    return () => clearTimeout(t);
  }, [playing, pos, speed, total]);
  useEffect(() => { const d = docRef.current; if (d) d.scrollTop = d.scrollHeight; }, [pos]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === ' ') { e.preventDefault(); setPlaying((x) => !x); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  let left = pos;
  const shown = pieces.map((p, i) => {
    if (left <= 0) return null;
    const n = Math.min(left, p.chars.length);
    left -= p.chars.length;
    const text = p.chars.slice(0, n).join('');
    const caret = left <= 0 && pos < total ? <span className="caret" /> : null;
    if (p.kind === 'title') return <h1 key={i}>{text}{caret}</h1>;
    if (p.kind === 'heading') return <h3 key={i}>{text}{caret}</h3>;
    return <p key={i}>{text}{caret}</p>;
  });

  return (
    <div className="stage">
      <div className={`frame ${shape}`}>
        <div className="bar">블로그 글 작성 시연 · 저장된 글 다시 보기</div>
        <div className="doc" ref={docRef}>{shown}{pos === 0 && <span className="caret" />}</div>
      </div>
      <div className="ctrl">
        <button className="btn small" onClick={() => setPlaying(!playing)}>{playing ? '일시정지' : pos >= total ? '끝' : '재개'}</button>
        <button className="btn small" onClick={() => { setPos(total); setPlaying(false); }}>즉시 완성</button>
        <button className="btn small" onClick={() => { setPos(0); setPlaying(true); }}>처음부터</button>
        <label>속도 {speed}자/초 <input type="range" min={5} max={60} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} /></label>
        <button className="btn small" onClick={() => setShape(shape === 'wide' ? 'tall' : 'wide')}>{shape === 'wide' ? '세로 화면' : '가로 화면'}</button>
        <span>{Math.round((pos / Math.max(1, total)) * 100)}%</span>
        <button className="btn small" onClick={onClose}>닫기 (Esc)</button>
      </div>
    </div>
  );
}
