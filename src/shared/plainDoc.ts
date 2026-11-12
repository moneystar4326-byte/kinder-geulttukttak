// AI가 줄글로 쓴 글을 섹션으로 나누기 (2026-11-05). 문장은 고치지 않음
import type { ArticleDoc } from './types';

export function parsePlainDoc(text: string): ArticleDoc['sections'] {
  const sections: ArticleDoc['sections'] = [];
  let heading = '';
  let paragraphs: string[] = [];
  const flush = () => {
    if (!heading && !paragraphs.length) return;
    sections.push({ id: `s${sections.length + 1}`, heading, paragraphs });
    heading = '';
    paragraphs = [];
  };
  for (const raw of text.replace(/\r/g, '').split(/\n+/)) {
    const line = raw.trim().replace(/\*\*/g, '');
    if (!line) continue;
    const h = line.match(/^#{1,4}\s*(.+)$/);
    if (h) { flush(); heading = h[1].trim(); continue; }
    paragraphs.push(line);
  }
  flush();
  return sections.filter((s) => s.paragraphs.length);
}
