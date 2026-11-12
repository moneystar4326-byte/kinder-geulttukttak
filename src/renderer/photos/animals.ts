// 얼굴을 가리는 동물 그림 (Noto Emoji 2D, Apache-2.0). 앱 안에 넣어 PC · 맥 어디서나 같은 모양
// 파일 주소 그림은 캔버스를 잠가 저장할 수 없어서 data: 로 넣음
import bear from './animals/1f43b.png?inline';
import cat from './animals/1f431.png?inline';
import dog from './animals/1f436.png?inline';
import fox from './animals/1f98a.png?inline';
import frog from './animals/1f438.png?inline';
import koala from './animals/1f428.png?inline';
import lion from './animals/1f981.png?inline';
import monkey from './animals/1f435.png?inline';
import panda from './animals/1f43c.png?inline';
import pig from './animals/1f437.png?inline';
import tiger from './animals/1f42f.png?inline';

const URLS = [dog, cat, bear, panda, tiger, fox, koala, frog, monkey, lion, pig];
let loaded: Promise<HTMLImageElement[]> | null = null;

export function loadAnimals() {
  loaded ??= Promise.all(URLS.map(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    return img;
  })).catch((e) => { loaded = null; throw e; });
  return loaded;
}
