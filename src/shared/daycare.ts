// 어린이집 글뚝딱의 이름 · 말 · 공통 규칙 (2026-10-27 태권 글뚝딱에서 완전히 떼어 냄)
// 태권 글뚝딱(D:\글뚝딱버전2)과 코드를 같이 쓰지 않음. 네이버 입력처럼 두 앱에 같은 부분을 고칠 때는 양쪽을 따로 고침

export const PRODUCT = 'daycare'; // 홈페이지 이용권 · 버전 확인에서 이 앱을 가리키는 이름

// 화면 · 지시문에 들어가는 말
export const APP = {
  appName: '어린이집 글뚝딱',
  appSub: '어린이집 블로그 작가',
  place: '어린이집', // "어린이집 정보", "어린이집 지도"
  nameLabel: '어린이집 이름',
  audLabel: '보육 대상',
  philLabel: '보육 철학',
  featLabel: '보육 특징',
  owner: '원장님', // 앱이 부르는 호칭
  term: '어린이집', // 검색어 · 제목 머리말에 붙는 말 ("[신대방동 어린이집]")
  dataLocFile: '어린이집글뚝딱-자료위치.txt',
  backupApp: 'geulttukttak-daycare', // 백업 파일 표시 (태권 글뚝딱 백업을 복원하지 않게)
  backupName: '어린이집글뚝딱백업',
  brand: { main: '#3E8E6E', accent: '#F2A541' },
} as const;

// 글 종류: 안쪽 값(저장 · 규칙 이름)은 태권 글뚝딱 때 이름 그대로 두고 화면 · 지시문에 보이는 이름만 바꿈 (예전 자료 · 시험과 맞게)
const KIND_LABEL: Record<string, string> = { '수업 후기': '놀이 · 활동 이야기', '모집 안내': '입소 안내', '교육 정보': '보육 정보' };
export const kindLabel = (kind: string) => KIND_LABEL[kind] ?? kind;

// 아이 나이: 영아(만 0~2세) · 유아(만 3~5세) · 둘 다 (글 독자 고르기와 카드 그림이 같이 씀)
// "아기" 한 낱말은 보지 않음 ("아기상어 율동"이 영아가 되던 문제 · 2026-10-27 버그 점검). "N살"은 세는나이라 1~3살 = 영아
export type AgeBand = 'infant' | 'preschool' | 'mixed';
export function daycareAge(text: string): AgeBand {
  const infant = /영아|(?<!\d)만?\s*[0-2]\s*세|(?<!\d)[1-3]\s*살|돌\s*(쟁이|아기|지난)|걸음마/.test(text);
  const child = /유아|누리\s*과정|(?<!\d)만?\s*[3-5]\s*세|(?<!\d)[4-7]\s*살/.test(text);
  return infant && !child ? 'infant' : child && !infant ? 'preschool' : 'mixed';
}

// 글쓴이 (원장님 · 선생님이 같이 씀). 글마다 고른 사람을 글 재료에 그대로 담아 둠
export type WriterRole = '원장' | '교사';
export interface Writer { id: string; role: WriterRole; name: string; className?: string }

export const writerLabel = (w: Pick<Writer, 'role' | 'name' | 'className'>) =>
  w.role === '원장' ? `원장님${w.name.trim() ? ` (${w.name.trim()})` : ''}` : `${w.className?.trim() ? `${w.className.trim()} ` : ''}${w.name.trim() ? `${w.name.trim()} ` : ''}선생님`;
