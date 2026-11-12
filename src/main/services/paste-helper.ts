// 붙여넣기 도우미 (태권 글뚝딱 2.8.0에서 옮김): '네이버에 초안 입력'과 같은 블록 순서를 붙여넣기 단계로 나눔
// 네이버 화면은 건드리지 않음. 파일 경로는 메인에만 두고 화면에는 이름만 보냄
import type { PasteStep } from '../../shared/paste';
import { APP } from '../../shared/kinder';
import { BODY_STYLE, GIF_CARD, HEADING_SIZE, type DraftBlock } from './browser-draft/editor';

const STILL = /\.(png|jpe?g|webp|bmp)$/i;
const markLabel = (b: DraftBlock) => (b.cardIndex === GIF_CARD ? '움직이는 사진' : b.text.replace(/^\[|\]$/g, '').trim());
const shortLabel = (b: DraftBlock) => (b.kind === 'heading' ? b.text.split('\n')[0] : b.text.length > 20 ? `${b.text.slice(0, 20)}…` : b.text);

// 소제목을 꾸며서 붙이기: 글자 · 줄 나눔은 글자만 복사(text)와 똑같고, 소제목 줄만 굵게 · 크기 24 (자동 입력 styleHeadings 와 같은 값)
// 문단에는 본문 서식(16 · 가운데 · 줄간격 180%)도 같이 적음. 네이버가 서식을 안 받아도 글자는 그대로 들어감
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const P = 'text-align:center;line-height:1.8';
const htmlLine = (l: string, head: boolean) =>
  !l.trim() ? `<p style="${P}"><br></p>` : head ? `<p style="${P}"><b><span style="font-size:${HEADING_SIZE}px">${esc(l)}</span></b></p>` : `<p style="${P}"><span style="font-size:16px">${esc(l)}</span></p>`;
export function blocksToHtml(blocks: DraftBlock[]) {
  return blocks.map((b) => b.text.split('\n').map((l) => htmlLine(l, b.kind === 'heading')).join('')).join(htmlLine('', false));
}

export function pasteSteps(o: { title: string; blocks: DraftBlock[]; files: { index: number; file: string }[]; place?: { name: string; address?: string } }) {
  // 서식은 자동 입력과 같은 값 (BODY_STYLE). 제목 다음 · 본문을 붙이기 전에
  const steps: PasteStep[] = [{ kind: 'title', label: '제목', text: o.title }, { kind: 'style', label: '본문 서식 정하기', picks: BODY_STYLE.map(([, v]) => v) }];
  const files: string[][] = [[], []];
  let text: DraftBlock[] = [];
  const flush = () => {
    if (!text.length) return;
    steps.push({ kind: 'text', label: shortLabel(text.find((b) => b.kind === 'heading') ?? text[0]), text: text.map((b) => b.text).join('\n\n'), html: blocksToHtml(text), heads: text.filter((b) => b.kind === 'heading').map((b) => b.text.split('\n').map((l) => l.trim()).filter(Boolean).join(' ')).filter(Boolean) }); // 소제목 하나 = 한 항목 (휴대폰용으로 두 줄로 나뉜 것도 한 개로)
    files.push([]);
    text = [];
  };
  for (const b of o.blocks) {
    if (b.kind !== 'card') { text.push(b); continue; }
    flush();
    const f = o.files.find((x) => x.index === b.cardIndex)?.file;
    let last = steps.at(-1);
    if (last?.kind !== 'media') { last = { kind: 'media', label: '', items: [], missing: [] }; steps.push(last); files.push([]); }
    if (f) { last.items.push({ label: markLabel(b), image: STILL.test(f) }); files.at(-1)!.push(f); } else last.missing.push(markLabel(b));
    last.label = last.items.length + last.missing.length > 1 ? `그림 ${last.items.length + last.missing.length}장` : markLabel(b);
  }
  flush();
  if (o.place) { steps.push({ kind: 'place', label: `${APP.place} 지도`, name: o.place.name, address: o.place.address ?? '' }); files.push([]); }
  return { steps, files };
}
