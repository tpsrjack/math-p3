# -*- coding: utf-8 -*-
"""
แปลงไฟล์ PDF เฉลย เป็นรูปภาพรายหน้า + สร้าง data.js สำหรับเว็บแอป

ใช้งาน:
    python tools/build_pages.py            # แปลงเฉพาะหน้าที่ยังไม่มี
    python tools/build_pages.py --force    # แปลงใหม่ทั้งหมด
"""
import io
import json
import os
import sys
import time

import pymupdf
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

BOOKS = [
    {
        "id": "book1",
        "label": "เล่ม 1",
        "title": "เฉลยคณิตศาสตร์ ป.3 เล่ม 1",
        "pdf": r"C:\Users\Kru Jack\Documents\เฉลย คณิตศาสตร์ ป.3 เล่ม 1.pdf",
        # (บทที่, ชื่อบท, หน้าเริ่มในเล่มเฉลย) — ตรวจสอบกับหน้า "เตรียมความพร้อม" แล้ว
        "chapters": [
            (1, "จำนวนนับไม่เกิน 100,000", 2),
            (2, "การบวกและการลบจำนวนนับไม่เกิน 100,000", 26),
            (3, "เวลา", 65),
            (4, "รูปเรขาคณิต", 96),
            (5, "แผนภูมิรูปภาพและตารางทางเดียว", 112),
            (6, "เศษส่วน", 136),
            (7, "การคูณ", 167),
        ],
    },
    {
        "id": "book2",
        "label": "เล่ม 2",
        "title": "เฉลยคณิตศาสตร์ ป.3 เล่ม 2",
        "pdf": r"C:\Users\Kru Jack\Documents\เฉลย คณิตศาสตร์ ป.3 เล่ม 2.pdf",
        # (บทที่, ชื่อบท, หน้าเริ่มในเล่มเฉลย) — ตรวจสอบกับหน้า "เตรียมความพร้อม" แล้ว
        "chapters": [
            (8, "การหาร", 2),
            (9, "การวัดความยาว", 46),
            (10, "การวัดน้ำหนัก", 76),
            (11, "การวัดปริมาตร", 112),
            (12, "เงินและบันทึกรายรับรายจ่าย", 144),
            (13, "การบวก ลบ คูณ หารระคน", 184),
        ],
    },
]

DPI = 150          # ความละเอียดปกติ (739 px กว้าง)
DPI_HD = 220       # ความละเอียดสูงสำหรับซูม/จอ retina (~1083 px กว้าง)
QUALITY = 80
QUALITY_HD = 78
THUMB_WIDTH = 150
THUMB_QUALITY = 60


def build_chapters(chapter_defs, total_pages):
    """สร้างช่วงหน้าของแต่ละบทจากหน้าเริ่มที่กำหนดไว้"""
    chapters = []
    for idx, (num, title, start) in enumerate(chapter_defs):
        end = chapter_defs[idx + 1][2] - 1 if idx + 1 < len(chapter_defs) else total_pages
        chapters.append({"n": num, "title": title, "start": start, "end": end})
    return chapters


def render_book(book, force=False):
    src = book["pdf"]
    if not os.path.exists(src):
        raise SystemExit(f"ไม่พบไฟล์: {src}")

    pages_dir = os.path.join(ROOT, "pages", book["id"])
    hd_dir = os.path.join(ROOT, "pages-hd", book["id"])
    thumbs_dir = os.path.join(ROOT, "thumbs", book["id"])
    for d in (pages_dir, hd_dir, thumbs_dir):
        os.makedirs(d, exist_ok=True)

    doc = pymupdf.open(src)
    total = doc.page_count
    print(f"[{book['id']}] {total} หน้า จาก {os.path.basename(src)}")

    t0 = time.time()
    for i, page in enumerate(doc):
        name = f"{i + 1:03d}.webp"
        page_path = os.path.join(pages_dir, name)
        hd_path = os.path.join(hd_dir, name)
        thumb_path = os.path.join(thumbs_dir, name)
        if not force and os.path.exists(page_path) and os.path.exists(hd_path) and os.path.exists(thumb_path):
            continue

        # เรนเดอร์ที่ความละเอียดสูงครั้งเดียว แล้วย่อลงมาเป็นภาพปกติ
        pix = page.get_pixmap(dpi=DPI_HD)
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)

        hbuf = io.BytesIO()
        img.save(hbuf, "WEBP", quality=QUALITY_HD, method=4)
        with open(hd_path, "wb") as f:
            f.write(hbuf.getvalue())

        base_w = round(img.width * DPI / DPI_HD)
        base = img.resize((base_w, round(img.height * base_w / img.width)), Image.LANCZOS)
        buf = io.BytesIO()
        base.save(buf, "WEBP", quality=QUALITY, method=4)
        with open(page_path, "wb") as f:
            f.write(buf.getvalue())

        h = round(base.height * THUMB_WIDTH / base.width)
        thumb = base.resize((THUMB_WIDTH, h), Image.LANCZOS)
        tbuf = io.BytesIO()
        thumb.save(tbuf, "WEBP", quality=THUMB_QUALITY, method=4)
        with open(thumb_path, "wb") as f:
            f.write(tbuf.getvalue())
        if (i + 1) % 10 == 0 or i + 1 == total:
            print(f"  {i + 1}/{total} ({time.time() - t0:.1f}s)")

    chapters = build_chapters(book["chapters"], total)
    doc.close()

    print(f"[{book['id']}] บทที่ตรวจพบ:")
    for c in chapters:
        print(f"   บทที่ {c['n']:>2} หน้า {c['start']:>3}-{c['end']:>3}  {c['title']}")

    return {
        "id": book["id"],
        "label": book["label"],
        "title": book["title"],
        "pages": total,
        "chapters": chapters,
    }


def main():
    force = "--force" in sys.argv
    books = [render_book(b, force=force) for b in BOOKS]
    data = {"generatedAt": time.strftime("%Y-%m-%d %H:%M"), "books": books}
    out = os.path.join(ROOT, "data.js")
    with open(out, "w", encoding="utf-8") as f:
        f.write("// สร้างอัตโนมัติโดย tools/build_pages.py\n")
        f.write("window.APP_DATA = ")
        f.write(json.dumps(data, ensure_ascii=False, indent=2))
        f.write(";\n")
    print(f"เขียน {out} เรียบร้อย")


if __name__ == "__main__":
    main()
