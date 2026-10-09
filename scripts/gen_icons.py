#!/usr/bin/env python3
"""生成数字生活 PWA/TWA 所需的标准 PNG 图标。

依赖：Pillow。用法：
  python scripts/gen_icons.py
输出到 public/icons/：
  icon-192.png          普通图标（带留白圆角方块）
  icon-512.png          大图标（同上，更高清）
  icon-maskable-512.png 满幅背景图标（适配 Android 自适应图标安全区）
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "icons")
os.makedirs(OUT, exist_ok=True)

PLUM = (0x4D, 0x30, 0x45)          # 主题紫 #4d3045
WHITE = (255, 255, 255)
FONT_PATH = "C:/Windows/Fonts/msyh.ttc"  # 微软雅黑


def rounded_icon(size, padding_ratio, font_ratio, maskable=False):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = int(size * padding_ratio)
    box = [pad, pad, size - pad, size - pad]
    radius = int((size - 2 * pad) * 0.28)
    if maskable:
        # 满幅背景，无留白
        d.rounded_rectangle([0, 0, size, size], radius=int(size * 0.18), fill=PLUM)
    else:
        d.rounded_rectangle(box, radius=radius, fill=PLUM)
    # 文字
    fs = int(size * font_ratio)
    font = ImageFont.truetype(FONT_PATH, fs, index=0)
    text = "数"
    bbox = d.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = (size - tw) / 2 - bbox[0]
    ty = (size - th) / 2 - bbox[1]
    d.text((tx, ty), text, font=font, fill=WHITE)
    return img


if __name__ == "__main__":
    jobs = [
        ("icon-192.png", 192, 0.10, 0.62, False),
        ("icon-512.png", 512, 0.10, 0.62, False),
        ("icon-maskable-512.png", 512, 0.0, 0.42, True),
    ]
    for name, size, pad, fr, mask in jobs:
        im = rounded_icon(size, pad, fr, mask)
        im.save(os.path.join(OUT, name), "PNG")
        print("wrote", os.path.join(OUT, name), im.size)
    print("done")
