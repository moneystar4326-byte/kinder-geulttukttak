// 사진 위 가림 네모: 드래그로 추가, 눌러서 지움 (사진 글 확인 칸 · 카드 사진 함께 씀). 사진은 data-bg 를 붙여 children 으로
import { useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import type { PhotoRegion } from '../../shared/types';

export function RegionBox({ regions, disabled, onChange, children }: { regions: PhotoRegion[]; disabled: boolean; onChange: (regions: PhotoRegion[]) => void; children: ReactNode }) {
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const point = (e: RPointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const onDown = (e: RPointerEvent) => { if (disabled || e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.bg) return; const p = point(e); box.current!.setPointerCapture(e.pointerId); setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }); };
  const onMove = (e: RPointerEvent) => { if (drag) { const p = point(e); setDrag({ ...drag, x1: p.x, y1: p.y }); } };
  const onUp = () => {
    if (!drag) return;
    const r = { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) };
    setDrag(null);
    if (r.w > 0.01 && r.h > 0.01) onChange([...regions, { ...r, source: 'manual' }]);
  };
  return (
    <div ref={box} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} style={{ position: 'relative', lineHeight: 0, cursor: 'crosshair', userSelect: 'none', touchAction: 'none', width: 'fit-content', maxWidth: '100%', margin: '0 auto' }}>
      {children}
      {regions.map((r, i) => (
        <button key={i} title="잘못 가렸으면 눌러서 지우기" aria-label={`가림 ${i + 1} 지우기`} disabled={disabled} onClick={() => onChange(regions.filter((_, j) => j !== i))}
          style={{ position: 'absolute', left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%`, background: 'transparent', border: `2px solid ${r.source === 'manual' ? 'var(--accent)' : 'var(--main)'}`, borderRadius: 3, cursor: 'pointer', padding: 0 }} />
      ))}
      {drag && <div style={{ position: 'absolute', left: `${Math.min(drag.x0, drag.x1) * 100}%`, top: `${Math.min(drag.y0, drag.y1) * 100}%`, width: `${Math.abs(drag.x1 - drag.x0) * 100}%`, height: `${Math.abs(drag.y1 - drag.y0) * 100}%`, border: '2px dashed var(--accent)', pointerEvents: 'none' }} />}
    </div>
  );
}
