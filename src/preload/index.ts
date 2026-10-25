// 화면에 열어 주는 최소 통로 (정해 둔 채널만)
import { contextBridge, ipcRenderer } from 'electron';

const CHANNELS = [
  'app:info', 'app:latest', 'license:status', 'license:connect', 'license:refresh', 'license:unlink', 'settings:save', 'settings:pickDir',
  'secrets:set', 'secrets:remove', 'secrets:test', 'secrets:fromClipboard', 'guide:copy',
  'profile:get', 'profile:save', 'profile:pickLogo', 'profile:pickRef', 'profile:nearby', 'profile:prefixOptions',
  'keywords:naver', 'keywords:ai', 'facts:fromMemo',
  'article:list', 'article:create', 'article:updateInput', 'article:get', 'article:delete', 'article:generate', 'article:revise',
  'article:saveEdit', 'article:setCurrent', 'article:getVersion', 'article:markReady', 'article:copy', 'article:applyPrefix',
  'cards:plan', 'cards:renderFailed', 'cards:renderOne', 'cards:updateCopy', 'cards:suggestCopy', 'cards:restyle', 'cards:saveAs',
  'export:run', 'backup:create', 'backup:restore',
  'naver:status', 'naver:openLogin', 'naver:close', 'naver:clearSession', 'naver:fill',
  'job:cancel', 'job:get', 'usage:summary', 'shell:open', 'shell:showFile',
] as const;

contextBridge.exposeInMainWorld('gtd', {
  call: (channel: string, arg?: unknown) => {
    if (!(CHANNELS as readonly string[]).includes(channel)) return Promise.resolve({ ok: false, error: '허용되지 않은 요청' });
    return ipcRenderer.invoke(channel, arg);
  },
  onJob: (fn: (job: unknown) => void) => {
    const h = (_e: unknown, job: unknown) => fn(job);
    ipcRenderer.on('job:update', h);
    return () => ipcRenderer.removeListener('job:update', h);
  },
});
