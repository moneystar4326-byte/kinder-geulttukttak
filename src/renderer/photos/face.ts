// 얼굴 위치 찾기 · 가림 (PC 안에서만, 사진을 밖으로 보내지 않음)
// 위치만 찾음: 얼굴 인식 · 등록 모델은 넣지 않음. 큰 라이브러리라 처음 쓸 때 불러옴
import { call } from '../api';
import { ANIMAL_COVER_SCALE, animalIndex, blockSize, expandBox, isFace, MIN_FACE_SCORE, mergeBoxes, OUTPUT_LONG_SIDE, TURNED_MIN, tilesFor, unrotateBox, type FaceCandidate, type PhotoCover } from '../../shared/photos';
import { loadAnimals } from './animals';
import type { PhotoRegion } from '../../shared/types';

const MIN_CONFIDENCE = MIN_FACE_SCORE;
const WHOLE_SIDE = 1600;
const CHECK_ZOOM = 3; // 2차 확인: 후보 크기의 3배를 잘라서
const CHECK_SIDE = 512; // 이 크기로 키워 다시 찾음
const TILE_TURNS = [0, 2] as const; // 조각 검사 방향: 정방향 · 거꾸로 (옆으로 누운 작은 얼굴은 전체 검사로)

let ready: Promise<typeof import('@vladmandic/face-api/dist/face-api.esm.js')> | null = null;
function loadEngine() {
  ready ??= (async () => {
    const faceapi = await import('@vladmandic/face-api/dist/face-api.esm.js');
    const tf = faceapi.tf as any;
    try { await tf.setBackend('webgl'); } catch { await tf.setBackend('cpu'); }
    await tf.ready();
    const { manifest, bin } = await call<{ manifest: { weights: any[] }[]; bin: Uint8Array }>('photos:faceModel');
    const weights = tf.io.decodeWeights(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), manifest.flatMap((g) => g.weights));
    await faceapi.nets.ssdMobilenetv1.loadFromWeightMap(weights);
    return faceapi;
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

// 사진의 올바른 회전 방향을 적용해서 읽음 (createImageBitmap 기본값). 복사 중 · 깨진 파일은 여기서 실패
export const decodePhoto = (bytes: Uint8Array) => createImageBitmap(new Blob([bytes as BlobPart]), { imageOrientation: 'from-image' });

const canvasOf = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const breathe = () => new Promise((r) => setTimeout(r, 0)); // 화면이 멈춰 보이지 않게 칸마다 쉼

// 시계 방향으로 quarter번 돌린 캔버스
function rotated(src: HTMLCanvasElement, quarter: 0 | 1 | 2 | 3) {
  if (quarter === 0) return src;
  const c = quarter === 2 ? canvasOf(src.width, src.height) : canvasOf(src.height, src.width);
  const g = c.getContext('2d')!;
  g.translate(c.width / 2, c.height / 2);
  g.rotate((quarter * Math.PI) / 2);
  g.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

// 얼굴 후보 찾기. 사진 전체는 네 방향으로 돌려 봄 (2026-11-03 사용자: 물구나무 사진에서 진짜 얼굴을 못 찾음)
// 조각 검사와 돌려서 찾은 낮은 점수 후보는 매트 · 벽 무늬도 얼굴로 봐서, 후보 둘레를 크게 잘라 한 번 더 확인 (check = 그 점수)
export async function detectCandidates(img: ImageBitmap, quick = false): Promise<FaceCandidate[]> {
  const faceapi = await loadEngine();
  const options = new faceapi.SsdMobilenetv1Options({ minConfidence: MIN_CONFIDENCE, maxResults: 200 });
  const W = img.width, H = img.height;
  const found: FaceCandidate[] = [];
  const s = Math.min(1, WHOLE_SIDE / Math.max(W, H));
  const base = canvasOf(Math.round(W * s), Math.round(H * s));
  base.getContext('2d')!.drawImage(img, 0, 0, base.width, base.height);
  // 돌린 캔버스에서 찾은 위치를 돌리기 전 캔버스 비율로
  const boxesIn = async (c: HTMLCanvasElement, q: 0 | 1 | 2 | 3) => {
    const r = rotated(c, q);
    return (await faceapi.detectAllFaces(r, options)).map((d) => ({ ...unrotateBox({ x: d.box.x / r.width, y: d.box.y / r.height, w: d.box.width / r.width, h: d.box.height / r.height }, q), score: d.score }));
  };
  for (const q of [0, 2, 1, 3] as const) {
    for (const b of await boxesIn(base, q)) found.push({ ...b, from: 'whole', quarter: q });
    await breathe();
  }
  if (quick) return found;
  for (const q of TILE_TURNS) {
    for (const t of tilesFor(W, H)) {
      const c = canvasOf(t.w, t.h);
      c.getContext('2d')!.drawImage(img, t.x, t.y, t.w, t.h);
      for (const b of await boxesIn(c, q)) found.push({ x: (t.x + b.x * t.w) / W, y: (t.y + b.y * t.h) / H, w: (b.w * t.w) / W, h: (b.h * t.h) / H, score: b.score, from: 'tile', quarter: q });
      await breathe();
    }
  }
  for (const f of found) {
    if (f.from !== 'tile' && (f.quarter === 0 || f.score >= TURNED_MIN)) continue;
    const side = Math.min(W, H, Math.max(f.w * W, f.h * H) * CHECK_ZOOM);
    const sx = Math.max(0, Math.min(W - side, (f.x + f.w / 2) * W - side / 2)), sy = Math.max(0, Math.min(H - side, (f.y + f.h / 2) * H - side / 2));
    const c = canvasOf(CHECK_SIDE, CHECK_SIDE);
    c.getContext('2d')!.drawImage(img, sx, sy, side, side, 0, 0, CHECK_SIDE, CHECK_SIDE);
    const cx = ((f.x + f.w / 2) * W - sx) / side, cy = ((f.y + f.h / 2) * H - sy) / side;
    f.check = Math.max(0, ...(await boxesIn(c, f.quarter)).filter((b) => b.x <= cx && cx <= b.x + b.w && b.y <= cy && cy <= b.y + b.h).map((b) => b.score));
    await breathe();
  }
  return found;
}

// quick: 카드 사진 맞추기용. 큰 얼굴만 보면 되므로 조각 검사를 건너뜀 (가림 작업은 작은 얼굴도 찾아야 해서 그대로)
export async function detectFaces(img: ImageBitmap, quick = false): Promise<(PhotoRegion & { score: number })[]> {
  return mergeBoxes((await detectCandidates(img, quick)).filter(isFace)).map((b) => ({ ...expandBox(b), source: 'auto' as const, score: b.score }));
}

// 가림을 픽셀에 반영하고 JPEG 로 다시 저장 (캔버스로 그려서 촬영 정보 · GPS 는 따라오지 않음)
export async function renderProcessed(img: ImageBitmap, regions: PhotoRegion[], cover: PhotoCover = 'mosaic', photoIdx = 0): Promise<Uint8Array> {
  const c = maskedCanvas(img, regions, cover === 'animal' ? { animals: await loadAnimals(), photoIdx } : undefined);
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.9));
  if (!blob) throw new Error('처리한 사진을 만들지 못했어요');
  return new Uint8Array(await blob.arrayBuffer());
}

// 모자이크를 칠한 캔버스 (미리보기와 저장이 같은 그림을 씀)
export function maskedCanvas(img: ImageBitmap, regions: PhotoRegion[], on?: { animals: HTMLImageElement[]; photoIdx: number }) {
  const s = Math.min(1, OUTPUT_LONG_SIDE / Math.max(img.width, img.height));
  const c = canvasOf(Math.round(img.width * s), Math.round(img.height * s));
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0, c.width, c.height);
  for (let i = 0; i < regions.length; i++) {
    const r = regions[i];
    const x = Math.floor(r.x * c.width), y = Math.floor(r.y * c.height);
    const w = Math.min(c.width - x, Math.ceil(r.w * c.width)), h = Math.min(c.height - y, Math.ceil(r.h * c.height));
    if (w < 1 || h < 1) continue;
    const block = blockSize(w);
    const small = canvasOf(Math.max(1, Math.round(w / block)), Math.max(1, Math.round(h / block)));
    const sg = small.getContext('2d')!;
    sg.imageSmoothingEnabled = true;
    sg.drawImage(c, x, y, w, h, 0, 0, small.width, small.height);
    const side = Math.max(w, h) * ANIMAL_COVER_SCALE;
    const cx = x + w / 2, cy = y + h / 2;
    g.save();
    // 자동으로 찾은 칸은 얼굴보다 넓어서, 동물 뒤 동그라미에만 칠함 (네모가 드러나지 않게). 직접 그은 칸은 전부 가림
    if (on && r.source !== 'manual') { g.beginPath(); g.arc(cx, cy, (side / 2) * 0.95, 0, Math.PI * 2); g.clip(); }
    g.imageSmoothingEnabled = false;
    g.drawImage(small, 0, 0, small.width, small.height, x, y, w, h);
    g.restore();
    if (on) {
      g.imageSmoothingEnabled = true;
      g.drawImage(on.animals[animalIndex(i, on.photoIdx, on.animals.length)], cx - side / 2, cy - side / 2, side, side);
    }
  }
  return c;
}

export async function thumbnail(bytes: Uint8Array, width = 120) {
  const img = await decodePhoto(bytes);
  const c = canvasOf(width, Math.max(1, Math.round((img.height / img.width) * width)));
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  img.close();
  return c.toDataURL('image/jpeg', 0.7);
}
