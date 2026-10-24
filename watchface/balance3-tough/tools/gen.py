"""TOUGH Ti: G-SHOCK（GA-2100）風の真っ黒なアナデジ文字盤の画像と watchface/layout.js を作る。

    python3 tools/gen.py

八角形のベゼル、立体の黒いインデックス、9 時の曜日サブダイヤル、4 時の液晶窓（デジタル時刻・日付・電池）。
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

# 黒とグレーだけ
BLOCK = (22, 23, 25, 255)  # インデックスの本体
BLOCK_HI = (104, 108, 112, 255)  # インデックスの光る面
BLOCK_LO = (3, 3, 4, 255)
PRINT = (88, 92, 96, 255)  # 文字盤の印刷
ENGRAVE = (11, 11, 12, 255)  # ベゼルの彫り込み（地より暗い）
LCD_BG = (9, 10, 11, 255)
LCD_ON = (182, 186, 182, 255)
LCD_OFF = (22, 24, 25, 255)
LUME = (212, 216, 210, 255)
HAND = (26, 27, 29, 255)
HAND_EDGE = (120, 124, 128, 255)
WHITE = (224, 226, 226, 255)
GREY = (118, 122, 126, 255)
AOD_LINE = (112, 116, 120, 255)
AOD_DIM = (66, 68, 72, 255)
AOD_LCD = (150, 154, 150, 255)
CYAN, CYAN_HI, CYAN_LO = BLOCK, BLOCK_HI, BLOCK_LO  # applied() の既定色

OCT_A = 233  # 八角形ベゼルの外側（中心から辺までの距離）。円に近く、辺はうっすら見える程度
R_OPEN = 190  # ベゼルの内側（ガラスの縁）
R_DIAL = 160  # 文字盤（その外は歯車のような溝の見返し）
IDX_R1, IDX_R2 = 122, 178  # インデックスの内側・外側（見返しの上まで伸びる）

SUB_R = 38
SUB = {'week': (156, 244)}  # 曜日のサブダイヤル（9 時）
LCD = (248, 252, 118, 64)  # 液晶窓 x, y, w, h（左上を斜めに落とす）
LCD_K = 20

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

def side_index(xx, yy):
    """八角形の 8 辺のうち、その点がいちばん外側にある辺の番号と、その辺までの距離"""
    proj = np.stack([xx * math.sin(math.radians(k * 45)) - yy * math.cos(math.radians(k * 45)) for k in range(8)])
    return proj.argmax(0), proj.max(0)


def base_layer():
    n = W * S
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    xx = (xx + 0.5) / S - C
    yy = (yy + 0.5) / S - C
    r = np.hypot(xx, yy)
    ang = (np.degrees(np.arctan2(xx, -yy)) + 360) % 360
    side, od = side_index(xx, yy)
    rng = np.random.default_rng(11)
    light = np.cos(np.radians(ang - 315))

    # 八角形の外: ケースの側面（さらに暗い）
    case = 17 + 3 * light
    # ベゼル: 樹脂のマット。辺ごとに光の当たり方が違う面
    facet = 23 + 1.5 * np.cos(np.radians(side * 45 - 315))
    t = np.clip((od - R_OPEN) / (OCT_A - R_OPEN), 0, 1)
    bez = facet + 4 * np.sin(np.clip(t, 0, 1) * math.pi)
    # 見返し: 内へ下がる斜面
    tf = np.clip((r - R_DIAL) / (R_OPEN - R_DIAL), 0, 1)
    fl = 11 + 9 * tf + 2 * light
    # 文字盤: マットな黒
    td = np.clip(r / R_DIAL, 0, 1)
    dv = 19 - 6 * td ** 2 + 1.2 * light
    noise = rng.normal(0, 1.0, (n, n)).astype(np.float32)

    v = np.where(od > OCT_A, case, np.where(r >= R_OPEN, bez, np.where(r >= R_DIAL, fl, dv))) + noise
    rgb = np.stack([v, v + 1, v + 2], -1)
    # 段差: ベゼル外周のふち（明るい線）、ガラスの縁（影）、文字盤の縁
    rgb += (6 * np.exp(-((od - (OCT_A - 1.5)) / 1.1) ** 2) * (0.6 + 0.4 * light))[..., None]
    rgb -= (5 * np.exp(-((od - (OCT_A + 1.5)) / 1.2) ** 2))[..., None]
    rgb -= (14 * np.exp(-((r - R_OPEN) / 1.0) ** 2))[..., None]
    rgb += (6 * np.exp(-((r - (R_OPEN + 2.2)) / 0.8) ** 2) * (0.5 - 0.5 * light))[..., None]
    rgb -= (8 * np.exp(-((r - R_DIAL) / 0.9) ** 2))[..., None]
    alpha = np.clip((240 - r) * S, 0, 1) * 255
    return Image.fromarray(np.concatenate([np.clip(rgb, 0, 255), alpha[..., None]], -1).astype(np.uint8), 'RGBA')


def side_text(layer, s, side_deg, size, fill, weight=700, spacing=1.6, dist=211):
    """八角形の辺に沿ったまっすぐな文字（下半分は読める向きに）"""
    rot = side_deg + 180 if 90 < side_deg < 270 else side_deg
    text_at(layer, s, *polar(dist, side_deg), size, fill, weight=weight, spacing=spacing, rot=rot)


def draw_bezel(bg):
    def words(layer, fill):
        side_text(layer, 'TOUGH Ti', 315, 17, fill, spacing=1.8)
        side_text(layer, 'LIGHT', 45, 12, fill)
        side_text(layer, 'START', 90, 12, fill)
        side_text(layer, 'PROTECTION', 180, 13, fill, spacing=2.0)
        side_text(layer, 'MODE', 225, 12, fill)
        side_text(layer, 'ADJUST', 270, 12, fill)
    engraved(bg, words)


def draw_rehaut(bg):
    """見返し: 歯車のように並んだ細い溝。光の向きで明るさが変わる"""
    layer = canvas(W)
    d = ImageDraw.Draw(layer)
    for i in range(120):
        deg = i * 3
        lit = max(0.0, math.cos(math.radians(deg - 315)))
        v = int(30 + 34 * lit)
        d.polygon(sp(radial_bar(R_DIAL + 1, R_OPEN - 2, deg, 1.3)), fill=(v, v + 1, v + 3, 255))
        sh = int(6 + 4 * (1 - lit))
        a_ = deg + 1.1
        d.polygon(sp(radial_bar(R_DIAL + 1, R_OPEN - 2, a_, 0.9)), fill=(sh, sh, sh + 1, 255))
    bg.alpha_composite(layer)
    # 見返しの内側（文字盤との境）に落ちる影
    sh = canvas(W)
    ImageDraw.Draw(sh).ellipse(sp([(C - R_DIAL - 3, C - R_DIAL - 3), (C + R_DIAL + 3, C + R_DIAL + 3)]), outline=(0, 0, 0, 200), width=int(3 * S))
    bg.alpha_composite(sh.filter(ImageFilter.GaussianBlur(1.5 * S)))


def index_blocks():
    """インデックスの一覧: (角度, 内側の幅, 外側の幅, 中心をずらす量)。12 時は 2 本、3 時は液晶窓があるので無し"""
    out = []
    for h in range(12):
        if h == 0:
            out += [(0, 8, 10, -6.5), (0, 8, 10, 6.5)]
        elif h != 3:
            out.append((h * 30, 10, 15, 0))
    return out


def block_poly(deg, w1, w2, off, r1=IDX_R1, r2=IDX_R2):
    a = math.radians(deg)
    dx, dy = math.sin(a), -math.cos(a)
    nx, ny = math.cos(a), math.sin(a)
    pts = [(C + dx * r1 + nx * w1 / 2, C + dy * r1 + ny * w1 / 2), (C + dx * r2 + nx * w2 / 2, C + dy * r2 + ny * w2 / 2),
           (C + dx * r2 - nx * w2 / 2, C + dy * r2 - ny * w2 / 2), (C + dx * r1 - nx * w1 / 2, C + dy * r1 - ny * w1 / 2)]
    return [(x + nx * off, y + ny * off) for x, y in pts]


def draw_indices(bg):
    """立体の黒いインデックス（上が平らな台形のブロック）。左上の縁が光り、右下に影が落ちる"""
    m = mask_of(lambda d: [d.polygon(sp(block_poly(*b)), fill=255) for b in index_blocks()])
    body = Image.new('RGBA', m.size, (0, 0, 0, 255))
    body.putalpha(m)
    drop_shadow(bg, body, off=3.2, blur=2.6, alpha=1.0)
    # 側面: 光の側（左上）に明るい縁、反対側に暗い縁
    hi = Image.new('RGBA', m.size, (96, 100, 104, 255))
    hi.putalpha(m)
    bg.alpha_composite(hi, (int(-1.3 * S), int(-1.3 * S)))
    lo = Image.new('RGBA', m.size, (6, 6, 7, 255))
    lo.putalpha(m)
    bg.alpha_composite(lo, (int(1.0 * S), int(1.0 * S)))
    # 上面: ほぼ黒。外側ほどわずかに明るい
    n = W * S
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    r = np.hypot((xx + 0.5) / S - C, (yy + 0.5) / S - C)
    v = 22 + 10 * np.clip((r - IDX_R1) / (IDX_R2 - IDX_R1), 0, 1)
    top = np.stack([v, v + 1, v + 3, np.asarray(m, np.float32)], -1).astype(np.uint8)
    bg.alpha_composite(Image.fromarray(top, 'RGBA'))


def subdial_layer(cx, cy, r):
    """くぼんだサブダイヤル: 同心円の溝、上側の内影、下側のふちのハイライト"""
    n = int(2 * (r + 4) * S)
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    xx = (xx + 0.5) / S - (r + 4)
    yy = (yy + 0.5) / S - (r + 4)
    rr = np.hypot(xx, yy)
    v = 14 + 1.6 * np.sin(rr * 2 * math.pi / 1.5)
    v -= 6 * np.clip(1 - (r - rr) / 8, 0, 1) * np.clip(-yy / r, 0, 1)
    rgb = np.stack([v, v + 1, v + 2], -1)
    rgb += (np.exp(-((rr - r) / 0.8) ** 2) * np.clip(yy / r, 0, 1) * 50)[..., None]
    a = np.clip((r + 0.6 - rr) * S, 0, 1) * 255
    img = Image.fromarray(np.concatenate([np.clip(rgb, 0, 255), a[..., None]], -1).astype(np.uint8), 'RGBA')
    return img, (int((cx - r - 4) * S), int((cy - r - 4) * S))


def draw_subdial(bg):
    cx, cy = SUB['week']
    img, pos = subdial_layer(cx, cy, SUB_R)
    bg.alpha_composite(img, pos)
    layer = canvas(W)
    d = ImageDraw.Draw(layer)
    for i, s in enumerate(['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']):
        deg = i * 360 / 7
        text_at(layer, s, *polar(SUB_R - 12, deg, cx, cy), 7.5, (150, 154, 158, 255) if i else WHITE, weight=700)
        d.polygon(sp(radial_bar(SUB_R - 4, SUB_R - 1.2, deg, 1.4, cx, cy)), fill=GREY)
    bg.alpha_composite(layer)


def lcd_shape(x, y, w, h, k=10):
    """左上の角を大きく斜めに落とした窓"""
    return [(x + k * 1.6, y), (x + w, y), (x + w, y + h), (x, y + h), (x, y + k)]


def draw_lcd(bg):
    x, y, w, h = LCD
    layer = canvas(W)
    d = ImageDraw.Draw(layer)
    d.polygon(sp(lcd_shape(x - 3, y - 3, w + 6, h + 6, LCD_K + 2)), fill=(40, 42, 45, 255))  # 枠
    d.polygon(sp(lcd_shape(x - 1.4, y - 1.4, w + 2.8, h + 2.8, LCD_K + 1)), fill=(5, 5, 6, 255))
    d.polygon(sp(lcd_shape(x, y, w, h, LCD_K)), fill=LCD_BG)
    drop_shadow(bg, layer, off=-1.2, blur=1.5, alpha=0.6)
    bg.alpha_composite(layer)
    # 窓の上側の内影
    sh = canvas(W)
    ImageDraw.Draw(sh).polygon(sp(lcd_shape(x, y, w, 7, 7)), fill=(0, 0, 0, 160))
    bg.alpha_composite(sh.filter(ImageFilter.GaussianBlur(1.6 * S)))
    # 液晶の中の小さな文字とコロン
    t = canvas(W)
    text_at(t, 'BAT', L['lcd']['bat_x'] - 9, y + 11, 6, (70, 74, 76, 255), weight=700, spacing=0.4)
    dd = ImageDraw.Draw(t)
    cxl = L['lcd']['colon_x']
    ty = L['lcd']['time_y']
    for yy in (ty + 10, ty + 21):
        dd.rectangle(sp([(cxl - 1.6, yy - 1.6), (cxl + 1.6, yy + 1.6)]), fill=LCD_ON)
    bg.alpha_composite(t)


def draw_dial_print(bg):
    layer = canvas(W)
    text_at(layer, 'TOUGH Ti', 246, 174, 14, (112, 116, 120, 255), weight=700, spacing=1.2)
    text_at(layer, 'SHOCK RESIST', 246, 191, 8, PRINT, weight=600, spacing=1.4)
    x, y, w, h = LCD
    text_at(layer, 'WR20BAR', x + w - 24, y - 9, 7.5, PRINT, weight=600, spacing=0.6)
    bg.alpha_composite(layer)


def build_background():
    bg = base_layer()
    draw_bezel(bg)
    draw_rehaut(bg)
    draw_subdial(bg)
    draw_indices(bg)
    draw_lcd(bg)
    draw_dial_print(bg)
    full = Image.new('RGBA', (W * S, W * S), (0, 0, 0, 255))
    full.alpha_composite(bg)
    out = shrink(full).convert('RGB')
    L['bg'] = save(out, 'bg.png')
    return out


# ---------------------------------------------------------------- 液晶の数字（7 セグメント。消えている部分もうっすら見える）

SEGS = {0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg'}


def seg_polys(w, h, t, g=0.7):
    def hbar(x0, x1, yc):
        x0 += g
        x1 -= g
        return [(x0, yc), (x0 + t / 2, yc - t / 2), (x1 - t / 2, yc - t / 2), (x1, yc), (x1 - t / 2, yc + t / 2), (x0 + t / 2, yc + t / 2)]

    def vbar(xc, y0, y1):
        y0 += g
        y1 -= g
        return [(xc, y0), (xc + t / 2, y0 + t / 2), (xc + t / 2, y1 - t / 2), (xc, y1), (xc - t / 2, y1 - t / 2), (xc - t / 2, y0 + t / 2)]

    hx0, hx1 = t / 2, w - t / 2
    top, mid, bot = t / 2, h / 2, h - t / 2
    return {
        'a': hbar(hx0, hx1, top), 'g': hbar(hx0, hx1, mid), 'd': hbar(hx0, hx1, bot),
        'f': vbar(hx0, top, mid), 'b': vbar(hx1, top, mid), 'e': vbar(hx0, mid, bot), 'c': vbar(hx1, mid, bot),
    }


def seg_digit(n, w, h, t, on, off, slant=0.1):
    pw = w + h * slant + 1
    img = Image.new('RGBA', (int(math.ceil(pw * S)), int(math.ceil((h + 1) * S))), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for k, poly in seg_polys(w, h, t).items():
        lit = n is not None and k in SEGS[n]
        if not lit and off is None:
            continue
        pts = [((x + (h - y) * slant + 0.5) * S, (y + 0.5) * S) for x, y in poly]
        d.polygon(pts, fill=on if lit else off)
    return img


def digit_set(name, w, h, t, on, off):
    return [save(shrink(seg_digit(i, w, h, t, on, off)), f'{name}/{i}.png') for i in range(10)]


BIG = (17, 32, 4.0)  # 液晶の大きい数字: 幅・高さ・線の太さ
SMALL = (8, 13, 2.0)


def lcd_layout():
    x, y, w, h = LCD
    big_w, big_h, _ = BIG
    gap = 3
    pw = big_w + int(big_h * 0.1) + 1  # 1 文字の画像の幅
    total = pw * 4 + gap * 2 + 9
    tx = int(x + w - total - 6)
    ty = y + h - big_h - 6
    sw = SMALL[0] + int(SMALL[1] * 0.1) + 1
    L['lcd'] = dict(time_x=tx, time_y=ty, min_x=tx + pw * 2 + gap + 9, colon_x=tx + pw * 2 + gap + 4, space=gap - (pw - big_w - int(big_h * 0.1) - 1),
                    day_x=x + 30, day_y=y + 5, bat_x=x + w - 6 - 3 * (sw + 1), bat_y=y + 5, bat_w=3 * (sw + 1), small_w=sw)


# ---------------------------------------------------------------- 針

def blade(length, width, tip, tail):
    """平たい刃の形の針（回転の中心が原点、上向き）"""
    return [(0, -length), (width / 2, -length + tip), (width / 2, tail), (-width / 2, tail), (-width / 2, -length + tip)]


def hand_image(name, length, width, tip, tail, aod=False, lume_from=0.5):
    pad = 4
    w = int(width + pad * 2)
    h = int(length + tail + pad * 2)
    ox, oy = w / 2, length + pad
    img = canvas(w, h)
    d = ImageDraw.Draw(img)
    outer = [(ox + x, oy + y) for x, y in blade(length, width, tip, tail)]
    if aod:
        d.polygon(sp(outer), fill=(0, 0, 0, 255))
        d.line(sp(outer + [outer[0]]), fill=AOD_LINE, width=int(2 * S), joint='curve')
    else:
        d.polygon(sp(outer), fill=HAND_EDGE)
        inner = [(ox + x, oy + y) for x, y in blade(length - 1.4, width - 2.6, tip - 0.6, tail - 1.4)]
        d.polygon(sp(inner), fill=HAND)
        # 夜光の帯
        lume = [(ox + x, oy + y) for x, y in blade(length - 6, width - 6, tip - 2, -length * lume_from)]
        d.polygon(sp(lume), fill=LUME)
        d.ellipse(sp([(ox - width / 2 - 1, oy - width / 2 - 1), (ox + width / 2 + 1, oy + width / 2 + 1)]), fill=HAND, outline=HAND_EDGE, width=int(1.3 * S))
    out = canvas(w, h)
    if not aod:
        drop_shadow(out, img, off=0, blur=0.01, alpha=0)
    out.alpha_composite(img)
    path = save(shrink(out), f'hands/{name}{"_aod" if aod else ""}.png')
    return dict(path=path, pos_x=int(round(ox)), pos_y=int(round(oy)))


def second_image():
    length, tail = 166, 38
    w, h = 16, length + tail + 8
    ox, oy = w / 2, length + 4
    img = canvas(w, h)
    d = ImageDraw.Draw(img)
    col = (150, 154, 158, 255)
    d.polygon(sp([(ox - 1.1, oy + tail), (ox + 1.1, oy + tail), (ox + 0.7, oy - length + 10), (ox, oy - length), (ox - 0.7, oy - length + 10)]), fill=col)
    d.rounded_rectangle(sp([(ox - 3, oy + 14), (ox + 3, oy + tail)]), radius=1.5 * S, fill=col)
    d.polygon(sp([(ox - 1.4, oy - length + 26), (ox + 1.4, oy - length + 26), (ox + 0.9, oy - length + 6), (ox - 0.9, oy - length + 6)]), fill=LUME)
    path = save(shrink(img), 'hands/second.png')
    return dict(path=path, pos_x=int(round(ox)), pos_y=int(round(oy)))


def cap_image(aod=False):
    r = 9
    img = canvas(2 * r)
    d = ImageDraw.Draw(img)
    d.ellipse(sp([(0.5, 0.5), (2 * r - 0.5, 2 * r - 0.5)]), fill=(18, 19, 20, 255), outline=AOD_LINE if aod else (96, 100, 104, 255), width=int(1.4 * S))
    d.ellipse(sp([(r - 3, r - 3), (r + 3, r + 3)]), fill=(120, 124, 128, 255) if not aod else (60, 62, 66, 255))
    path = save(shrink(img), f'hands/cap{"_aod" if aod else ""}.png')
    return dict(path=path, x=int(C - r), y=int(C - r))


def sub_hand_frames(key, angles):
    """サブダイヤルの針を角度ごとに描いたコマ（IMG_WEEK で差し替え）"""
    cx, cy = SUB[key]
    r = SUB_R
    box = 2 * r
    paths = []
    for i, deg in enumerate(angles):
        img = canvas(box)
        d = ImageDraw.Draw(img)
        c = r
        body = rotate_pts([(c - 1.6, c + 7), (c + 1.6, c + 7), (c + 0.9, c - (r - 18)), (c - 0.9, c - (r - 18))], deg, c, c)
        d.polygon(sp(body), fill=(200, 204, 200, 255))
        head = rotate_pts([(c - 1.9, c - (r - 18)), (c + 1.9, c - (r - 18)), (c, c - (r - 6))], deg, c, c)
        d.polygon(sp(head), fill=WHITE)
        d.ellipse(sp([(c - 3.6, c - 3.6), (c + 3.6, c + 3.6)]), fill=(40, 42, 45, 255), outline=(110, 114, 118, 255), width=int(1 * S))
        out = canvas(box)
        drop_shadow(out, img, off=1.2, blur=1.2, alpha=0.8)
        out.alpha_composite(img)
        paths.append(save(shrink(out), f'sub/{key}/{i}.png'))
    return dict(x=int(cx - r), y=int(cy - r), w=box, h=box, src=paths)


# ---------------------------------------------------------------- 常時表示（AOD）

def build_aod():
    img = Image.new('RGBA', (W * S, W * S), (0, 0, 0, 255))
    layer = canvas(W)
    d = ImageDraw.Draw(layer)
    for b in index_blocks():
        d.polygon(sp(block_poly(*b)), outline=AOD_DIM, width=int(1.5 * S))
    x, y, w, h = LCD
    d.polygon(sp(lcd_shape(x - 1.4, y - 1.4, w + 2.8, h + 2.8, LCD_K + 1)), outline=AOD_DIM, width=int(1.4 * S))
    cxl = L['lcd']['colon_x']
    ty = L['lcd']['time_y']
    for yy in (ty + 10, ty + 21):
        d.rectangle(sp([(cxl - 1.6, yy - 1.6), (cxl + 1.6, yy + 1.6)]), fill=AOD_LCD)
    img.alpha_composite(layer)
    L['aod_bg'] = save(shrink(img).convert('RGB'), 'aod_bg.png')


# ---------------------------------------------------------------- 書き出し

def preview(bg, hh=10, mm=8, ss=36, wday=5, day=24, bat=72):
    mask = Image.new('L', (W, W), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, W - 1, W - 1), fill=255)

    def open_(path):
        return Image.open(os.path.join(ROOT, 'assets', 'balance3', path)).convert('RGBA')

    def lcd_digits(img, big, small):
        lc = L['lcd']
        pw = open_(big[0]).width
        for i, ch in enumerate(f'{hh:02d}'):
            img.alpha_composite(open_(big[int(ch)]), (lc['time_x'] + i * (pw + lc['space']), lc['time_y']))
        for i, ch in enumerate(f'{mm:02d}'):
            img.alpha_composite(open_(big[int(ch)]), (lc['min_x'] + i * (pw + lc['space']), lc['time_y']))
        if small:
            sw = open_(small[0]).width
            for i, ch in enumerate(f'{day:02d}'):
                img.alpha_composite(open_(small[int(ch)]), (lc['day_x'] + i * (sw + 1), lc['day_y']))
            s = str(bat)
            for i, ch in enumerate(s):
                img.alpha_composite(open_(small[int(ch)]), (lc['bat_x'] + lc['bat_w'] - (len(s) - i) * (sw + 1), lc['bat_y']))

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

    img = bg.convert('RGBA')
    img.alpha_composite(open_(L['week']['src'][(wday + 6) % 7]), (L['week']['x'], L['week']['y']))
    lcd_digits(img, L['lcd']['big'], L['lcd']['small'])
    hand(img, L['hour'], (hh % 12) * 30 + mm * 0.5)
    hand(img, L['minute'], mm * 6 + ss * 0.1)
    hand(img, L['second'], ss * 6)
    img.alpha_composite(open_(L['cap']['path']), (L['cap']['x'], L['cap']['y']))
    out = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    out.save(os.path.join(ROOT, 'preview.png'))

    img = open_(L['aod_bg'])
    lcd_digits(img, L['lcd']['big_aod'], None)
    hand(img, L['hour_aod'], (hh % 12) * 30 + mm * 0.5, shadow=False)
    hand(img, L['minute_aod'], mm * 6, shadow=False)
    img.alpha_composite(open_(L['cap_aod']['path']), (L['cap']['x'], L['cap']['y']))
    out = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    out.save(os.path.join(ROOT, 'preview_aod.png'))


def main():
    import shutil
    shutil.rmtree(IMG_DIR, ignore_errors=True)
    lcd_layout()
    L['lcd']['big'] = digit_set('lcd/big', *BIG, LCD_ON, LCD_OFF)
    L['lcd']['small'] = digit_set('lcd/small', *SMALL, LCD_ON, LCD_OFF)
    L['lcd']['big_aod'] = digit_set('lcd/big_aod', *BIG, AOD_LCD, None)
    bg = build_background()
    L['hour'] = hand_image('hour', 96, 24, 14, 12, lume_from=0.55)
    L['minute'] = hand_image('minute', 150, 17, 22, 16, lume_from=0.45)
    L['second'] = second_image()
    L['cap'] = cap_image()
    L['hour_aod'] = hand_image('hour', 96, 24, 14, 12, aod=True)
    L['minute_aod'] = hand_image('minute', 150, 17, 22, 16, aod=True)
    L['cap_aod'] = cap_image(aod=True)
    # IMG_WEEK は月曜始まり。目盛りは 12 時が日曜で時計回り
    L['week'] = sub_hand_frames('week', [((i + 1) % 7) * 360 / 7 for i in range(7)])
    build_aod()
    preview(bg)
    L['icon'] = save(Image.open(os.path.join(ROOT, 'preview.png')).convert('RGBA').resize((124, 124), Image.LANCZOS), 'icon.png')
    with open(os.path.join(ROOT, 'watchface', 'layout.js'), 'w') as f:
        f.write('// tools/gen.py が作るファイル（手で編集しない）\nexport const L = ' + json.dumps(L, ensure_ascii=False, indent=1) + '\n')


if __name__ == '__main__':
    main()
