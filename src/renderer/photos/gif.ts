// 확인이 끝난 처리본(얼굴을 가린 사진)으로만 GIF를 만듦. 칸에 맞추고 빈 곳은 같은 사진을 흐리게 채움
import { GIF_MAX_BYTES, GIF_SIDES, gifSize, GifWriter } from '../../shared/gif';
import { decodePhoto } from './face';

const breathe = () => new Promise((r) => setTimeout(r, 0));

function frameOf(img: ImageBitmap, w: number, h: number) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const cover = Math.max(w / img.width, h / img.height), fit = Math.min(w / img.width, h / img.height);
  g.filter = 'blur(16px)';
  g.drawImage(img, (w - img.width * cover) / 2, (h - img.height * cover) / 2, img.width * cover, img.height * cover);
  g.filter = 'none';
  g.drawImage(img, (w - img.width * fit) / 2, (h - img.height * fit) / 2, img.width * fit, img.height * fit);
  return g.getImageData(0, 0, w, h).data;
}

export async function makeGif(photos: Uint8Array[], delayCs: number, onProgress: (done: number, total: number) => void) {
  const imgs: ImageBitmap[] = [];
  try {
    for (const b of photos) imgs.push(await decodePhoto(b));
    for (const side of GIF_SIDES) {
      const { w, h } = gifSize(imgs.map((i) => ({ w: i.width, h: i.height })), side);
      const gif = new GifWriter(w, h, delayCs);
      let fits = true;
      for (let i = 0; i < imgs.length && fits; i++) {
        onProgress(i, imgs.length);
        await breathe();
        gif.addFrame(frameOf(imgs[i], w, h));
        fits = gif.bytes < GIF_MAX_BYTES;
      }
      if (fits) return { bytes: gif.finish(), w, h };
    }
    throw new Error('GIF 용량이 너무 커요. 사진을 몇 장 빼고 다시 만들어 주세요.');
  } finally { imgs.forEach((i) => i.close()); }
}
