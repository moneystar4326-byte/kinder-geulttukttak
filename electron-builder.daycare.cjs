// 어린이집 글뚝딱 설치 파일 설정 (2026-10-27): 태권 글뚝딱 설정(package.json "build")을 바탕으로 이름 · appId · 출력 폴더만 바꿈
// 쓰는 법: npm run dist:daycare  (먼저 GTD_INDUSTRY=daycare 로 빌드 — scripts/build.mjs)
// appId · 앱 이름이 다르면 Windows 가 다른 프로그램으로 설치하고 자료 폴더(%APPDATA%\어린이집 글뚝딱)도 따로 씀
const base = require('./package.json').build;

const NAME = '어린이집 글뚝딱';
const VERSION = '1.0.0'; // 어린이집판 버전 (태권도판 2.x 와 따로)

module.exports = {
  ...base,
  appId: 'kr.ddalkak.geulttukttak-daycare',
  productName: NAME,
  extraMetadata: { name: 'geulttukttak-daycare', productName: NAME, version: VERSION, description: `${NAME} — 어린이집 블로그 작가 (설치형)` },
  directories: { ...base.directories, output: 'release-daycare' },
  win: { ...base.win, artifactName: '어린이집글뚝딱-설치-${version}.${ext}' },
  nsis: { ...base.nsis, include: 'build/installer-daycare.nsh', shortcutName: NAME },
  mac: { ...base.mac, artifactName: '어린이집글뚝딱-맥-${version}-${arch}.${ext}' },
};
