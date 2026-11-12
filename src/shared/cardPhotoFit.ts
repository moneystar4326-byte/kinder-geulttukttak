// 카드 그림 칸에 사진 자동으로 맞추기 (태권 글뚝딱 2.6.x에서 옮김)
// 칸을 꽉 채우되 얼굴이 잘리지 않는 자리로. 얼굴이 다 안 들어가거나 너무 많이 잘리면 사진 전체를 보여 줌
export interface PhotoFit { w: number; h: number; faces: { x: number; y: number; w: number; h: number; score?: number }[]; masked?: boolean } // 얼굴 위치는 사진 크기에 대한 비율 (0~1), masked = 얼굴을 가린 사진
export type FitResult = { whole: true } | { whole: false; x: number; y: number }; // x · y = object-position 퍼센트

const MIN_VISIBLE = 0.6; // 얼굴 정보가 없을 때 이만큼은 보여야 꽉 채움
const MIN_SCORE = 0.5; // 얼굴 찾기는 놓치지 않으려고 후하게 찾음 → 맞춤에는 확실한 것만
const MIN_FACE_RATIO = 0.4; // 가장 큰 얼굴보다 많이 작은 얼굴(뒤쪽 사람)은 기준에서 뺌
const FACE_AT = 0.4; // 얼굴을 칸 위에서 40% 자리에 (몸이 함께 보이게)

export function fitPhoto(fit: PhotoFit, slotW: number, slotH: number, defaultY: number): FitResult {
  const pr = fit.w / fit.h, sr = slotW / slotH;
  const centered: FitResult = { whole: false, x: 50, y: defaultY };
  const wide = pr > sr; // 넓은 사진은 좌우가, 긴 사진은 위아래가 잘림
  const visible = wide ? sr / pr : pr / sr;
  if (!(visible > 0) || visible >= 0.999) return centered;
  const sure = fit.faces.filter((f) => (f.score ?? 1) >= MIN_SCORE);
  const big = Math.max(0, ...sure.map((f) => f.h));
  const main = sure.filter((f) => f.h >= big * MIN_FACE_RATIO);
  if (!main.length) return visible >= MIN_VISIBLE ? centered : { whole: true };
  const lo = Math.min(...main.map((f) => (wide ? f.x : f.y)));
  const hi = Math.max(...main.map((f) => (wide ? f.x + f.w : f.y + f.h)));
  if (hi - lo > visible) return { whole: true };
  let start = (lo + hi) / 2 - visible * (wide ? 0.5 : FACE_AT);
  start = Math.min(start, lo);
  start = Math.max(start, hi - visible);
  start = Math.min(Math.max(start, 0), 1 - visible);
  const pos = Math.round((start / (1 - visible)) * 1000) / 10;
  return wide ? { whole: false, x: pos, y: 50 } : { whole: false, x: 50, y: pos };
}
