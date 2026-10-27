// 유치원 글뚝딱의 이름 · 말 · 공통 규칙 (2026-10-27 어린이집 글뚝딱 1.0.2를 유치원 전용으로 바꿈 — 기획안 v0.4)
// 어린이집판은 git 태그 daycare-1.0.2 로만 보관. 태권 글뚝딱(D:\글뚝딱버전2)과도 코드를 같이 쓰지 않음.
// 네이버 입력처럼 두 앱에 같은 부분을 고칠 때는 양쪽을 따로 고침

export const PRODUCT = 'kinder'; // 홈페이지 이용권 · 버전 확인에서 이 앱을 가리키는 이름

// 화면 · 지시문에 들어가는 말
export const APP = {
  appName: '유치원 글뚝딱',
  appSub: '유치원 블로그 작가',
  place: '유치원', // "유치원 정보", "유치원 지도"
  nameLabel: '유치원 이름',
  philLabel: '교육 철학',
  featLabel: '교육과정 특징',
  owner: '원장님', // 앱이 부르는 호칭
  term: '유치원', // 검색어 · 제목 머리말에 붙는 말 ("[신대방동 유치원]")
  ages: '만 3~5세', // 유치원은 늘 만 3~5세 (반 이름은 흔히 세는 나이로 5세반 · 6세반 · 7세반)
  dataLocFile: '유치원글뚝딱-자료위치.txt',
  backupApp: 'geulttukttak-kinder', // 백업 파일 표시 (태권 · 어린이집 글뚝딱 백업을 복원하지 않게)
  backupName: '유치원글뚝딱백업',
  brand: { main: '#3E8E6E', accent: '#F2A541' },
} as const;

// 글 종류: 안쪽 값(저장 · 규칙 이름)은 태권 글뚝딱 때 이름 그대로 두고 화면 · 지시문에 보이는 이름만 바꿈 (예전 자료 · 시험과 맞게)
const KIND_LABEL: Record<string, string> = { '수업 후기': '놀이 · 활동 이야기', '모집 안내': '입학 · 원아 모집 안내' };
export const kindLabel = (kind: string) => KIND_LABEL[kind] ?? kind;

// 유치원 유형 (기획안 v0.4 7장 — GPT 검토 대기)
export const KINDER_TYPES = ['국공립(단설)', '국공립(병설)', '사립(법인)', '사립(개인)'] as const;

// 글쓴이 (원장님 · 선생님이 같이 씀). 글마다 고른 사람을 글 재료에 그대로 담아 둠
export type WriterRole = '원장' | '교사';
export interface Writer { id: string; role: WriterRole; name: string; className?: string }

export const writerLabel = (w: Pick<Writer, 'role' | 'name' | 'className'>) =>
  w.role === '원장' ? `원장님${w.name.trim() ? ` (${w.name.trim()})` : ''}` : `${w.className?.trim() ? `${w.className.trim()} ` : ''}${w.name.trim() ? `${w.name.trim()} ` : ''}선생님`;
