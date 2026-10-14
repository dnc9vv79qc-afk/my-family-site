"""自宅周辺の地図を OpenStreetMap のタイルから作り、暗い配色の線画にする。

地図データ © OpenStreetMap contributors (ODbL)。タイルは tools/.tile_cache に保存して再利用する。
"""
import math
import os
import urllib.request

from PIL import Image, ImageFilter

HOME = (34.677, 135.474)  # 大阪市西区九条あたり
ZOOM = 16
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.tile_cache')
UA = 'family-watchface/1.0 (personal watchface; github.com/dnc9vv79qc-afk/my-family-site)'

BG = (10, 12, 14)
BLOCK = (20, 23, 26)
MINOR = (78, 84, 90)
MAJOR = (150, 156, 162)
WATER = (22, 70, 88)
PARK = (16, 30, 22)


def meters_per_px(lat=HOME[0], zoom=ZOOM):
    return 156543.03392 * math.cos(math.radians(lat)) / (2 ** zoom)


def _global_px(lat, lon, zoom):
    n = 2 ** zoom * 256
    x = (lon + 180) / 360 * n
    y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def _tile(x, y):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f'{ZOOM}_{x}_{y}.png')
    if not os.path.exists(path):
        req = urllib.request.Request(f'https://tile.openstreetmap.org/{ZOOM}/{x}/{y}.png',
                                     headers={'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=30) as r, open(path, 'wb') as fp:
            fp.write(r.read())
    return Image.open(path).convert('RGB')


def _near(px, ref, tol):
    return all(abs(a - b) <= tol for a, b in zip(px, ref))


def _classify(rgb):
    r, g, b = rgb
    if _near(rgb, (170, 211, 223), 14):
        return 'water'
    if _near(rgb, (232, 146, 162), 18) or _near(rgb, (249, 178, 156), 16) or _near(rgb, (252, 214, 164), 14) \
            or _near(rgb, (247, 250, 191), 10):
        return 'major'
    if min(r, g, b) >= 250:
        return 'minor'
    if _near(rgb, (200, 250, 204), 16) or _near(rgb, (173, 209, 158), 16) or _near(rgb, (170, 224, 203), 14):
        return 'park'
    if _near(rgb, (217, 208, 201), 8) or _near(rgb, (196, 182, 171), 8):
        return 'block'
    return 'bg'


def build_map(w, h):
    """HOME を中心にした w×h の地図画像を返す。"""
    cx, cy = _global_px(*HOME, ZOOM)
    x0, y0 = int(cx - w / 2), int(cy - h / 2)
    tx0, ty0 = x0 // 256, y0 // 256
    tx1, ty1 = (x0 + w) // 256, (y0 + h) // 256
    mosaic = Image.new('RGB', ((tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256))
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            mosaic.paste(_tile(tx, ty), ((tx - tx0) * 256, (ty - ty0) * 256))
    src = mosaic.crop((x0 - tx0 * 256, y0 - ty0 * 256, x0 - tx0 * 256 + w, y0 - ty0 * 256 + h))

    masks = {k: Image.new('L', (w, h), 0) for k in ('water', 'major', 'minor', 'park', 'block')}
    px = src.load()
    mp = {k: m.load() for k, m in masks.items()}
    for y in range(h):
        for x in range(w):
            k = _classify(px[x, y])
            if k in mp:
                mp[k][x, y] = 255

    # 文字の白いふちどり（細い）を消し、道路だけ残す
    for k in ('minor', 'major'):
        masks[k] = masks[k].filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))

    out = Image.new('RGB', (w, h), BG)
    for k, color in (('block', BLOCK), ('park', PARK), ('water', WATER), ('minor', MINOR), ('major', MAJOR)):
        out.paste(color, (0, 0), masks[k].filter(ImageFilter.GaussianBlur(0.6)))
    return out
