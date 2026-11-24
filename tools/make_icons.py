# -*- coding: utf-8 -*-
"""สร้างไอคอนสำหรับ PWA (ไอคอน 192/512, maskable, apple-touch-icon)"""
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "icons")

PURPLE = (91, 42, 134, 255)
PURPLE_2 = (122, 63, 174, 255)
WHITE = (255, 255, 255, 255)

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\leelawdb.ttf",
    r"C:\Windows\Fonts\leelawui.ttf",
    r"C:\Windows\Fonts\tahomabd.ttf",
    r"C:\Windows\Fonts\tahoma.ttf",
]


def load_font(size):
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    raise SystemExit("ไม่พบฟอนต์ไทยในเครื่อง")


def gradient(size):
    img = Image.new("RGBA", (size, size))
    px = img.load()
    for y in range(size):
        t = y / max(size - 1, 1)
        r = round(PURPLE[0] + (PURPLE_2[0] - PURPLE[0]) * t)
        g = round(PURPLE[1] + (PURPLE_2[1] - PURPLE[1]) * t)
        b = round(PURPLE[2] + (PURPLE_2[2] - PURPLE[2]) * t)
        for x in range(size):
            px[x, y] = (r, g, b, 255)
    return img


def make_icon(size, glyph_ratio=0.62, radius_ratio=0.22, bleed=False):
    ss = 4  # supersampling
    big = size * ss
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    grad = gradient(big)

    if bleed:
        img.paste(grad, (0, 0))
    else:
        mask = Image.new("L", (big, big), 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            [0, 0, big - 1, big - 1], radius=int(big * radius_ratio), fill=255
        )
        img.paste(grad, (0, 0), mask)

    draw = ImageDraw.Draw(img)
    font = load_font(int(big * glyph_ratio))
    draw.text((big / 2, big * 0.54), "ค", font=font, fill=WHITE, anchor="mm")
    return img.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    make_icon(192).save(os.path.join(OUT, "icon-192.png"))
    make_icon(512).save(os.path.join(OUT, "icon-512.png"))
    make_icon(180).save(os.path.join(OUT, "apple-touch-icon.png"))
    make_icon(512, glyph_ratio=0.5, bleed=True).save(os.path.join(OUT, "icon-maskable-512.png"))
    print("สร้างไอคอนใน", OUT)


if __name__ == "__main__":
    main()
