// 처음 켤 때: 전담 비서(설치 도우미)가 계정 연결부터 첫 글까지 같이 해요
import { SetupGuide } from '../guide/SetupGuide';

export function Setup() {
  return <SetupGuide firstRun onClose={() => {}} />;
}
