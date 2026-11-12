// 네이버 자동 입력 (예전 방식) 켜기 동의 (태권 글뚝딱 2.8.0에서 옮김, 2026-11-10 대표 결정)
// 기본은 꺼짐 · 화면에서 숨김. 설정 → 고급에서 아래 문구를 읽고 3개를 모두 체크해야 켜짐
// 문구는 변호사 검토 전 임시본. 문구를 고치면 VERSION 을 바꿔 다시 동의를 받음 (예전 동의는 자동으로 꺼짐)
// 네이버 약관 원문은 아직 직접 확인하지 못해서 "제한할 수 있고"처럼 조심스럽게 씀
export const NAVER_AUTO_TERMS_VERSION = '2026-11-10-임시';

export const NAVER_AUTO_TERMS = {
  title: '네이버 자동 입력을 켜기 전에 꼭 읽어 주세요',
  intro: '이 기능은 프로그램이 네이버 블로그 편집기에 제목 · 본문 · 카드 · 지도를 대신 넣어 줘요. 발행 · 저장은 지금처럼 직접 눌러야 해요.',
  checks: [
    '본인은 네이버가 허락 없는 자동화 프로그램 사용을 제한할 수 있고, 이 기능을 쓰면 네이버가 계정 이용을 제한하거나 정지할 수 있다는 것을 알고 있어요.',
    '이 기능을 켜고 쓰는 것은 본인의 선택이며, 그로 인한 네이버 계정 제한 · 정지에 대해 그로우모먼트는 고의나 중대한 과실이 없는 한 책임지지 않는다는 데 동의해요.',
    '본인은 언제든 이 기능을 끄고 붙여넣기 도우미를 쓸 수 있다는 것을 알고 있어요.',
  ],
} as const;

export type NaverAutoConsent = { version: string; at: string; appVersion: string };

// 지금 문구에 동의한 기록이 있을 때만 켜짐
export const naverAutoOn = (c?: NaverAutoConsent | null) => !!c && c.version === NAVER_AUTO_TERMS_VERSION;

export const NAVER_AUTO_OFF_MSG = '네이버 자동 입력은 꺼져 있어요. 붙여넣기 도우미를 써 주세요. (꼭 필요하면 설정 → 고급에서 위험 안내에 동의한 뒤 켤 수 있어요)';
