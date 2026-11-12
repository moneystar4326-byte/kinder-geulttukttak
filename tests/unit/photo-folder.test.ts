// 사진 폴더로 글쓰기 (태권 글뚝딱 2.5.0~2.7.10에서 옮김): 파일 이름 · 이름 경고 · 연결 검사 · 처리본 검사 · 폴더 읽기
// 예시는 유치원 장면으로 바꿈
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ANIMAL_COVER_SCALE, animalIndex, blockSize, hideSceneNames, namesFromScenes, scenesNamesInBody, exifDate, expandBox, jpegHasMetadata, keepPhotoLinks, mergeBoxes, namesInBody, photoLinkErrors, photoStory, sceneFromName, suspectNames, takePhotoMarks, tilesFor, isFace, unrotateBox } from '../../src/shared/photos';
import { hashOf, photoFileProblems, scanFolder } from '../../src/main/services/photo-folder';
import { buildBlocks } from '../../src/main/services/browser-draft';
import { cardMark, isCardMark, PHOTO_BASE, photoOrderProblems } from '../../src/main/services/browser-draft/editor';
import { openDb, SCHEMA_VERSION } from '../../src/main/db';
import { minCharsForInput, targetRangeForInput } from '../../src/shared/count';
import { photoBlock } from '../../src/main/services/openai/prompts';

test('파일 이름에서 번호 · 복사 표시를 떼고 장면 제목을 만듦', () => {
  assert.deepEqual(sceneFromName('01_낙엽으로 왕관 만들기.jpg'), { order: 1, title: '낙엽으로 왕관 만들기', needsTitle: false });
  assert.equal(sceneFromName('2. 블록으로 높은 탑 쌓기.jpeg').order, 2);
  assert.equal(sceneFromName('03-짝과_번갈아_공 굴리기.png').title, '짝과 번갈아 공 굴리기');
  assert.equal(sceneFromName('모래 놀이 (1).jpg').title, '모래 놀이');
  assert.equal(sceneFromName('모래 놀이 - 복사본.jpg').title, '모래 놀이');
  assert.equal(sceneFromName('모래 놀이.jpg').order, null);
});

test('장면을 알 수 없는 이름은 설명을 받음', () => {
  for (const n of ['IMG_3021.jpg', 'DSC0001.JPG', 'KakaoTalk_20261103_123456.jpg', '20261103_123456.jpg', 'Screenshot_1.png', '사진 1.jpg', '1.jpg', 'photo.png']) {
    assert.equal(sceneFromName(n).needsTitle, true, n);
  }
  assert.equal(sceneFromName('2026-11-03_모래 놀이.jpg').needsTitle, false);
});

test('아이 이름으로 보이는 말을 찾고 흔한 말은 넘김', () => {
  assert.deepEqual(suspectNames('김민수 블록 쌓기'), ['김민수']);
  assert.ok(suspectNames('민수 어린이가 공 굴리기').includes('민수'));
  assert.ok(suspectNames('민준이가 낙엽을 모았어요').includes('민준'), '유치원판: 이름 + 조사도 잡음');
  assert.deepEqual(suspectNames('낙엽으로 왕관 만들기'), []);
  assert.deepEqual(suspectNames('짝과 번갈아 공 굴리기'), []);
  assert.deepEqual(suspectNames('우리 어린이 줄넘기'), []);
  assert.deepEqual(suspectNames('7세반 친구들이 바깥놀이터에서 낙엽 놀이를 했어요'), []);
  assert.deepEqual(suspectNames('햇살반 친구가 선생님과 도시락을 먹었어요'), [], '반 이름 · 선생님 · 도시락은 이름이 아님');
  assert.deepEqual(namesInBody('오늘 민수 어린이가 블록을 쌓았어요.'), ['민수']);
  assert.deepEqual(namesInBody('우리 아이들과 낙엽을 모았어요. 7세반 친구가 웃었어요. 다른 친구도 왔어요. 또한 친구들은 뛰었어요.'), []);
});

const doc = (ids: (string | undefined)[]) => ({ sections: ids.map((photoId, i) => ({ id: `s${i}`, paragraphs: ['글'], ...(photoId ? { photoId } : {}) })) });

test('사진 연결: 누락 · 중복 · 모르는 번호를 잡음', () => {
  assert.deepEqual(photoLinkErrors(doc([undefined, 'p01', 'p02', undefined]), ['p01', 'p02']), []);
  assert.equal(photoLinkErrors(doc(['p01']), ['p01', 'p02']).length, 1);
  assert.equal(photoLinkErrors(doc(['p01', 'p01']), ['p01']).length, 1);
  assert.equal(photoLinkErrors(doc(['p01', 'p09']), ['p01']).length, 1);
});

