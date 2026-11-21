# 產生 PWA 需要的 PNG 圖示（跟 favicon.svg 同一個圖案）
import sys
from PIL import Image, ImageDraw

def icon(size, pad):
    s = size / 64
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    bg = (14, 116, 144, 255)
    if pad:  # maskable：整張填滿，圖案縮在安全區內
        d.rectangle([0, 0, size, size], fill=bg)
        s *= 0.72
        off = size * 0.14
    else:
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=14 * s, fill=bg)
        off = 0
    w = max(2, round(4 * s))
    P = lambda x, y: (off + x * s, off + y * s)
    d.rounded_rectangle([*P(12, 14), *P(52, 52)], radius=9 * s, outline='white', width=w)
    d.arc([*P(22, 18), *P(42, 38)], 180, 360, fill='white', width=w)
    d.line([P(32, 28), P(36, 22)], fill='white', width=w)
    return img

out = sys.argv[1]
icon(192, False).save(out + '/icon-192.png')
icon(512, False).save(out + '/icon-512.png')
icon(512, True).save(out + '/icon-maskable-512.png')
