// 휴대폰 폭 미리보기: 네이버에 넣을 때와 같은 줄 나누기 규칙으로 보여 줘요 (글꼴은 비슷하게, 실제 확인은 네이버 미리보기로)
// 태권 글뚝딱 2.7.1에서 옮김
import { useState } from 'react';
import { headingLines, mobileParagraphs } from '../../shared/format';
import type { ArticleDoc } from '../../shared/types';

const WIDTHS = [{ w: 320, label: '작은 폰' }, { w: 360, label: '보통 폰' }, { w: 390, label: '큰 폰' }];

export function MobilePreview({ title, doc }: { title: string; doc: ArticleDoc }) {
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(360);
  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>휴대폰에서 보기</h2>
        <button className="btn small" onClick={() => setOpen(!open)}>{open ? '닫기' : '미리 보기'}</button>
      </div>
      {open && (
        <>
          <p className="hint" style={{ margin: '6px 0 10px' }}>네이버에 넣을 때와 같은 규칙으로 줄을 나눠 보여 줘요. 글꼴은 조금 다를 수 있어서, 마지막에는 네이버 미리보기로 확인해 주세요.</p>
          <div className="row" style={{ marginBottom: 10 }}>
            {WIDTHS.map((x) => <button key={x.w} className={`btn small ${width === x.w ? 'primary' : ''}`} onClick={() => setWidth(x.w)}>{x.label} {x.w}</button>)}
          </div>
          <div style={{ width, maxWidth: '100%', margin: '0 auto', padding: '24px 20px', background: '#fff', color: '#1d1d1b', border: '8px solid #17233f', borderRadius: 22, textAlign: 'center', fontSize: 16, lineHeight: 1.8 }}>
            <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.4, marginBottom: 20 }}>{title}</div>
            {doc.sections.map((s) => (
              <div key={s.id}>
                {s.heading && <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.4, margin: '28px 0 14px' }}>{headingLines(s.heading).map((l, i) => <div key={i}>{l}</div>)}</div>}
                {s.paragraphs.flatMap(mobileParagraphs).map((chunk, i) => <p key={i} style={{ margin: '0 0 18px' }}>{chunk.split('\n').map((l, j) => <span key={j} style={{ display: 'block' }}>{l}</span>)}</p>)}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