test('다듬기 AI가 사진 번호를 빼도 섹션 id 로 다시 붙이고, 섹션이 없어지면 검사가 잡음', () => {
  const before = doc([undefined, 'p01', 'p02']);
  const after = { sections: before.sections.map(({ photoId: _p, ...s }) => s) };
  assert.deepEqual(photoLinkErrors(keepPhotoLinks(before, after), ['p01', 'p02']), []);
  assert.equal(photoLinkErrors(keepPhotoLinks(before, { sections: after.sections.slice(0, 2) }), ['p01', 'p02']).length, 1);
});

test('얼굴 영역 계산: 넓히기 · 칸 나누기 · 겹침 합치기', () => {
  const b = expandBox({ x: 0.5, y: 0.5, w: 0.1, h: 0.1 });
  assert.ok(Math.abs(b.w - 0.16) < 1e-9 && Math.abs(b.x - 0.47) < 1e-9);
  const edge = expandBox({ x: 0, y: 0.95, w: 0.1, h: 0.1 });
  assert.equal(edge.x, 0);
  assert.ok(edge.y + edge.h <= 1);
  assert.equal(blockSize(30), 12);
  assert.equal(blockSize(120), 20);
  assert.deepEqual(tilesFor(800, 600), []);
  const tiles = tilesFor(4000, 3000);
  assert.ok(tiles.length >= 9);
  for (const t of tiles) assert.ok(t.x >= 0 && t.y >= 0 && t.x + t.w <= 4000 && t.y + t.h <= 3000);
  assert.ok(tiles.some((t) => t.x + t.w === 4000 && t.y + t.h === 3000)); // 오른쪽 아래 끝까지 덮음
  const merged = mergeBoxes([{ x: 0.1, y: 0.1, w: 0.1, h: 0.1, score: 0.9 }, { x: 0.11, y: 0.1, w: 0.1, h: 0.1, score: 0.5 }, { x: 0.6, y: 0.6, w: 0.1, h: 0.1, score: 0.4 }]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].score, 0.9);
});

// 최소 JPEG + EXIF (Exif IFD → DateTimeOriginal)
function exifJpeg(date = '2026:11:03 14:05:09') {
  const ascii = Buffer.from(`${date}\0`, 'latin1');
  const tiff = Buffer.alloc(8 + 2 + 12 + 4 + 2 + 12 + 4 + ascii.length);
  tiff.write('II', 0); tiff.writeUInt16LE(42, 2); tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8); tiff.writeUInt16LE(0x8769, 10); tiff.writeUInt16LE(4, 12); tiff.writeUInt32LE(1, 14); tiff.writeUInt32LE(26, 18); tiff.writeUInt32LE(0, 22);
  tiff.writeUInt16LE(1, 26); tiff.writeUInt16LE(0x9003, 28); tiff.writeUInt16LE(2, 30); tiff.writeUInt32LE(20, 32); tiff.writeUInt32LE(44, 36); tiff.writeUInt32LE(0, 40);
  ascii.copy(tiff, 44);
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const len = Buffer.alloc(2); len.writeUInt16BE(body.length + 2);
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), len, body, Buffer.from([0xff, 0xda, 0, 2, 0xff, 0xd9])]);
}
const plainJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0x4a, 0x46, 0xff, 0xda, 0, 2, 0xff, 0xd9]);

test('촬영 시각을 읽고, 처리본에 촬영 정보가 있으면 알아냄', () => {
  assert.equal(exifDate(exifJpeg()), '2026-11-03 14:05:09');
  assert.equal(exifDate(plainJpeg), null);
  assert.equal(jpegHasMetadata(exifJpeg()), true);
  assert.equal(jpegHasMetadata(plainJpeg), false);
});

test('줄글 사진 글: 소제목 줄의 [p01] 표시를 사진 번호로 바꾸고 표시는 지움 (유치원판)', () => {
  const out = takePhotoMarks([
    { id: 's1', heading: '', paragraphs: ['도입이에요.'] },
    { id: 's2', heading: '[p01] 낙엽 왕관', paragraphs: ['왕관을 만들었어요. [p01]'] },
    { id: 's3', heading: 'p02: 모래성', paragraphs: ['모래성을 쌓았어요.'] },
    { id: 's4', heading: '[p09] 없는 번호', paragraphs: ['글'] },
    { id: 's5', heading: '마무리', paragraphs: ['고마워요.'] },
  ], ['p01', 'p02']);
  assert.deepEqual(out.map((s) => s.photoId), [undefined, 'p01', 'p02', undefined, undefined]);
  assert.deepEqual(out.map((s) => s.heading), ['', '낙엽 왕관', '모래성', '없는 번호', '마무리']);
  assert.equal(out[1].paragraphs[0], '왕관을 만들었어요.');
});

