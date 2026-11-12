// 붙여넣기 도우미 (태권 글뚝딱 2.8.0에서 옮김): 앱은 클립보드에 담기만, 네이버에 붙이는 건 원장님 · 선생님이 직접 (Ctrl+V)
// 단계 순서는 '네이버에 초안 입력'과 같은 buildBlocks 순서
// 유치원판에는 아직 영상 · 사진 글이 없어서 영상 단계는 뺐어요. 생기면 PasteStep 에 { kind: 'video' } 를 더하고 pasteSteps · 점검표 · 화면에 같이 넣으면 돼요
import { APP } from './kinder';

// 준비한 뒤 글 · 카드 · 설정이 바뀌어 단계가 달라졌을 때 (화면은 이 문구로 알아보고 단계를 다시 만듦)
export const PASTE_STALE = '글이나 설정이 바뀌어 단계가 달라졌어요. 단계를 다시 만들었으니 지금 단계를 확인하고 다시 눌러 주세요.';
export type PasteItem = { label: string; image: boolean }; // image=false: 그림 복사로 망가지는 파일 → 파일 위치만 열어 줌
export type PasteStep =
  | { kind: 'title'; label: string; text: string }
  | { kind: 'style'; label: string; picks: string[] } // 복사 없음: 붙이기 전에 본문 서식을 직접 고르는 안내 (먼저 고르면 붙인 글이 그 서식을 따름)
  | { kind: 'text'; label: string; text: string; html: string; heads: string[] } // html: 소제목을 꾸민 같은 글 · heads: 이 단계의 소제목 (두 줄로 나뉜 소제목은 한 칸으로 이어 붙임, 끝 점검표용)
  | { kind: 'media'; label: string; items: PasteItem[]; missing: string[] }
  | { kind: 'place'; label: string; name: string; address: string };

// 진행 위치: 번호와 함께 '어떤 단계였는지'(종류 · 이름)도 기억 → 단계가 늘거나 줄어도 같은 단계를 다시 찾음
export type PastePos = { step: number; item: number; kind?: string; label?: string };
const DONE = 'done';
export function tagPos(plan: { steps: PasteStep[] }, p: PastePos): PastePos {
  const s = plan.steps[p.step];
  return { step: p.step, item: p.item, kind: s ? s.kind : DONE, label: s?.label };
}
// 새 목록에서 하던 단계 찾기: 같은 종류 · 이름 중 원래 번호에 가장 가까운 것. 못 찾으면 번호를 목록 안으로
export function remap(plan: { steps: PasteStep[] }, cur: PastePos): PastePos {
  const n = plan.steps.length;
  if (cur.kind === DONE) return { step: n, item: 0 };
  let best = -1;
  if (cur.kind) plan.steps.forEach((s, i) => { if (s.kind === cur.kind && s.label === cur.label && (best < 0 || Math.abs(i - cur.step) < Math.abs(best - cur.step))) best = i; });
  const step = best >= 0 ? best : Math.min(Math.max(cur.step, 0), n);
  const s = plan.steps[step];
  return { step, item: best >= 0 && s?.kind === 'media' ? Math.min(cur.item, Math.max(s.items.length - 1, 0)) : 0 };
}

// 끝 점검표: 네이버 창을 보면서 하나씩 체크 (프로그램은 네이버 창을 볼 수 없어서 사람이 확인)
export type PasteCheck = { key: string; label: string };
export function checklist(steps: PasteStep[]): PasteCheck[] {
  const out: PasteCheck[] = [{ key: 'title', label: '제목이 들어갔어요' }];
  const texts = steps.filter((s) => s.kind === 'text').length;
  if (texts) out.push({ key: 'text', label: `글 ${texts}덩어리가 순서대로 다 들어갔어요 (빠지거나 두 번 들어간 곳 없음)` });
  const heads = steps.flatMap((s) => (s.kind === 'text' ? s.heads : []));
  if (heads.length) out.push({ key: 'heads', label: `소제목 ${heads.length}개가 굵고 크게 보여요: ${heads.join(' / ')}` });
  const imgs = steps.flatMap((s) => (s.kind === 'media' ? s.items.map((i) => i.label) : []));
  if (imgs.length) out.push({ key: 'imgs', label: `그림 ${imgs.length}장이 제자리에 있어요: ${imgs.join(' / ')}` });
  if (steps.some((s) => s.kind === 'place')) out.push({ key: 'place', label: `${APP.place} 지도가 우리 ${APP.place}예요` });
  return out;
}
