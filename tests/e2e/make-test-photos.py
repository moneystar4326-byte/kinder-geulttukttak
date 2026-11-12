# 사진 글 앱 시험용 그림 만들기 (진짜 사진 · 아이 얼굴 없음 — 도형만 그린 합성 그림)
# 실행: python tests/e2e/make-test-photos.py <폴더>
import sys
from pathlib import Path
from PIL import Image, ImageDraw

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)


def scene(color, shapes, size=(1600, 1200)):
    img = Image.new('RGB', size, color)
    d = ImageDraw.Draw(img)
    for kind, box, fill in shapes:
        (d.ellipse if kind == 'o' else d.rectangle)(box, fill=fill)
    return img


# 촬영 정보(EXIF 촬영 시각)가 든 JPG: 처리본에는 남지 않아야 함
exif = Image.Exif()
exif[0x8769] = {0x9003: '2026:11:03 10:15:00'}
scene((210, 230, 200), [('o', (300, 300, 700, 700), (230, 160, 60)), ('r', (900, 500, 1300, 900), (120, 80, 40))]).save(out / '01_낙엽으로 왕관 만들기.jpg', quality=90, exif=exif)
scene((200, 220, 240), [('r', (400, 300, 600, 900), (200, 60, 60)), ('r', (650, 450, 850, 900), (60, 120, 200)), ('r', (900, 600, 1100, 900), (240, 200, 60))]).save(out / '02_블록으로 높은 탑 쌓기.jpg', quality=90, exif=exif)
# 이름이 든 장면: 화면은 경고하고, 글에 들어가면 코드가 "한 친구"로 바꿔야 함
scene((240, 225, 190), [('o', (500, 400, 1100, 1000), (230, 210, 150))]).save(out / '03_민준이가 모래성 쌓기.png')
# 장면을 알 수 없는 이름: 장면 칸을 적거나 빼야 함
scene((230, 230, 230), [('o', (700, 500, 900, 700), (90, 90, 90))]).save(out / 'IMG_1234.jpg', quality=90)
print('그림', len(list(out.iterdir())), '장:', out)
