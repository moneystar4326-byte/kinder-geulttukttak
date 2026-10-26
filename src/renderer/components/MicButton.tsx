// 메모 말로 넣기: 누르면 녹음 → 한 번 더 누르면(또는 1분이 되면) 멈추고 관장님 OpenAI 키로 받아쓰기 → onText
// 녹음은 메모리에만 있고 저장하지 않음. 마이크 권한은 main(index.ts)이 우리 화면의 소리만 허용
import { useEffect, useRef, useState } from 'react';
import { call } from '../api';
import { IND } from '../../shared/industry';

const MAX_SEC = 60;
const pickMime = () => ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) ?? '';

export function MicButton({ onText, disabled }: { onText: (text: string) => void; disabled?: boolean }) {
  const [state, setState] = useState<'idle' | 'rec' | 'busy'>('idle');
  const [sec, setSec] = useState(0);
  const [err, setErr] = useState('');
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | null>(null);

  const stopTracks = () => rec.current?.stream.getTracks().forEach((t) => t.stop());
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); stopTracks(); }, []);

  async function start() {
    setErr('');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setErr('마이크를 쓸 수 없어요. 마이크가 연결돼 있는지, Windows [설정 → 개인 정보 → 마이크]에서 "데스크톱 앱이 마이크에 액세스하도록 허용"이 켜져 있는지 확인해 주세요. (맥은 시스템 설정 → 개인정보 보호 및 보안 → 마이크)');
      return;
    }
    const mime = pickMime();
    const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    r.onstop = async () => {
      if (timer.current) clearInterval(timer.current);
      stopTracks();
      setState('busy');
      try {
        const blob = new Blob(chunks, { type: r.mimeType || mime || 'audio/webm' });
        const text = await call<string>('voice:transcribe', { audio: new Uint8Array(await blob.arrayBuffer()), mime: blob.type });
        onText(text);
      } catch (e) { setErr((e as Error).message); } finally { setState('idle'); }
    };
    rec.current = r;
    r.start();
    setSec(0); setState('rec');
    timer.current = window.setInterval(() => setSec((s) => { if (s + 1 >= MAX_SEC) r.stop(); return s + 1; }), 1000);
  }

  const stop = () => { if (rec.current?.state === 'recording') rec.current.stop(); };

  return (
    <span className="mic">
      <button type="button" className={`btn small ${state === 'rec' ? 'danger' : ''}`} disabled={disabled || state === 'busy'} onClick={state === 'rec' ? stop : start}
        aria-label={state === 'rec' ? '녹음 멈추고 글자로 바꾸기' : '말로 메모 넣기'}>
        {state === 'rec' ? `■ 다 말했어요 (${sec}초)` : state === 'busy' ? '글자로 바꾸는 중…' : '🎤 말로 넣기'}
      </button>
      {state === 'rec' && <span className="hint">듣고 있어요. 다 말씀하시면 다시 누르세요 (최대 {MAX_SEC}초)</span>}
      {state === 'idle' && !err && <span className="hint">{IND.owner} OpenAI 키로 받아써요 (1분에 약 8원) · {IND.place} 이름 · 동네 이름을 알아듣게 힌트를 줘요</span>}
      {err && <span className="note err" role="alert">{err}</span>}
    </span>
  );
}
