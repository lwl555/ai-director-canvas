"""
生成 PWA / 原生 APP 图标。
设计复用 favicon.svg：紫(#a855f7)→粉(#ec4899) 对角线渐变 + 白色右指三角。
输出到 public/icons/：
  icon-192.png / icon-512.png        普通图标（any 用途）
  maskable-192.png / maskable-512.png 遮罩图标（full-bleed， glyph 在安全区）
  apple-touch-icon.png (180)          iOS 主屏幕图标
"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
os.makedirs(OUT, exist_ok=True)

C0 = (0xA8, 0x55, 0xF7)  # #a855f7
C1 = (0xEC, 0x48, 0x99)  # #ec4899


def gradient(size):
    img = Image.new("RGBA", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size)
            r = int(C0[0] + (C1[0] - C0[0]) * t)
            g = int(C0[1] + (C1[1] - C0[1]) * t)
            b = int(C0[2] + (C1[2] - C0[2]) * t)
            px[x, y] = (r, g, b, 255)
    return img


def play_triangle(draw, size, scale=1.0, shift=0.0):
    """右指三角，scale 控制大小（相对画布），shift 控制水平偏移（0.56 居中偏右）。"""
    cx = size * (0.56 + shift)
    cy = size * 0.50
    hw = size * 0.16 * scale
    hh = size * 0.22 * scale
    pts = [(cx - hw, cy - hh), (cx + hw, cy), (cx - hw, cy + hh)]
    draw.polygon(pts, fill=(255, 255, 255, 255))


def make(size, maskable=False):
    img = gradient(size)
    d = ImageDraw.Draw(img)
    if maskable:
        # 安全区（内 80%），glyph 缩到约 0.8 倍 + 不偏移，确保不被系统遮罩裁掉
        play_triangle(d, size, scale=0.80, shift=0.0)
    else:
        play_triangle(d, size, scale=1.0, shift=0.0)
    return img


jobs = [
    ("icon-192.png", 192, False),
    ("icon-512.png", 512, False),
    ("maskable-192.png", 192, True),
    ("maskable-512.png", 512, True),
    ("apple-touch-icon.png", 180, False),
]

for name, size, mask in jobs:
    make(size, mask).save(os.path.join(OUT, name), "PNG")
    print("wrote", name, size)
