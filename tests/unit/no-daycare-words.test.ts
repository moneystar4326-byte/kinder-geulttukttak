// 유치원판에 어린이집 말이 남지 않았는지 (2026-10-27 기획안 v0.4 12장)
// 프로그램 코드 · 화면 · 안내 대본에서 주석이 아닌 줄을 봄. "어린이집 말을 쓰지 마라 · 바꿔라"처럼 유치원 말과 나란히 적은 줄은 괜찮음
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..', '..');
const WORDS = /어린이집|보육|영아|입소|daycare/i;
// 일부러 적은 줄: 유치원 말과 같이 적은 줄(바꾸라는 규칙 · 비교 금지), 어린이집 · 영어유치원 키워드 빼기, 아이 이름이 아닌 낱말 목록
const OK = /유치원|kinder|OTHER_PLACE|NOT_NAME/;

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : /\.(ts|tsx|json|html|css)$/.test(e.name) ? [p] : [];
  });
}

test('프로그램 · 화면 · 대본에 어린이집 말이 남지 않음', () => {
  const left: string[] = [];
  for (const f of [...files(path.join(ROOT, 'src')), path.join(ROOT, 'docs', '음성안내-대본.json'), path.join(ROOT, 'package.json'), path.join(ROOT, 'build', 'installer.nsh')]) {
    fs.readFileSync(f, 'utf-8').split(/\r?\n/).forEach((line, i) => {
      const code = line.trim();
      if (/^(\/\/|\/\*|\*|;)/.test(code)) return; // 주석
      const body = code.replace(/\/\/.*$/, ''); // 줄 끝 주석
      if (WORDS.test(body) && !OK.test(body)) left.push(`${path.relative(ROOT, f)}:${i + 1}: ${body.slice(0, 80)}`);
    });
  }
  assert.deepEqual(left, []);
});
