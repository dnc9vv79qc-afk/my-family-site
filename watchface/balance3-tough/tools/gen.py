"""TOUGH Ti: ミリタリー × シンプルのアナログ文字盤（黒 × オレンジ）の画像と watchface/layout.js を作る。

    python3 tools/gen.py

ガンメタのベゼル、立体のバーインデックス（12・3・6・9 にオレンジ）、スケルトン針。
左に曜日、右にデジタル時刻と日付、下に電池のリング。
絵は 4 倍の大きさで描いてから縮める（輪郭をなめらかにするため）。角度は 12 時が 0°・時計回り。
"""
import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
IMG_DIR = os.path.join(ROOT, 'assets', 'balance3', 'images')
FONT_DIR = os.path.join(HERE, 'fonts')

S = 4  # 下描きの倍率
W = 480
C = W / 2

ORANGE = (255, 122, 26, 255)
ORANGE_D = (150, 64, 10, 255)
METAL = (138, 142, 146, 255)
METAL_HI = (196, 200, 204, 255)
METAL_LO = (54, 56, 60, 255)
LUME = (214, 218, 206, 255)
TEXT = (196, 200, 204, 255)
TEXT_DIM = (112, 116, 120, 255)
WIN_BG = (11, 12, 13, 255)
TRACK = (40, 42, 45, 255)
AOD_LINE = (112, 116, 120, 255)
AOD_DIM = (62, 64, 68, 255)
AOD_ORANGE = (160, 74, 16, 255)
CYAN, CYAN_HI, CYAN_LO = METAL, METAL_HI, METAL_LO  # applied() の既定色
ENGRAVE = (11, 11, 12, 255)

# 時計本体に金属のベゼルがあるので、画面にはベゼルを描かず文字盤を端まで使う
R_BEZEL = 240
R_RING = 240  # 画面の端
R_DIAL = 204  # 文字盤（外側 204〜240 は分目盛りのリング）
IDX_R1, IDX_R2 = 152, 198  # インデックス
GUARDS = (45, 135, 225, 315)  # リングのボルト付きガード

WEEK_C = (146, 240)  # 左: 曜日
WEEK_R = 62
WIN = (270, 196, 128, 88)  # 右: デジタル時刻・日付の窓 x, y, w, h
BAT_C = (240, 344)  # 下: 電池
BAT_R = 52
BAT_RING = 40

L = {}


# ---------------------------------------------------------------- 道具

def font(weight, size):
    return ImageFont.truetype(os.path.join(FONT_DIR, f'rubik-latin-{weight}-normal.woff'), max(1, int(round(size))))