test('한글 · 공백 폴더를 읽음: 순서 · 사용 이력 · HEIC · 깨진 파일 · 하위 폴더 제외', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), '놀이 사진 '));
  try {
    fs.writeFileSync(path.join(dir, '02_블록으로 높은 탑 쌓기.jpg'), plainJpeg);
    fs.writeFileSync(path.join(dir, '01_낙엽으로 왕관 만들기.jpg'), exifJpeg());
    fs.writeFileSync(path.join(dir, 'IMG_1.heic'), 'x');
    fs.writeFileSync(path.join(dir, '깨진 사진.jpg'), 'not jpeg');
    fs.writeFileSync(path.join(dir, '메모.txt'), 'x');
    fs.mkdirSync(path.join(dir, '지난달'));
    fs.writeFileSync(path.join(dir, '지난달', '03_옛 사진.jpg'), plainJpeg);
    const later = Date.now() + 10_000;
    const list = await scanFolder(dir, new Set([hashOf(plainJpeg)]), later);
    const ok = list.filter((p) => !p.problem);
    assert.deepEqual(ok.map((p) => p.title), ['낙엽으로 왕관 만들기', '블록으로 높은 탑 쌓기']);
    assert.equal(ok[0].takenAt, '2026-11-03 14:05:09');
    assert.equal(ok[0].used, false);
    assert.equal(ok[1].used, true);
    assert.equal(list.find((p) => p.name === 'IMG_1.heic')?.problem, 'heic');
    assert.equal(list.find((p) => p.name === '깨진 사진.jpg')?.problem, 'unreadable');
    assert.equal(list.length, 4);
    assert.equal((await scanFolder(dir, new Set(), Date.now())).filter((p) => p.problem === 'copying').length >= 1, true);
    assert.deepEqual(fs.readdirSync(dir).sort(), ['01_낙엽으로 왕관 만들기.jpg', '02_블록으로 높은 탑 쌓기.jpg', 'IMG_1.heic', '깨진 사진.jpg', '메모.txt', '지난달'].sort()); // 폴더에 아무것도 만들지 않음
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('확인 안 한 사진 · 없어지거나 바뀐 처리본은 입력을 막음', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtd-photo-'));
  try {
    const f = path.join(dir, 'p01.jpg');
    fs.writeFileSync(f, plainJpeg);
    const good = { title: 'A', status: 'ready' as const, confirmed: true, excluded: false, processedFile: f, processedHash: hashOf(plainJpeg) };
    assert.deepEqual(photoFileProblems([good]), []);
    assert.equal(photoFileProblems([{ ...good, confirmed: false }]).length, 1);
    assert.equal(photoFileProblems([{ ...good, status: 'failed' }]).length, 1);
    assert.equal(photoFileProblems([{ ...good, excluded: true }]).length, 1); // 넣을 사진 없음
    assert.deepEqual(photoFileProblems([good, { ...good, confirmed: false, excluded: true }]), []);
    fs.writeFileSync(f, exifJpeg());
    assert.equal(photoFileProblems([good]).length, 1); // 바뀜
    fs.rmSync(f);
    assert.equal(photoFileProblems([good]).length, 1); // 없어짐
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('사진 자리 글자는 카드 번호와 겹치지 않고 장면 글 바로 아래 들어감', () => {
  assert.equal(cardMark(PHOTO_BASE, '왕관 [만들기]'), '[사진 1 · 왕관 만들기]');
  assert.equal(isCardMark('[사진 1 · 왕관]', PHOTO_BASE), true);
  assert.equal(isCardMark('[사진 10 · 왕관]', PHOTO_BASE), false);
  assert.equal(isCardMark('[카드 1 · 왕관]', PHOTO_BASE), false);
  assert.equal(isCardMark('[사진 1 · 왕관]', 0), false);
  const blocks = buildBlocks([{ id: 's1', paragraphs: ['도입'] }, { id: 's2', heading: '장면', paragraphs: ['장면 글'] }, { id: 's3', paragraphs: ['마무리'] }], [], [], [{ sectionId: 's2', index: PHOTO_BASE, title: '장면 하나' }]);
  assert.deepEqual(blocks.map((b) => b.text), ['도입', '장면', '장면 글', '[사진 1 · 장면 하나]', '마무리']);
});

test('입력 후 순서 대조: 장면 글 바로 아래 사진이 있어야 함', () => {
  const anchors = [{ title: 'A', lastLine: '에이 글 끝' }, { title: 'B', lastLine: '비 글 끝' }];
  assert.deepEqual(photoOrderProblems(['도입', '에이 글 끝', '[img]', '', '비 글 끝', '[img]', '마무리'], anchors), []);
  assert.equal(photoOrderProblems(['에이 글 끝', '[사진 1 · A]', '비 글 끝', '[img]'], anchors).length, 1);
  assert.equal(photoOrderProblems(['비 글 끝', '[img]', '에이 글 끝', '[img]'], anchors).length, 1); // 순서 바뀜
});

test('자료 버전 2: 사진 표가 생기고 글을 지우면 사진 줄도 지워지며 사용 이력은 남음', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtd-db-'));
  const db = openDb(path.join(dir, 'a.db'));
  try {
    assert.ok(SCHEMA_VERSION >= 2);
    const a = db.createArticle('default', { topic: 't' } as any, [], false);
    db.addPhotos(a.id, [{ id: 'p01', hash: 'h1', sourcePath: 'C:/x.jpg', title: '장면' }]);
    assert.equal(db.listPhotos(a.id)[0].status, 'pending');
    db.updatePhoto(a.id, 'p01', { status: 'ready', regions: [{ x: 0, y: 0, w: 0.1, h: 0.1, source: 'auto' }], confirmed: true });
    assert.equal(db.getPhoto(a.id, 'p01')!.regions.length, 1);
    db.markPhotosUsed(a.id, ['h1']);
    db.deleteArticle(a.id);
    assert.equal(db.listPhotos(a.id).length, 0);
    assert.ok(db.usedHashes().has('h1'));
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('사진 글 프롬프트와 분량: 재료만큼, 장면 소제목 줄에 사진 번호', () => {
  const scenes = [{ id: 'p01', title: '낙엽 모으기' }, { id: 'p02', title: '왕관 만들기' }];
  const block = photoBlock({ photoScenes: scenes } as any);
  assert.match(block, /p01: 낙엽 모으기/);
  assert.match(block, /## \[p01\]/);
  assert.match(block, /사진을 볼 수 없다/);
  assert.equal(photoBlock({} as any), '');
  assert.deepEqual(targetRangeForInput({ photoScenes: scenes }), [200, 450]); // 재료가 적으면 짧은 글
  const much = { photoScenes: scenes, facts: { story: '가'.repeat(400) } };
  assert.deepEqual(targetRangeForInput(much), [520, 1200]);
  assert.deepEqual(targetRangeForInput({ photoScenes: scenes, facts: { story: '가'.repeat(2000) } })[1], 1400);
  assert.equal(minCharsForInput({ photoScenes: scenes }), 200);
  assert.match(photoStory('주제', scenes), /장면 2: 왕관 만들기/);
});

test('돌려서 찾은 얼굴 위치를 원래 자리로 되돌림', () => {
  const b = { x: 0.1, y: 0.2, w: 0.3, h: 0.1 };
  const close = (a: any, e: any) => { for (const k of ['x', 'y', 'w', 'h']) assert.ok(Math.abs(a[k] - e[k]) < 1e-9, `${k} ${a[k]} ${e[k]}`); };
  close(unrotateBox(b, 0), b);
  close(unrotateBox(b, 2), { x: 0.6, y: 0.7, w: 0.3, h: 0.1 });
  // 시계 방향 90도: 돌린 사진의 왼쪽 위 = 원래 사진의 왼쪽 아래
  close(unrotateBox({ x: 0, y: 0, w: 0.1, h: 0.2 }, 1), { x: 0, y: 0.9, w: 0.2, h: 0.1 });
  close(unrotateBox({ x: 0, y: 0, w: 0.1, h: 0.2 }, 3), { x: 0.8, y: 0, w: 0.2, h: 0.1 });
  for (const q of [1, 3] as const) close(unrotateBox(unrotateBox(unrotateBox(unrotateBox(b, q), q), q), q), b);
});

test('얼굴 후보 고르기: 무늬 착각은 빼고, 물구나무 얼굴은 남김', () => {
  const c = { x: 0, y: 0, w: 0.1, h: 0.1 };
  assert.equal(isFace({ ...c, score: 0.31, from: 'whole', quarter: 0 }), true); // 정방향은 놓치지 않는 쪽
  assert.equal(isFace({ ...c, score: 0.92, from: 'whole', quarter: 2 }), true); // 물구나무 얼굴
  assert.equal(isFace({ ...c, score: 0.36, from: 'whole', quarter: 2 }), false); // 빠른 검사: 확인 없는 낮은 점수
  assert.equal(isFace({ ...c, score: 0.36, from: 'whole', quarter: 2, check: 0.1 }), false);
  assert.equal(isFace({ ...c, score: 0.36, from: 'whole', quarter: 2, check: 0.6 }), true);
  assert.equal(isFace({ ...c, score: 0.85, from: 'tile', quarter: 0, check: 0 }), false); // 매트 · 바지 착각 (실제 사진 0.78 · 0.85)
  assert.equal(isFace({ ...c, score: 0.4, from: 'tile', quarter: 0, check: 0.5 }), true);
});

test('장면 칸의 아이 이름을 찾아 본문에 있으면 알림 (호칭 없이도)', () => {
  const titles = ['하원할 때 민서 할머니랑 찰칵', '하원할 때 지호이 할머니랑 찰칵', '6살 하윤이가 줄넘기 연습', '친구 엄마랑 인사', '찍어 줄게 했더니 브이'];
  const names = namesFromScenes(titles);
  for (const n of ['민서', '지호', '하윤']) assert.ok(names.includes(n), names.join());
  assert.ok(!names.includes('친구'), names.join());
  assert.deepEqual(namesFromScenes(['물 마시던 친구가 달려왔어요', '줄넘기 하던 친구']), []); // 꾸미는 말은 이름이 아님
  assert.deepEqual(namesFromScenes(['지은 친구가 달려왔어요']), ['지은']);
  assert.deepEqual(namesFromScenes(['선생님 친구와 인사', '마지막 친구', '여러분 친구', '7살 선생님']), [], '흔한 낱말은 이름이 아님');
  assert.deepEqual(scenesNamesInBody('하원할 때 지호이 할머니와 찍었어요.', titles), ['지호']);
  assert.deepEqual(namesFromScenes(['7세반 형님들이 동생들을 도와줬어요', '햇살반 친구가 선생님께 인사']), [], '유치원 말은 이름이 아님');
  assert.deepEqual(scenesNamesInBody('6살 하윤이가 연습했어요. 민서는 웃었어요.', titles).sort(), ['민서', '하윤'].sort());
  assert.deepEqual(scenesNamesInBody('한 친구가 할머니와 찍었어요. 하윤동에 가요.', titles), []);
});

test('사진 글 지시: 재료만큼 · 유치원 목소리(해요체 · 질문 · 40자) · 채우기 금지 · 이름 후보 전달', () => {
  const block = photoBlock({ photoScenes: [{ id: 'p01', title: '하원할 때 민서 할머니랑 찰칵' }] } as any);
  assert.match(block, /재료만큼만/);
  assert.match(block, /해요체/);
  assert.match(block, /질문은 글 전체에 2~3개/);
  assert.match(block, /40자 안팎/);
  assert.match(block, /이름일 수 있으니.*민서/);
  assert.doesNotMatch(block, /150~250자/);
  assert.doesNotMatch(block, /사범|관장|도장|태권/);
});

test('장면 칸의 이름이 글에 들어가면 "한 친구"로 바꿈', () => {
  const titles = ['6살 하윤이가 줄넘기 연습', '지호이 할머니랑 찰칵'];
  const doc = { sections: [{ heading: '하윤이의 줄넘기', paragraphs: ['6살 하윤이가 연습했어요. 지호가 웃었어요.', '하윤은 뛰었어요. 하윤동에 가요.'] }] };
  const out = hideSceneNames(doc, titles);
  assert.equal(out.sections[0].heading, '한 친구의 줄넘기');
  assert.equal(out.sections[0].paragraphs[0], '한 친구가 연습했어요. 한 친구가 웃었어요.');
  assert.equal(out.sections[0].paragraphs[1], '한 친구는 뛰었어요. 하윤동에 가요.');
  assert.equal(hideSceneNames(doc, ['찍어 줄게 했더니 브이']), doc);
});

test('동물 가림: 한 사진 안에서는 겹치지 않고, 사진마다 시작이 다름', () => {
  const n = 11;
  const one = Array.from({ length: n }, (_, i) => animalIndex(i, 2, n));
  assert.equal(new Set(one).size, n);
  assert.notEqual(animalIndex(0, 0, n), animalIndex(0, 1, n));
  assert.ok(ANIMAL_COVER_SCALE * 1.6 > 1.2 && ANIMAL_COVER_SCALE <= 1, '얼굴(칸의 1/1.6)은 덮되 칸 밖으로 넘치지 않음');
});
