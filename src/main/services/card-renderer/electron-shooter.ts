// Electron 화면 밖 창으로 카드 HTML → PNG (외부 브라우저 없이)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BrowserWindow } from 'electron';
import { MEASURE_JS, type Measure } from './template';
import type { Shooter } from './index';

export function electronShooter(): Shooter {
  let chain: Promise<unknown> = Promise.resolve(); // 한 번에 한 장 (메모리 아끼기)
  return {
    shoot(html, w, h, outFile) {
      const run = async (): Promise<Measure> => {
        const tmp = path.join(os.tmpdir(), `geulttukttak-card-${process.pid}-${Date.now()}.html`);
        fs.writeFileSync(tmp, html, 'utf-8');
        const win = new BrowserWindow({
          show: false, width: w, height: h, useContentSize: true, frame: false,
          webPreferences: { offscreen: true, nodeIntegration: false, contextIsolation: true, sandbox: true, javascript: true, zoomFactor: 1 },
        });
        try {
          win.setContentSize(w, h);
          await win.loadFile(tmp);
          const m = (await win.webContents.executeJavaScript(MEASURE_JS)) as Measure;
          await new Promise((r) => setTimeout(r, 120)); // 마지막 그리기
          let img = await win.webContents.capturePage({ x: 0, y: 0, width: w, height: h });
          if (img.isEmpty()) throw new Error('카드 화면을 찍지 못했어요. 이 카드만 다시 만들어 주세요.'); // 빈 그림을 완성으로 저장하지 않게
          const s = img.getSize();
          if (s.width !== w || s.height !== h) img = img.resize({ width: w, height: h, quality: 'best' });
          fs.writeFileSync(outFile, img.toPNG());
          return m;
        } finally {
          win.destroy();
          fs.rmSync(tmp, { force: true });
        }
      };
      // 한 장이 30초를 넘으면 실패로 (멈춘 창 때문에 다음 카드가 영영 안 만들어지는 것 방지)
      const limited = () => Promise.race([run(), new Promise<never>((_, fail) => setTimeout(() => fail(new Error('카드 만들기가 너무 오래 걸려요. 다시 시도해 주세요.')), 30_000))]);
      const p = chain.then(limited, limited);
      chain = p.catch(() => {});
      return p;
    },
  };
}