def save(img, rel):
    path = os.path.join(IMG_DIR, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    return 'images/' + rel


def canvas(w, h=None):
    return Image.new('RGBA', (int(w * S), int((h or w) * S)), (0, 0, 0, 0))


def shrink(img):
    return img.resize((img.width // S, img.height // S), Image.LANCZOS)


def polar(r, deg, cx=C, cy=C):
    a = math.radians(deg)
    return cx + r * math.sin(a), cy - r * math.cos(a)


def sp(pts):
    """最終の座標 → 下描きの座標"""
    return [(x * S, y * S) for x, y in pts]


def radial_bar(r1, r2, deg, w, cx=C, cy=C):
    """中心から外へ向かう太さ w の帯（四角形）"""
    a = math.radians(deg)
    dx, dy = math.sin(a), -math.cos(a)
    nx, ny = -dy, dx
    h = w / 2
    return [(cx + dx * r1 + nx * h, cy + dy * r1 + ny * h), (cx + dx * r2 + nx * h, cy + dy * r2 + ny * h),
            (cx + dx * r2 - nx * h, cy + dy * r2 - ny * h), (cx + dx * r1 - nx * h, cy + dy * r1 - ny * h)]


def rotate_pts(pts, deg, cx, cy):
    a = math.radians(deg)
    ca, sa = math.cos(a), math.sin(a)
    return [(cx + (x - cx) * ca - (y - cy) * sa, cy + (x - cx) * sa + (y - cy) * ca) for x, y in pts]


def text_img(s, f, fill, spacing=0):
    """文字列を切り抜いた画像（下描きの倍率で）"""
    probe = ImageDraw.Draw(Image.new('L', (1, 1)))
    widths = [probe.textlength(ch, font=f) for ch in s]
    tw = sum(widths) + spacing * S * (len(s) - 1)
    asc, desc = f.getmetrics()
    img = Image.new('RGBA', (int(tw) + 4, asc + desc + 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    x = 2
    for ch, cw in zip(s, widths):
        d.text((x, 2), ch, font=f, fill=fill)
        x += cw + spacing * S
    return img.crop(img.getbbox() or (0, 0, 1, 1))


def paste_center(dst, src, cx, cy):
    dst.alpha_composite(src, (int(round(cx * S - src.width / 2)), int(round(cy * S - src.height / 2))))


def text_at(dst, s, cx, cy, size, fill, weight=500, spacing=0, rot=0):
    t = text_img(s, font(weight, size * S), fill, spacing)
    if rot:
        t = t.rotate(-rot, resample=Image.BICUBIC, expand=True)
    paste_center(dst, t, cx, cy)


def arc_text(dst, s, r, center_deg, size, fill, weight=500, spacing=0.0, bottom=False, cx=C, cy=C):
    """円に沿った文字。上半分は外向きに時計回り、下半分（bottom）は読めるように反時計回りに並べる"""
    f = font(weight, size * S)
    probe = ImageDraw.Draw(Image.new('L', (1, 1)))
    widths = [probe.textlength(ch, font=f) / S + spacing for ch in s]
    total = sum(widths) - spacing
    deg_per_px = 180 / (math.pi * r)
    a = center_deg - (total * deg_per_px / 2) * (-1 if bottom else 1)
    for ch, cw in zip(s, widths):
        mid = a + (cw / 2) * deg_per_px * (-1 if bottom else 1)
        if ch != ' ':
            g = text_img(ch, f, fill)
            g = g.rotate(-(mid + (180 if bottom else 0)), resample=Image.BICUBIC, expand=True)
            x, y = polar(r, mid, cx, cy)
            paste_center(dst, g, x, y)
        a += cw * deg_per_px * (-1 if bottom else 1)


def engraved(dst, draw_fn):
    """沈んだ彫り込み: 文字は地より暗く、右下のふちだけがうっすら光る"""
    hi = canvas(W)
    draw_fn(hi, (40, 41, 44, 255))
    body = canvas(W)
    draw_fn(body, ENGRAVE)
    dst.alpha_composite(hi, (int(0.8 * S), int(0.8 * S)))
    dst.alpha_composite(body)


def drop_shadow(dst, layer, off=2.0, blur=2.5, alpha=0.8):
    a = layer.getchannel('A').filter(ImageFilter.GaussianBlur(blur * S))
    a = a.point(lambda v: int(v * alpha))
    sh = Image.new('RGBA', layer.size, (0, 0, 0, 255))
    sh.putalpha(a)
    dst.alpha_composite(sh, (int(off * S * 0.6), int(off * S)))


def applied(dst, mask, color=CYAN, hi=CYAN_HI, lo=CYAN_LO, shadow=True):
    """文字盤に貼った立体のパーツ（インデックス・数字）: 影 → 暗いふち → 本体 → 上側のハイライト"""
    body = Image.new('RGBA', mask.size, color)
    body.putalpha(mask)
    if shadow:
        drop_shadow(dst, body, off=2.4, blur=2.2, alpha=0.9)
    edge = Image.new('RGBA', mask.size, lo)
    edge.putalpha(mask.filter(ImageFilter.MaxFilter(3 * 2 + 1)))
    dst.alpha_composite(edge)
    dst.alpha_composite(body)
    # 上と左の面だけ明るく（光は左上から）
    shifted = Image.new('L', mask.size, 0)
    shifted.paste(mask, (int(1.2 * S), int(1.6 * S)))
    top = np.clip(np.asarray(mask, dtype=np.int16) - np.asarray(shifted, dtype=np.int16), 0, 255).astype(np.uint8)
    hl = Image.new('RGBA', mask.size, hi)
    hl.putalpha(Image.fromarray(top).point(lambda v: int(v * 0.85)))
    dst.alpha_composite(hl)


def mask_of(draw_fn, size=W):
    m = Image.new('L', (int(size * S), int(size * S)), 0)
    draw_fn(ImageDraw.Draw(m))
    return m




# ---------------------------------------------------------------- 背景

def base_layer():
    n = W * S
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    xx = (xx + 0.5) / S - C
    yy = (yy + 0.5) / S - C
    r = np.hypot(xx, yy)
    ang = (np.degrees(np.arctan2(xx, -yy)) + 360) % 360
    rng = np.random.default_rng(5)
    light = np.cos(np.radians(ang - 315))

    # ベゼル: ガンメタの同心円ヘアライン
    rings = rng.normal(0, 1, 4096).astype(np.float32)
    hair = rings[np.clip((r * 8).astype(np.int32), 0, 4095)]
    tb = np.clip((r - R_RING) / max(1, R_BEZEL - R_RING), 0, 1)
    bez = 44 + 14 * np.sin(tb * math.pi) + 16 * light + 3 * hair
    # 分目盛りのリング: 暗い、内側へ少し下がる
    tr = np.clip((r - R_DIAL) / (R_RING - R_DIAL), 0, 1)
    ring = 13 + 5 * tr + 2 * light
    # 文字盤: マットな黒に、ぼかしたむら
    blot = Image.fromarray((rng.random((n // 16, n // 16)) * 255).astype(np.uint8)).resize((n, n), Image.BICUBIC).filter(ImageFilter.GaussianBlur(6 * S))
    blot = (np.asarray(blot, np.float32) - 128) / 128
    td = np.clip(r / R_DIAL, 0, 1)
    dial = 34 - 9 * td ** 2 + 3.0 * blot + 2.0 * light + rng.normal(0, 1.0, (n, n)).astype(np.float32)
    # インデックスの並ぶ外周の帯は一段暗く
    dial -= 5 * np.clip((r - 150) / 3, 0, 1)

    v = np.where(r >= R_RING, bez, np.where(r >= R_DIAL, ring, dial))
    rgb = np.stack([v, v + 1, v + 3], -1)
    for rr, k, w in ((R_DIAL, -14, 1.0), (R_DIAL - 1.8, 8, 0.8), (150, -8, 0.8), (151.5, 5, 0.7)):
        rgb += (k * np.exp(-((r - rr) / w) ** 2))[..., None]
    alpha = np.clip((240 - r) * S, 0, 1) * 255
    return Image.fromarray(np.concatenate([np.clip(rgb, 0, 255), alpha[..., None]], -1).astype(np.uint8), 'RGBA')


def draw_panel_lines(bg):
    """文字盤のうっすらした段差の線（ミリタリーの計器パネル風）"""
    layer = canvas(W)
    d = ImageDraw.Draw(layer)
    col = (30, 31, 34, 255)
    dark = (10, 10, 11, 255)
    for r_, a0, a1 in ((112, 200, 340), (112, 20, 160)):
        box = sp([(C - r_, C - r_), (C + r_, C + r_)])
        d.arc(box, start=a0 - 90, end=a1 - 90, fill=dark, width=int(1.2 * S))
        box2 = sp([(C - r_ - 1.2, C - r_ - 1.2), (C + r_ + 1.2, C + r_ + 1.2)])
        d.arc(box2, start=a0 - 90, end=a1 - 90, fill=col, width=int(1 * S))
    for deg in (45, 135, 225, 315):
        d.line(sp([polar(116, deg), polar(148, deg)]), fill=dark, width=int(1.2 * S))
    bg.alpha_composite(layer)


def draw_ring_marks(bg):
    layer = canvas(W)
    d = ImageDraw.Draw(layer)
    for i in range(60):
        deg = i * 6
        if i % 15 == 0:
            if i == 0:
                d.polygon(sp([polar(R_RING - 3, -4.2), polar(R_RING - 3, 4.2), polar(R_DIAL + 5, 0)]), fill=ORANGE)
            else:
                d.polygon(sp(radial_bar(R_DIAL + 5, R_RING - 3, deg, 6.5)), fill=ORANGE)
        elif i % 5 == 0:
            d.polygon(sp(radial_bar(R_DIAL + 6, R_RING - 4, deg, 3.4)), fill=TEXT)
        else:
            d.polygon(sp(radial_bar(R_DIAL + 12, R_RING - 6, deg, 1.6)), fill=(96, 100, 104, 255))
        if i % 5 == 2 or i % 5 == 3:
            pass
    # 2.5 分ごとの小さなオレンジの点（3・6・9・12 の両隣）
    for deg in (15, 75, 105, 165, 195, 255, 285, 345):
        x, y = polar((R_DIAL + R_RING) / 2, deg)
        d.ellipse(sp([(x - 1.2, y - 1.2), (x + 1.2, y + 1.2)]), fill=ORANGE_D)
    bg.alpha_composite(layer)


def bolt(layer, cx, cy, r=6.5):
    """六角ボルトの頭: 金属の六角形に、暗い六角の穴"""
    d = ImageDraw.Draw(layer)
    hexa = lambda rr, rot=0: sp([(cx + rr * math.cos(math.radians(a + rot)), cy + rr * math.sin(math.radians(a + rot))) for a in range(0, 360, 60)])
    d.polygon(hexa(r + 1), fill=(8, 8, 9, 255))
    d.polygon(hexa(r), fill=(112, 116, 120, 255))
    d.polygon(hexa(r - 1.4), fill=(150, 154, 158, 255))
    d.pieslice(sp([(cx - r, cy - r), (cx + r, cy + r)]), start=-30, end=150, fill=(84, 88, 92, 255))
    d.polygon(hexa(r - 1.4), outline=(70, 72, 76, 255), width=int(0.6 * S))
    d.polygon(hexa(r * 0.42, 30), fill=(16, 16, 18, 255))


def draw_guards(bg):
    """リングの斜め 4 か所に、ボルトで留めたいかついガード"""
    layer = canvas(W)
    d = ImageDraw.Draw(layer)
    for g in GUARDS:
        pts = [polar(R_DIAL - 3, g + a) for a in (-9, -4, 4, 9)] + [polar(R_RING + 2, g + a) for a in (12, -12)]
        pts = [pts[0], pts[1], pts[2], pts[3], pts[4], pts[5]]
        d.polygon(sp(pts), fill=(34, 35, 38, 255))
        inner = [polar(R_DIAL, g + a) for a in (-7.5, -3.5, 3.5, 7.5)] + [polar(R_RING - 1, g + a) for a in (10, -10)]
        lit = max(0.0, math.cos(math.radians(g - 315)))
        v = int(44 + 22 * lit)
        d.polygon(sp(inner), fill=(v, v + 1, v + 3, 255))
        # 溝 2 本
        for a in (-6, 6):
            d.line(sp([polar(R_DIAL + 3, g + a * 0.8), polar(R_RING - 2, g + a)]), fill=(14, 14, 15, 255), width=int(1.2 * S))
    drop_shadow(bg, layer, off=2.6, blur=2.4, alpha=1.0)
    bg.alpha_composite(layer)
    b = canvas(W)
    for g in GUARDS:
        bolt(b, *polar((R_DIAL + R_RING) / 2 + 1, g), r=8.5)
    drop_shadow(bg, b, off=1.4, blur=1.2, alpha=0.9)
    bg.alpha_composite(b)


def draw_honeycomb(bg):
    """文字盤の中央に、うっすら浮き出たハニカム模様"""
    size = 8.0
    hi = canvas(W)
    lo = canvas(W)
    dh = ImageDraw.Draw(hi)
    dl = ImageDraw.Draw(lo)
    w = math.sqrt(3) * size
    rows = int(W / (1.5 * size)) + 2
    for row in range(rows):
        cy = row * 1.5 * size
        for col in range(int(W / w) + 2):
            cx = col * w + (w / 2 if row % 2 else 0)
            if math.hypot(cx - C, cy - C) > 150:
                continue
            pts = [(cx + size * math.cos(math.radians(a + 30)), cy + size * math.sin(math.radians(a + 30))) for a in range(0, 360, 60)]
            dl.line(sp(pts + [pts[0]]), fill=(8, 8, 9, 255), width=int(1.1 * S))
            dh.line(sp(pts + [pts[0]]), fill=(52, 54, 58, 255), width=int(0.7 * S))
    m = Image.new('L', hi.size, 0)
    ImageDraw.Draw(m).ellipse(sp([(C - 148, C - 148), (C + 148, C + 148)]), fill=255)
    m = m.filter(ImageFilter.GaussianBlur(10 * S))
    for layer, off in ((hi, (int(0.7 * S), int(0.7 * S))), (lo, (0, 0))):
        a = np.asarray(layer.getchannel('A'), np.float32) * np.asarray(m, np.float32) / 255 * 0.8
        layer.putalpha(Image.fromarray(a.astype(np.uint8)))
        bg.alpha_composite(layer, off)


def chamfer(x, y, w, h, k):
    return [(x + k, y), (x + w - k, y), (x + w, y + k), (x + w, y + h - k), (x + w - k, y + h), (x + k, y + h), (x, y + h - k), (x, y + k)]


def index_list():
    return [(h * 30, h % 3 == 0) for h in range(12)]


def draw_indices(bg):
    """立体の金属バー。光の側の面が明るい。12・3・6・9 は外側半分にオレンジを差す"""
    lx, ly = -0.707, -0.707
    m = mask_of(lambda d: [d.polygon(sp(radial_bar(IDX_R1, IDX_R2, deg, 17 if big else 14)), fill=255) for deg, big in index_list()])
    body = Image.new('RGBA', m.size, (0, 0, 0, 255))
    body.putalpha(m)
    drop_shadow(bg, body, off=3.0, blur=2.4, alpha=1.0)
    layer = canvas(W)
    d = ImageDraw.Draw(layer)
    for deg, big in index_list():
        w = 17 if big else 14
        a = math.radians(deg)
        nx, ny = math.cos(a), math.sin(a)
        p = radial_bar(IDX_R1, IDX_R2, deg, w)
        mid1 = ((p[0][0] + p[3][0]) / 2, (p[0][1] + p[3][1]) / 2)
        mid2 = ((p[1][0] + p[2][0]) / 2, (p[1][1] + p[2][1]) / 2)
        for face, sign in (([p[0], p[1], mid2, mid1], 1), ([mid1, mid2, p[2], p[3]], -1)):
            lit = max(0.0, (nx * lx + ny * ly) * sign)
            v = int(64 + 96 * lit)
            d.polygon(sp(face), fill=(v, v + 2, v + 4, 255))
        d.line(sp([mid1, mid2]), fill=METAL_HI, width=int(0.8 * S))
        d.line(sp(p + [p[0]]), fill=(14, 14, 15, 255), width=int(0.8 * S))
        if big:
            d.polygon(sp(radial_bar(IDX_R1 + (IDX_R2 - IDX_R1) * 0.45, IDX_R2 - 4, deg, w - 7)), fill=ORANGE)
            d.polygon(sp(radial_bar(IDX_R2 - 8, IDX_R2 - 4, deg, w - 7)), fill=(255, 168, 96, 255))
    bg.alpha_composite(layer)


def recess(bg, cx, cy, r, rim=True):
    """くぼんだ丸: 上側に内影、下のふちにハイライト、細い金属のふち"""
    n = int(2 * (r + 4) * S)
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    xx = (xx + 0.5) / S - (r + 4)
    yy = (yy + 0.5) / S - (r + 4)
    rr = np.hypot(xx, yy)
    v = 13 + 1.2 * np.sin(rr * 2 * math.pi / 1.6)
    v -= 7 * np.clip(1 - (r - rr) / 9, 0, 1) * np.clip(-yy / r, 0, 1)
    rgb = np.stack([v, v + 1, v + 2], -1)
    if rim:
        # 金属のふち（幅 3px、左上が明るい）
        ang = np.degrees(np.arctan2(xx, -yy))
        lit = np.cos(np.radians(ang - 315))
        band = np.clip(1 - np.abs(rr - (r - 3)) / 3.2, 0, 1)
        notch = (np.abs(((ang + 7.5) % 15) - 7.5) < 1.6) & (rr > r - 6)
        rgb += (band * (60 + 46 * lit) * np.where(notch, 0.25, 1.0))[..., None]
        rgb -= (np.exp(-((rr - (r - 6.8)) / 0.8) ** 2) * 14)[..., None]
    a = np.clip((r + 1 - rr) * S, 0, 1) * 255
    img = Image.fromarray(np.concatenate([np.clip(rgb, 0, 255), a[..., None]], -1).astype(np.uint8), 'RGBA')
    bg.alpha_composite(img, (int((cx - r - 4) * S), int((cy - r - 4) * S)))


def draw_window(bg):
    x, y, w, h = WIN
    layer = canvas(W)
    d = ImageDraw.Draw(layer)
    d.polygon(sp(chamfer(x - 6, y - 6, w + 12, h + 12, 14)), fill=(30, 31, 34, 255))
    d.polygon(sp(chamfer(x - 4.5, y - 4.5, w + 9, h + 9, 12.5)), fill=(92, 96, 100, 255))
    d.polygon(sp(chamfer(x - 3, y - 3, w + 6, h + 6, 11.5)), fill=(52, 54, 58, 255))
    d.polygon(sp(chamfer(x - 1.2, y - 1.2, w + 2.4, h + 2.4, 10.5)), fill=(5, 5, 6, 255))
    d.polygon(sp(chamfer(x, y, w, h, 10)), fill=WIN_BG)
    drop_shadow(bg, layer, off=2, blur=2)
    bg.alpha_composite(layer)
    sh = canvas(W)
    ImageDraw.Draw(sh).polygon(sp(chamfer(x, y, w, 10, 4)), fill=(0, 0, 0, 170))
    bg.alpha_composite(sh.filter(ImageFilter.GaussianBlur(1.8 * S)))
    t = canvas(W)
    D = L['win']
    text_at(t, ':', D['colon_x'], D['time_y'] + D['time_h'] / 2 - 1, 34, TEXT, weight=700)
    text_at(t, '/', D['slash_x'], D['date_y'] + D['date_h'] / 2, 19, TEXT_DIM, weight=400)
    bg.alpha_composite(t)


def battery_icon(layer, cx, cy, col):
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle(sp([(cx - 8, cy - 5), (cx + 6, cy + 5)]), radius=1.6 * S, outline=col, width=int(1.4 * S))
    d.rectangle(sp([(cx + 6.6, cy - 2), (cx + 8.4, cy + 2)]), fill=col)
    d.rectangle(sp([(cx - 5.6, cy - 2.6), (cx + 1, cy + 2.6)]), fill=col)


def draw_subdials(bg):
    recess(bg, *WEEK_C, WEEK_R)
    recess(bg, *BAT_C, BAT_R)
    layer = canvas(W)
    d = ImageDraw.Draw(layer)
    cx, cy = BAT_C
    for k in range(20):
        d.arc(sp([(cx - BAT_RING, cy - BAT_RING), (cx + BAT_RING, cy + BAT_RING)]), start=-90 + k * 18 + 1.6, end=-90 + (k + 1) * 18 - 1.6, fill=TRACK, width=int(7 * S))
    battery_icon(layer, cx, cy - 14, TEXT_DIM)
    bg.alpha_composite(layer)


def draw_print(bg):
    layer = canvas(W)
    text_at(layer, 'BALANCE 3 Ti', 240, 124, 19, TEXT, weight=700, spacing=1.6)
    text_at(layer, 'SHOCK RESIST', 240, 144, 9.5, ORANGE, weight=700, spacing=2.2)
    bg.alpha_composite(layer)


def build_background():
    bg = base_layer()
    draw_honeycomb(bg)
    draw_panel_lines(bg)
    draw_ring_marks(bg)
    draw_guards(bg)
    draw_subdials(bg)
    draw_indices(bg)
    draw_window(bg)
    draw_print(bg)
    full = Image.new('RGBA', (W * S, W * S), (0, 0, 0, 255))
    full.alpha_composite(bg)
    out = shrink(full).convert('RGB')
    L['bg'] = save(out, 'bg.png')
    return out


# ---------------------------------------------------------------- 数字・曜日・電池

def digit_cells(name, size, weight, color, cell_w=None):
    f = font(weight, size * S)
    imgs = [text_img(str(i), f, color) for i in range(10)]
    cw = cell_w or max(i.width for i in imgs) / S + 1
    ch = max(i.height for i in imgs) / S + 1
    paths = []
    for i, t in enumerate(imgs):
        cell = Image.new('RGBA', (int(math.ceil(cw * S)), int(math.ceil(ch * S))), (0, 0, 0, 0))
        cell.alpha_composite(t, ((cell.width - t.width) // 2, cell.height - t.height))
        paths.append(save(shrink(cell), f'{name}/{i}.png'))
    return paths, int(math.ceil(cw)), int(math.ceil(ch))


def win_layout():
    x, y, w, h = WIN
    big, bw, bh = digit_cells('win/time', 42, 700, TEXT)
    small, sw, shh = digit_cells('win/date', 21, 500, TEXT)
    aod, _, _ = digit_cells('win/time_aod', 42, 700, (150, 154, 156, 255))
    date_aod, _, _ = digit_cells('win/date_aod', 21, 500, (120, 124, 126, 255))
    colon_w = 9
    total = bw * 4 + colon_w
    tx = int(x + (w - total) / 2)
    ty = int(y + 9)
    slash_w = 14
    dtotal = sw * 4 + slash_w
    dx = int(x + (w - dtotal) / 2)
    dy = int(y + h - shh - 9)
    L['win'] = dict(time=big, time_aod=aod, date=small, date_aod=date_aod, time_x=tx, min_x=tx + bw * 2 + colon_w, time_y=ty, time_h=bh,
                    colon_x=tx + bw * 2 + colon_w / 2, digit_w=bw, date_x=dx, day_x=dx + sw * 2 + slash_w, date_y=dy, date_h=shh,
                    slash_x=dx + sw * 2 + slash_w / 2, date_w=sw)


def week_frames():
    """曜日: 大きな曜日名と、M T W T F S S の行（今日だけオレンジ＋下線）。IMG_WEEK は月曜始まり"""
    names = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
    letters = 'MTWTFSS'
    bw, bh = 116, 74
    paths = []
    fb = font(700, 32 * S)
    fs = font(600, 12.5 * S)
    for i, nm in enumerate(names):
        img = canvas(bw, bh)
        t = text_img(nm, fb, TEXT, spacing=1.2)
        img.alpha_composite(t, ((img.width - t.width) // 2, int(6 * S)))
        step = 14
        x0 = bw / 2 - step * 3
        for k, ch in enumerate(letters):
            col = ORANGE if k == i else TEXT_DIM
            g = text_img(ch, fs, col)
            img.alpha_composite(g, (int((x0 + k * step) * S - g.width / 2), int(49 * S)))
            if k == i:
                ImageDraw.Draw(img).rectangle(sp([(x0 + k * step - 5.5, 66), (x0 + k * step + 5.5, 68)]), fill=ORANGE)
        paths.append(save(shrink(img), f'week/{i}.png'))
    cx, cy = WEEK_C
    return dict(x=int(cx - bw / 2), y=int(cy - bh / 2), src=paths)


def battery_frames():
    cx, cy = BAT_C
    r = BAT_RING
    box = 2 * (r + 4)
    paths = []
    for i in range(21):
        img = canvas(box)
        d = ImageDraw.Draw(img)
        c = r + 4
        for k in range(i):
            d.arc(sp([(c - r, c - r), (c + r, c + r)]), start=-90 + k * 18 + 1.6, end=-90 + (k + 1) * 18 - 1.6, fill=ORANGE, width=int(7 * S))
        paths.append(save(shrink(img), f'bat/{i}.png'))
    pct, pw, ph = digit_cells('bat/num', 19, 700, TEXT)
    f = font(500, 12 * S)
    unit = text_img('%', f, TEXT)
    ucell = Image.new('RGBA', (unit.width + 2 * S, int(ph * S)), (0, 0, 0, 0))
    ucell.alpha_composite(unit, (2 * S, int(ph * S) - unit.height - int(1.5 * S)))
    upath = save(shrink(ucell), 'bat/pct.png')
    return dict(x=int(cx - r - 4), y=int(cy - r - 4), src=paths, num=pct, unit=upath, num_x=int(cx - 34), num_y=int(cy - 1), num_w=68, num_h=ph)


# ---------------------------------------------------------------- スケルトン針

def profile_poly(prof, shrink_by=0.0, y0=None, y1=None):
    """(y, 半幅) の折れ線から左右対称の多角形。shrink_by で内側にずらし、y0〜y1（y0 が中心寄り）の範囲だけにする"""
    def hw(y):
        for (ya, wa), (yb, wb) in zip(prof, prof[1:]):
            if yb <= y <= ya:
                return wa + (wb - wa) * (ya - y) / (ya - yb)
        return 0.0
    top, bot = prof[-1][0], prof[0][0]
    a_, b_ = (bot, top) if y0 is None else (y0, y1)
    ys = [a_ + (b_ - a_) * k / 60 for k in range(61)] + [y for y, _ in prof if b_ < y < a_]
    ys = sorted(set(ys), reverse=True)
    pts = [(y, max(0.0, hw(y) - shrink_by)) for y in ys]
    return [(w, y) for y, w in pts] + [(-w, y) for y, w in reversed(pts)]


def skeleton_hand(name, length, hw, aod=False):
    tipl = 22
    prof = [(14, hw * 0.45), (0, hw * 0.75), (-12, hw * 0.85), (-length + tipl, hw), (-length, 0)]
    pad = 4
    w = int(2 * hw + pad * 2)
    h = int(length + 14 + pad * 2)
    ox, oy = w / 2, length + pad
    img = canvas(w, h)
    d = ImageDraw.Draw(img)
    tr = lambda poly: sp([(ox + x, oy + y) for x, y in poly])
    outer = profile_poly(prof)
    lume_from = -length * 0.5
    if aod:
        d.line(tr(outer + [outer[0]]), fill=AOD_LINE, width=int(1.8 * S), joint='curve')
        tip = profile_poly(prof, 2.2, -length + tipl, -length + 4)
        d.polygon(tr(tip), fill=AOD_ORANGE)
    else:
        d.polygon(tr(outer), fill=METAL)
        # 中抜き（中心寄り）
        hole = profile_poly(prof, 4.4, -18, lume_from + 5)
        m = Image.new('L', img.size, 0)
        ImageDraw.Draw(m).polygon(tr(hole), fill=255)
        a = np.asarray(img.getchannel('A'), np.int16) - np.asarray(m, np.int16)
        img.putalpha(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)))
        d = ImageDraw.Draw(img)
        # 夜光（外側半分）とオレンジの先端
        d.polygon(tr(profile_poly(prof, 3.8, lume_from, -length + tipl + 2.5)), fill=LUME)
        d.polygon(tr(profile_poly(prof, 3.6, -length + tipl - 1, -length + 5.5)), fill=ORANGE)
        # 片側だけ明るい縁で金属らしく
        d.line(tr([(x, y) for x, y in outer[:len(outer) // 2]]), fill=METAL_HI, width=int(0.8 * S))
        d.ellipse(tr([(-hw * 0.85, -hw * 0.85), (hw * 0.85, hw * 0.85)]), fill=METAL)
    path = save(shrink(img), f'hands/{name}{"_aod" if aod else ""}.png')
    return dict(path=path, pos_x=int(round(ox)), pos_y=int(round(oy)))


def second_image():
    length, tail = 208, 44
    w, h = 18, length + tail + 8
    ox, oy = w / 2, length + 4
    img = canvas(w, h)
    d = ImageDraw.Draw(img)
    d.polygon(sp([(ox - 1.5, oy + tail), (ox + 1.5, oy + tail), (ox + 1.0, oy - length + 8), (ox, oy - length), (ox - 1.0, oy - length + 8)]), fill=ORANGE)
    d.rounded_rectangle(sp([(ox - 3, oy + 16), (ox + 3, oy + tail)]), radius=1.5 * S, fill=ORANGE)
    path = save(shrink(img), 'hands/second.png')
    return dict(path=path, pos_x=int(round(ox)), pos_y=int(round(oy)))


def cap_image(aod=False):
    r = 12
    img = canvas(2 * r)
    d = ImageDraw.Draw(img)
    d.ellipse(sp([(0.5, 0.5), (2 * r - 0.5, 2 * r - 0.5)]), fill=(24, 25, 27, 255))
    d.ellipse(sp([(2.5, 2.5), (2 * r - 2.5, 2 * r - 2.5)]), outline=AOD_ORANGE if aod else ORANGE, width=int(2.6 * S))
    d.ellipse(sp([(r - 2.4, r - 2.4), (r + 2.4, r + 2.4)]), fill=(150, 154, 158, 255) if not aod else (70, 72, 76, 255))
    path = save(shrink(img), f'hands/cap{"_aod" if aod else ""}.png')
    return dict(path=path, x=int(C - r), y=int(C - r))


# ---------------------------------------------------------------- 常時表示（AOD）

def build_aod():
    img = Image.new('RGBA', (W * S, W * S), (0, 0, 0, 255))
    layer = canvas(W)
    d = ImageDraw.Draw(layer)
    for deg, big in index_list():
        d.polygon(sp(radial_bar(IDX_R1, IDX_R2, deg, 17 if big else 14)), outline=AOD_DIM, width=int(1.5 * S))
        if big:
            d.polygon(sp(radial_bar(IDX_R1 + (IDX_R2 - IDX_R1) * 0.45, IDX_R2 - 4, deg, 9)), fill=AOD_ORANGE)
    x, y, w, h = WIN
    d.polygon(sp(chamfer(x - 1.4, y - 1.4, w + 2.8, h + 2.8, 10.5)), outline=AOD_DIM, width=int(1.4 * S))
    img.alpha_composite(layer)
    D = L['win']
    t = canvas(W)
    text_at(t, ':', D['colon_x'], D['time_y'] + D['time_h'] / 2 - 1, 34, (150, 154, 156, 255), weight=700)
    text_at(t, '/', D['slash_x'], D['date_y'] + D['date_h'] / 2, 19, (90, 94, 96, 255), weight=400)
    img.alpha_composite(t)
    L['aod_bg'] = save(shrink(img).convert('RGB'), 'aod_bg.png')


# ---------------------------------------------------------------- 書き出し

def preview(bg, hh=10, mm=8, ss=36, wday=6, month=10, day=18, bat=72):
    mask = Image.new('L', (W, W), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, W - 1, W - 1), fill=255)

    def open_(path):
        return Image.open(os.path.join(ROOT, 'assets', 'balance3', path)).convert('RGBA')

    def digits(img, arr, x, y, s, step):
        for i, ch in enumerate(s):
            img.alpha_composite(open_(arr[int(ch)]), (x + i * step, y))

    def hand(img, info, deg, shadow=True):
        h = open_(info['path'])
        big = Image.new('RGBA', (W, W), (0, 0, 0, 0))
        big.alpha_composite(h, (int(C - info['pos_x']), int(C - info['pos_y'])))
        big = big.rotate(-deg, resample=Image.BICUBIC, center=(C, C))
        if shadow:
            sh = Image.new('RGBA', (W, W), (0, 0, 0, 255))
            sh.putalpha(big.getchannel('A').filter(ImageFilter.GaussianBlur(3)).point(lambda v: int(v * 0.8)))
            img.alpha_composite(sh, (3, 5))
        img.alpha_composite(big)

    D = L['win']
    hh24 = hh + 6  # プレビューは 16:37 風に
    img = bg.convert('RGBA')
    img.alpha_composite(open_(L['week']['src'][(wday + 6) % 7]), (L['week']['x'], L['week']['y']))
    digits(img, D['time'], D['time_x'], D['time_y'], f'{hh24:02d}', D['digit_w'])
    digits(img, D['time'], D['min_x'], D['time_y'], f'{mm:02d}', D['digit_w'])
    digits(img, D['date'], D['date_x'], D['date_y'], f'{month:02d}', D['date_w'])
    digits(img, D['date'], D['day_x'], D['date_y'], f'{day:02d}', D['date_w'])
    B = L['bat']
    img.alpha_composite(open_(B['src'][round(bat / 5)]), (B['x'], B['y']))
    nw = open_(B['num'][0]).width
    u = open_(B['unit'])
    total = nw * len(str(bat)) + u.width
    x0 = B['num_x'] + (B['num_w'] - total) // 2
    digits(img, B['num'], x0, B['num_y'], str(bat), nw)
    img.alpha_composite(u, (x0 + nw * len(str(bat)), B['num_y']))
    hand(img, L['hour'], (hh % 12) * 30 + mm * 0.5)
    hand(img, L['minute'], mm * 6 + ss * 0.1)
    hand(img, L['second'], ss * 6)
    img.alpha_composite(open_(L['cap']['path']), (L['cap']['x'], L['cap']['y']))
    out = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    out.save(os.path.join(ROOT, 'preview.png'))

    img = open_(L['aod_bg'])
    digits(img, D['time_aod'], D['time_x'], D['time_y'], f'{hh24:02d}', D['digit_w'])
    digits(img, D['time_aod'], D['min_x'], D['time_y'], f'{mm:02d}', D['digit_w'])
    digits(img, D['date_aod'], D['date_x'], D['date_y'], f'{month:02d}', D['date_w'])
    digits(img, D['date_aod'], D['day_x'], D['date_y'], f'{day:02d}', D['date_w'])
    hand(img, L['hour_aod'], (hh % 12) * 30 + mm * 0.5, shadow=False)
    hand(img, L['minute_aod'], mm * 6, shadow=False)
    img.alpha_composite(open_(L['cap_aod']['path']), (L['cap']['x'], L['cap']['y']))
    out = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    out.save(os.path.join(ROOT, 'preview_aod.png'))


def main():
    import shutil
    shutil.rmtree(IMG_DIR, ignore_errors=True)
    win_layout()
    bg = build_background()
    L['week'] = week_frames()
    L['bat'] = battery_frames()
    L['hour'] = skeleton_hand('hour', 122, 15)
    L['minute'] = skeleton_hand('minute', 188, 12)
    L['second'] = second_image()
    L['cap'] = cap_image()
    L['hour_aod'] = skeleton_hand('hour', 122, 15, aod=True)
    L['minute_aod'] = skeleton_hand('minute', 188, 12, aod=True)
    L['cap_aod'] = cap_image(aod=True)
    build_aod()
    preview(bg)
    L['icon'] = save(Image.open(os.path.join(ROOT, 'preview.png')).convert('RGBA').resize((124, 124), Image.LANCZOS), 'icon.png')
    with open(os.path.join(ROOT, 'watchface', 'layout.js'), 'w') as f:
        f.write('// tools/gen.py が作るファイル（手で編集しない）\nexport const L = ' + json.dumps(L, ensure_ascii=False, indent=1) + '\n')


if __name__ == '__main__':
    main()
