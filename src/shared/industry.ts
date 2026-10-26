// 업종 설정 (2026-10-27 어린이집 글뚝딱): 코드는 하나, 설치 파일은 업종마다 따로
// 빌드할 때 GTD_INDUSTRY=daycare 를 주면 어린이집판 (scripts/build.mjs 가 __GTD_INDUSTRY__ 로 박아 넣음). 없으면 태권도판
// 시험(tsx)에서는 박아 넣은 값이 없어 환경변수 GTD_INDUSTRY 를 읽음. 앱 안에 업종 고르기 메뉴는 없음
export type IndustryId = 'taekwondo' | 'daycare';

declare const __GTD_INDUSTRY__: string | undefined;
function readIndustry(): IndustryId {
  const raw = typeof __GTD_INDUSTRY__ !== 'undefined' ? __GTD_INDUSTRY__ : typeof process !== 'undefined' ? process.env?.GTD_INDUSTRY : undefined;
  return raw === 'daycare' ? 'daycare' : 'taekwondo';
}

export const INDUSTRY: IndustryId = readIndustry();
export const isDaycare = INDUSTRY === 'daycare';

// 화면 · 지시문에 들어가는 업종 말. 태권도판 값은 2.2.6 문구 그대로
export const IND = isDaycare
  ? {
      appName: '어린이집 글뚝딱',
      appSub: '어린이집 블로그 작가',
      place: '어린이집', // "어린이집 정보", "어린이집 지도"
      nameLabel: '어린이집 이름',
      audLabel: '보육 대상',
      philLabel: '보육 철학',
      featLabel: '보육 특징',
      owner: '원장님', // 앱이 부르는 호칭
      writers: '원장님 · 선생님',
      term: '어린이집', // 검색어 · 제목 머리말에 붙는 말 ("[신대방동 어린이집]")
      dataLocFile: '어린이집글뚝딱-자료위치.txt',
      backupApp: 'geulttukttak-daycare', // 백업 파일 표시 (다른 업종 백업을 복원하지 않게)
      backupName: '어린이집글뚝딱백업',
      brand: { main: '#3E8E6E', accent: '#F2A541' },
    }
  : {
      appName: '태권 글뚝딱',
      appSub: '버전 2 · 태권도 블로그 작가',
      place: '도장',
      nameLabel: '도장명',
      audLabel: '교육 대상',
      philLabel: '교육 철학',
      featLabel: '수업 특징',
      owner: '관장님',
      writers: '관장님',
      term: '태권도',
      dataLocFile: '글뚝딱-자료위치.txt',
      backupApp: 'geulttukttak2',
      backupName: '태권글뚝딱백업',
      brand: { main: '#1F4E9A', accent: '#C8241C' },
    };

// 글 종류: 안쪽 값(저장 · 규칙 이름)은 그대로 두고 화면 · 지시문에 보이는 이름만 바꿈
const DAYCARE_KIND: Record<string, string> = { '수업 후기': '놀이 · 활동 이야기', '모집 안내': '입소 안내', '교육 정보': '보육 정보' };
export const kindLabel = (kind: string) => (isDaycare ? DAYCARE_KIND[kind] ?? kind : kind);

// 어린이집 아이 나이: 영아(만 0~2세) · 유아(만 3~5세) · 둘 다 (글 독자 고르기와 카드 그림이 같이 씀)
// "아기" 한 낱말은 보지 않음 ("아기상어 율동"이 영아가 되던 문제 · 2026-10-27 버그 점검). "N살"은 세는나이라 1~3살 = 영아
export type AgeBand = 'infant' | 'preschool' | 'mixed';
export function daycareAge(text: string): AgeBand {
  const infant = /영아|(?<!\d)만?\s*[0-2]\s*세|(?<!\d)[1-3]\s*살|돌\s*(쟁이|아기|지난)|걸음마/.test(text);
  const child = /유아|누리\s*과정|(?<!\d)만?\s*[3-5]\s*세|(?<!\d)[4-7]\s*살/.test(text);
  return infant && !child ? 'infant' : child && !infant ? 'preschool' : 'mixed';
}

// 어린이집 글쓴이 (원장님 · 선생님이 같이 씀). 글마다 고른 사람을 글 재료에 그대로 담아 둠
export type WriterRole = '원장' | '교사';
export interface Writer { id: string; role: WriterRole; name: string; className?: string }

export const writerLabel = (w: Pick<Writer, 'role' | 'name' | 'className'>) =>
  w.role === '원장' ? `원장님${w.name.trim() ? ` (${w.name.trim()})` : ''}` : `${w.className?.trim() ? `${w.className.trim()} ` : ''}${w.name.trim() ? `${w.name.trim()} ` : ''}선생님`;
