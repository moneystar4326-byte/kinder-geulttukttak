// 사진 폴더 읽기 (기획 v0.2): 지정 폴더 바로 아래만. 원본은 읽기만 하고 폴더에 아무것도 만들지 않음
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { exifDate, HEIC_EXT, isJpeg, PHOTO_EXT, sceneFromName } from '../../../shared/photos';
import type { PhotoItem, ScannedPhoto } from '../../../shared/types';

export const hashOf = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const COPYING_MS = 2000; // 방금 바뀐 파일은 복사 중으로 보고 다음 읽기 때 다시 확인
const isPng = (b: Uint8Array) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
const stamp = (d: Date) => { const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };

export async function scanFolder(dir: string, used: Set<string>, now = Date.now()): Promise<ScannedPhoto[]> {
  const out: ScannedPhoto[] = [];
  for (const e of await fs.promises.readdir(dir, { withFileTypes: true })) {
    if (!e.isFile()) continue;
    const file = path.join(dir, e.name);
    const { title, needsTitle, order } = sceneFromName(e.name);
    const base = { path: file, name: e.name, title, needsTitle, order, used: false };
    if (HEIC_EXT.test(e.name)) { out.push({ ...base, hash: '', takenAt: '', problem: 'heic' }); continue; }
    if (!PHOTO_EXT.test(e.name)) continue;
    try {
      const st = await fs.promises.stat(file);
      if (now - st.mtimeMs < COPYING_MS) { out.push({ ...base, hash: '', takenAt: stamp(st.mtime), problem: 'copying' }); continue; }
      const b = await fs.promises.readFile(file);
      if (!isJpeg(b) && !isPng(b)) { out.push({ ...base, hash: '', takenAt: stamp(st.mtime), problem: 'unreadable' }); continue; }
      const hash = hashOf(b);
      out.push({ ...base, hash, takenAt: exifDate(b) ?? stamp(st.mtime), used: used.has(hash) });
    } catch { out.push({ ...base, hash: '', takenAt: '', problem: 'unreadable' }); }
  }
  // 번호순 → 번호 없으면 촬영 시간순 → 이름순
  return out.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.takenAt.localeCompare(b.takenAt) || a.name.localeCompare(b.name, 'ko'));
}

// 네이버 넣기를 막는 이유 (처리본 파일까지 확인). processedFile 은 절대 경로
export function photoFileProblems(items: Pick<PhotoItem, 'title' | 'status' | 'confirmed' | 'excluded' | 'processedFile' | 'processedHash'>[]): string[] {
  const out: string[] = [];
  const live = items.filter((x) => !x.excluded);
  if (!live.length) out.push('넣을 사진이 없어요. 빼 둔 사진을 다시 넣어 주세요.');
  for (const x of live) {
    if (x.status === 'failed') { out.push(`"${x.title}" 사진 처리에 실패했어요. 다시 처리하거나 빼 주세요.`); continue; }
    if (x.status !== 'ready' || !x.processedFile) { out.push(`"${x.title}" 사진을 아직 처리 중이에요.`); continue; }
    if (!x.confirmed) { out.push(`"${x.title}" 사진의 얼굴 가림을 확인해 주세요.`); continue; }
    let same = false;
    try { same = hashOf(fs.readFileSync(x.processedFile)) === x.processedHash; } catch { /* 없음 */ }
    if (!same) out.push(`"${x.title}" 처리본이 없어졌거나 바뀌었어요. 다시 처리하고 확인해 주세요.`);
  }
  return out;
}
