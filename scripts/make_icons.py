"""Draws the app icon and splash screens into the Android project."""
import math, glob, os, sys
from PIL import Image, ImageDraw, ImageFilter
ROOT = sys.argv[1]
BG = (10, 26, 24, 255); INK = (233, 238, 241, 255); HOT = (255, 77, 109, 255)

def art(size, scale=1.0, bg=True):
    S = size * 4
    im = Image.new('RGBA', (S, S), BG if bg else (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c, r = S / 2, S * 0.36 * scale
    pts = [(c + r * math.cos(math.pi / 8 + i * math.pi / 4), c + r * math.sin(math.pi / 8 + i * math.pi / 4)) for i in range(8)]
    d.polygon(pts, outline=INK, width=int(S * 0.045 * scale))
    # glow + beam
    glow = Image.new('RGBA', (S, S), (0, 0, 0, 0)); g = ImageDraw.Draw(glow)
    a, b = (c - r * 0.75, c + r * 0.62), (c + r * 0.62, c - r * 0.55)
    g.line([a, b], fill=(255, 77, 109, 170), width=int(S * 0.11 * scale))
    glow = glow.filter(ImageFilter.GaussianBlur(S * 0.03))
    im = Image.alpha_composite(im, glow); d = ImageDraw.Draw(im)
    d.line([a, b], fill=HOT, width=int(S * 0.045 * scale))
    d.line([a, b], fill=(255, 220, 228, 255), width=int(S * 0.016 * scale))
    rr = S * 0.05 * scale
    d.ellipse([b[0] - rr, b[1] - rr, b[0] + rr, b[1] + rr], fill=(255, 235, 240, 255))
    return im.resize((size, size), Image.LANCZOS)

res = os.path.join(ROOT, 'android/app/src/main/res')
for dpath in glob.glob(res + '/mipmap-*dpi'):
    n = Image.open(dpath + '/ic_launcher.png').size[0]
    icon = art(n)
    icon.save(dpath + '/ic_launcher.png')
    m = Image.new('L', (n, n), 0); ImageDraw.Draw(m).ellipse([0, 0, n - 1, n - 1], fill=255)
    rnd = Image.new('RGBA', (n, n), (0, 0, 0, 0)); rnd.paste(icon, (0, 0), m); rnd.save(dpath + '/ic_launcher_round.png')
    f = Image.open(dpath + '/ic_launcher_foreground.png').size[0]
    art(f, scale=0.62, bg=False).save(dpath + '/ic_launcher_foreground.png')
open(res + '/values/ic_launcher_background.xml', 'w').write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0A1A18</color>\n</resources>\n')
for p in glob.glob(res + '/drawable*/splash.png'):
    w, h = Image.open(p).size
    im = Image.new('RGBA', (w, h), BG)
    s = int(min(w, h) * 0.4)
    im.paste(art(s, bg=False), ((w - s) // 2, (h - s) // 2), art(s, bg=False))
    im.save(p)
art(512).save(os.path.join(ROOT, 'public/icon.png'))
art(512).save(os.path.join(ROOT, 'store-icon-512.png'))
print('icons done')
