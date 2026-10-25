"""TOUGH Ti: GA-2100 と GW-B5600 を混ぜたアナデジ文字盤（真っ黒な樹脂 × 7 セグの液晶）の画像と watchface/layout.js を作る。

    python3 tools/gen.py

GA-2100 から: 歯車のような溝のリングに乗った立体の黒いインデックス、黒い刃に夜光の帯の針、9 時の小さなダイヤル（電池）。
GW-B5600 から: 反転液晶と 7 セグの数字（下に 時:分 と秒、上に曜日と 月-日）、PROTECTION の箱。秒針だけオレンジ。
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
WHITE = (228, 230, 230, 255)
GREY = (120, 124, 128, 255)
PRINT = (96, 100, 104, 255)
LCD_BG = (8, 9, 10, 255)
LCD_ON = (206, 210, 204, 255)
LCD_OFF = (24, 26, 27, 255)
LUME = (214, 218, 210, 255)
HAND = (26, 27, 29, 255)
HAND_EDGE = (128, 132, 136, 255)
AOD_LINE = (112, 116, 120, 255)
AOD_DIM = (60, 62, 66, 255)
AOD_LCD = (150, 154, 150, 255)
AOD_ORANGE = (160, 74, 16, 255)
ENGRAVE = (11, 11, 12, 255)
METAL, METAL_HI, METAL_LO = (120, 124, 128, 255), (180, 184, 188, 255), (40, 42, 45, 255)
CYAN, CYAN_HI, CYAN_LO = METAL, METAL_HI, METAL_LO  # applied() の既定色

# 時計本体に金属のベゼルがあるので、画面にはベゼルを描かず端まで使う
R_DIAL = 194  # 文字盤（外側 194〜240 は溝のリング）
IDX_R1, IDX_R2 = 130, 204  # インデックス（リングの上まで伸びる）
SKIP = (5, 7)  # 下の液晶があるので 5 時・7 時のインデックスは無し

TOP = (184, 134, 112, 26)  # 上の液晶: 曜日と 月-日
LCD = (146, 262, 188, 72)  # 下の液晶: 時:分 と秒
SUB_C = (152, 212)  # 9 時の小さなダイヤル（電池）
SUB_R = 31
SLANT = 0.12  # 液晶の文字の傾き

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
    """黒い樹脂の文字盤と、歯車のような溝のリング"""
    n = W * S
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    xx = (xx + 0.5) / S - C
    yy = (yy + 0.5) / S - C
    r = np.hypot(xx, yy)
    ang = (np.degrees(np.arctan2(xx, -yy)) + 360) % 360
    rng = np.random.default_rng(3)
    light = np.cos(np.radians(ang - 315))
    dial = 24 - 7 * np.clip(r / R_DIAL, 0, 1) ** 2 + 1.5 * light + rng.normal(0, 1.2, (n, n)).astype(np.float32)
    # リング: 3° ごとの溝。光の向きで明るさが変わる
    ph = (ang % 3) / 3
    rib = np.where(ph < 0.55, 25 + 20 * np.clip(light, 0, 1), 8)
    tr = np.clip((r - R_DIAL) / (240 - R_DIAL), 0, 1)
    ring = rib * (0.75 + 0.25 * tr)
    v = np.where(r >= R_DIAL, ring, dial)
    rgb = np.stack([v, v + 1, v + 2], -1)
    rgb -= (16 * np.exp(-((r - R_DIAL) / 1.2) ** 2))[..., None]
    rgb += (7 * np.exp(-((r - (R_DIAL - 2)) / 0.8) ** 2))[..., None]
    alpha = np.clip((240 - r) * S, 0, 1) * 255
    return Image.fromarray(np.concatenate([np.clip(rgb, 0, 255), alpha[..., None]], -1).astype(np.uint8), 'RGBA')


def ring_marks(bg):
    """リングの外側に 5 分ごとの明るい目盛り、12 時にオレンジの三角"""
    layer = canvas(W)
    d = ImageDraw.Draw(layer)
    for i in range(12):
        deg = i * 30
        if i == 0:
            d.polygon(sp([polar(238, -3.6), polar(238, 3.6), polar(222, 0)]), fill=ORANGE)
        else:
            d.polygon(sp(radial_bar(222, 238, deg, 2.6)), fill=(150, 154, 158, 255))
    bg.alpha_composite(layer)


def index_blocks():
    """(角度, 内側の幅, 外側の幅, 中心をずらす量)。12 時は 2 本"""
    out = []
    for h in range(12):
        if h == 0:
            out += [(0, 9, 12, -7.5), (0, 9, 12, 7.5)]
        elif h not in SKIP:
            out.append((h * 30, 12 if h % 3 else 15, 17 if h % 3 else 21, 0))
    return out


def block_poly(deg, w1, w2, off, r1=IDX_R1, r2=IDX_R2):
    a = math.radians(deg)
    dx, dy = math.sin(a), -math.cos(a)
    nx, ny = math.cos(a), math.sin(a)
    pts = [(C + dx * r1 + nx * w1 / 2, C + dy * r1 + ny * w1 / 2), (C + dx * r2 + nx * w2 / 2, C + dy * r2 + ny * w2 / 2),
           (C + dx * r2 - nx * w2 / 2, C + dy * r2 - ny * w2 / 2), (C + dx * r1 - nx * w1 / 2, C + dy * r1 - ny * w1 / 2)]
    return [(x + nx * off, y + ny * off) for x, y in pts]


def draw_indices(bg):
    """立体の黒いインデックス（上が平らな台形）。左上の縁が光り、右下に影。内側の端に夜光の点"""
    m = mask_of(lambda d: [d.polygon(sp(block_poly(*b)), fill=255) for b in index_blocks()])
    body = Image.new('RGBA', m.size, (0, 0, 0, 255))
    body.putalpha(m)
    drop_shadow(bg, body, off=3.4, blur=2.8, alpha=1.0)
    hi = Image.new('RGBA', m.size, (110, 114, 118, 255))
    hi.putalpha(m)
    bg.alpha_composite(hi, (int(-1.4 * S), int(-1.4 * S)))
    lo = Image.new('RGBA', m.size, (5, 5, 6, 255))
    lo.putalpha(m)
    bg.alpha_composite(lo, (int(1.0 * S), int(1.0 * S)))
    n = W * S
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    r = np.hypot((xx + 0.5) / S - C, (yy + 0.5) / S - C)
    v = 26 + 14 * np.clip((r - IDX_R1) / (IDX_R2 - IDX_R1), 0, 1)
    top = np.stack([v, v + 1, v + 3, np.asarray(m, np.float32)], -1).astype(np.uint8)
    bg.alpha_composite(Image.fromarray(top, 'RGBA'))
    layer = canvas(W)
    d = ImageDraw.Draw(layer)
    for deg, w1, w2, off in index_blocks():
        a = math.radians(deg)
        nx, ny = math.cos(a), math.sin(a)
        x, y = polar(IDX_R1 + 9, deg)
        x, y = x + nx * off, y + ny * off
        rr = 2.6 if w1 > 10 else 2.2
        d.ellipse(sp([(x - rr, y - rr), (x + rr, y + rr)]), fill=LUME)
    bg.alpha_composite(layer)


def chamfer(x, y, w, h, k):
    return [(x + k, y), (x + w - k, y), (x + w, y + k), (x + w, y + h - k), (x + w - k, y + h), (x + k, y + h), (x, y + h - k), (x, y + k)]


def lcd_window(bg, box, frame=7, k=10):
    """一段高い枠（上と左が明るい縁）に、くぼんだ反転液晶"""
    x, y, w, h = box
    layer = canvas(W)
    d = ImageDraw.Draw(layer)
    outer = chamfer(x - frame, y - frame, w + frame * 2, h + frame * 2, k)
    d.polygon(sp(outer), fill=(36, 37, 40, 255))
    drop_shadow(bg, layer, off=2.6, blur=2.6, alpha=1.0)
    bg.alpha_composite(layer)
    e = canvas(W)
    de = ImageDraw.Draw(e)
    de.line(sp([outer[7], outer[0], outer[1], outer[2]]), fill=(84, 86, 90, 255), width=int(1.2 * S))
    de.line(sp([outer[3], outer[4], outer[5], outer[6]]), fill=(10, 10, 11, 255), width=int(1.2 * S))
    de.rectangle(sp([(x - 1.4, y - 1.4), (x + w + 1.4, y + h + 1.4)]), fill=(6, 6, 7, 255))
    de.rectangle(sp([(x, y), (x + w, y + h)]), fill=LCD_BG)
    bg.alpha_composite(e)
    sh = canvas(W)
    ImageDraw.Draw(sh).rectangle(sp([(x, y), (x + w, y + 6)]), fill=(0, 0, 0, 170))
    bg.alpha_composite(sh.filter(ImageFilter.GaussianBlur(1.6 * S)))


def subdial(bg):
    """9 時のくぼんだ小さなダイヤル（電池）: 同心円の溝、刻み入りのふち、E〜F の目盛り"""
    cx, cy = SUB_C
    r = SUB_R
    n = int(2 * (r + 4) * S)
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    xx = (xx + 0.5) / S - (r + 4)
    yy = (yy + 0.5) / S - (r + 4)
    rr = np.hypot(xx, yy)
    ang = np.degrees(np.arctan2(xx, -yy))
    v = 13 + 1.4 * np.sin(rr * 2 * math.pi / 1.5)
    v -= 6 * np.clip(1 - (r - rr) / 8, 0, 1) * np.clip(-yy / r, 0, 1)
    rgb = np.stack([v, v + 1, v + 2], -1)
    lit = np.cos(np.radians(ang - 315))
    band = np.clip(1 - np.abs(rr - (r - 2.2)) / 2.4, 0, 1)
    rgb += (band * (40 + 34 * lit))[..., None]
    a = np.clip((r + 1 - rr) * S, 0, 1) * 255
    bg.alpha_composite(Image.fromarray(np.concatenate([np.clip(rgb, 0, 255), a[..., None]], -1).astype(np.uint8), 'RGBA'),
                       (int((cx - r - 4) * S), int((cy - r - 4) * S)))
    layer = canvas(W)
    d = ImageDraw.Draw(layer)
    for i in range(11):
        deg = -120 + i * 24
        big = i % 5 == 0
        col = ORANGE if i <= 1 else (WHITE if big else GREY)
        d.polygon(sp(radial_bar(r - (9 if big else 7), r - 4, deg, 1.8 if big else 1.1, cx, cy)), fill=col)
    text_at(layer, 'E', *polar(r - 16, -110, cx, cy), 8, ORANGE, weight=700)
    text_at(layer, 'F', *polar(r - 16, 110, cx, cy), 8, WHITE, weight=700)
    text_at(layer, 'BATT', cx, cy + 14, 6, PRINT, weight=700, spacing=0.6)
    bg.alpha_composite(layer)


def draw_print(bg):
    layer = canvas(W)
    d = ImageDraw.Draw(layer)
    text_at(layer, 'TOUGH Ti', 240, 186, 15, (186, 190, 194, 255), weight=700, spacing=1.2)
    d.rectangle(sp([(240 - 34, 199), (240 + 34, 211)]), outline=ORANGE, width=int(1.2 * S))
    text_at(layer, 'PROTECTION', 240, 205, 7.5, ORANGE, weight=700, spacing=0.9)
    x, y, w, h = LCD
    text_at(layer, 'WATER 20BAR RESIST', 240, y + h + 18, 7, PRINT, weight=600, spacing=0.8)
    bg.alpha_composite(layer)


def lcd_marks(bg, on, aod=False):
    """液晶の中の 時:分 のコロンと 月-日 のハイフン"""
    t = canvas(W)
    d = ImageDraw.Draw(t)
    D = L['lcd']
    for yy in (D['time_y'] + D['big_h'] * 0.32, D['time_y'] + D['big_h'] * 0.68):
        cx = D['colon_x'] + (D['time_y'] + D['big_h'] - yy) * SLANT
        d.rectangle(sp([(cx - 2.6, yy - 2.6), (cx + 2.6, yy + 2.6)]), fill=on)
    if not aod:
        hx, hy = D['dash_x'], D['date_y'] + D['small_h'] / 2
        d.polygon(sp([(hx - 3.5 + 1, hy - 1.2), (hx + 3.5 + 1, hy - 1.2), (hx + 3.5, hy + 1.2), (hx - 3.5, hy + 1.2)]), fill=on)
    bg.alpha_composite(t)


def build_background():
    lcd_layout()
    bg = base_layer()
    ring_marks(bg)
    subdial(bg)
    lcd_window(bg, TOP, frame=5, k=8)
    lcd_window(bg, LCD)
    draw_indices(bg)
    draw_print(bg)
    lcd_marks(bg, LCD_ON)
    full = Image.new('RGBA', (W * S, W * S), (0, 0, 0, 255))
    full.alpha_composite(bg)
    out = shrink(full).convert('RGB')
    L['bg'] = save(out, 'bg.png')
    return out


# ---------------------------------------------------------------- 7 セグメントの数字（消えている部分もうっすら見える）

SEGS = {0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg'}


def seg_polys(w, h, t, g):
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
    return {'a': hbar(hx0, hx1, top), 'g': hbar(hx0, hx1, mid), 'd': hbar(hx0, hx1, bot),
            'f': vbar(hx0, top, mid), 'b': vbar(hx1, top, mid), 'e': vbar(hx0, mid, bot), 'c': vbar(hx1, mid, bot)}


def seg_digit(n, w, h, t, on, off):
    pw = w + h * SLANT + 2
    img = Image.new('RGBA', (int(math.ceil(pw * S)), int(math.ceil((h + 1) * S))), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for k, poly in seg_polys(w, h, t, max(0.6, t * 0.12)).items():
        lit = k in SEGS[n]
        if not lit and off is None:
            continue
        d.polygon([((x + (h - y) * SLANT + 1) * S, (y + 0.5) * S) for x, y in poly], fill=on if lit else off)
    return img


def digit_set(name, w, h, t, on, off):
    return [save(shrink(seg_digit(i, w, h, t, on, off)), f'{name}/{i}.png') for i in range(10)]


def cell_w(w, h):
    return int(math.ceil(w + h * SLANT + 2))


BIG = (23, 46, 5.8)  # 時・分: 幅・高さ・線の太さ
SEC = (13, 26, 3.6)  # 秒
SMALL = (9, 16, 2.4)  # 月-日


def lcd_layout():
    x, y, w, h = LCD
    bw, sw, mw = cell_w(BIG[0], BIG[1]), cell_w(SEC[0], SEC[1]), cell_w(SMALL[0], SMALL[1])
    gap, colon, sgap = 2, 10, 5
    total = bw * 4 + gap * 2 + colon + sgap + sw * 2 + 1
    tx = int(x + (w - total) / 2)
    ty = int(y + (h - BIG[1]) / 2)
    tx_, ty_, tw, th = TOP
    date_y = int(ty_ + (th - SMALL[1]) / 2)
    day_x = tx_ + tw - 6 - mw * 2 - 1
    month_x = day_x - 10 - mw * 2 - 1
    L['lcd'] = dict(time_x=tx, min_x=tx + bw * 2 + gap + colon, time_y=ty, big_h=BIG[1], big_space=gap,
                    colon_x=tx + bw * 2 + gap + colon / 2 - 1, sec_x=tx + bw * 4 + gap * 2 + colon + sgap, sec_y=ty + BIG[1] - SEC[1],
                    date_y=date_y, small_h=SMALL[1], month_x=month_x, day_x=day_x, dash_x=month_x + mw * 2 + 1 + 5,
                    week_x=tx_ + 7, week_y=date_y - 1, big_w=bw, sec_w=sw, small_w=mw)


def week_images():
    """曜日: 液晶の文字と同じ傾きの太字 2 文字（IMG_WEEK は月曜始まり）"""
    paths = []
    f = font(700, 16 * S)
    for i, s_ in enumerate(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']):
        t = text_img(s_, f, ORANGE if i >= 5 else LCD_ON, spacing=0.8)
        h = t.height
        img = Image.new('RGBA', (t.width + int(h * SLANT) + 2 * S, h), (0, 0, 0, 0))
        img.paste(t, (0, 0))
        img = img.transform(img.size, Image.AFFINE, (1, SLANT, -h * SLANT, 0, 1, 0), resample=Image.BICUBIC)
        paths.append(save(shrink(img), f'week/{i}.png'))
    return paths


def battery_frames():
    """9 時のダイヤルの電池の針（0〜100% を 21 コマ）"""
    cx, cy = SUB_C
    r = SUB_R
    box = 2 * r
    paths = []
    for i in range(21):
        deg = -120 + i * 12
        img = canvas(box)
        d = ImageDraw.Draw(img)
        c = r
        body = rotate_pts([(c - 1.5, c + 6), (c + 1.5, c + 6), (c + 0.8, c - (r - 15)), (c - 0.8, c - (r - 15))], deg, c, c)
        d.polygon(sp(body), fill=(214, 218, 214, 255))
        head = rotate_pts([(c - 1.7, c - (r - 15)), (c + 1.7, c - (r - 15)), (c, c - (r - 6))], deg, c, c)
        d.polygon(sp(head), fill=WHITE)
        d.ellipse(sp([(c - 3.4, c - 3.4), (c + 3.4, c + 3.4)]), fill=(40, 42, 45, 255), outline=(120, 124, 128, 255), width=int(1 * S))
        out = canvas(box)
        drop_shadow(out, img, off=1.2, blur=1.2, alpha=0.8)
        out.alpha_composite(img)
        paths.append(save(shrink(out), f'bat/{i}.png'))
    return dict(x=int(cx - r), y=int(cy - r), src=paths)


# ---------------------------------------------------------------- 針（黒い刃に夜光の帯）

def blade(length, width, tip, tail):
    return [(0, -length), (width / 2, -length + tip), (width / 2, tail), (-width / 2, tail), (-width / 2, -length + tip)]


def hand_image(name, length, width, tip, tail, lume_from, aod=False):
    pad = 4
    w = int(width + pad * 2)
    h = int(length + tail + pad * 2)
    ox, oy = w / 2, length + pad
    img = canvas(w, h)
    d = ImageDraw.Draw(img)
    tr = lambda pts: sp([(ox + x, oy + y) for x, y in pts])
    outer = blade(length, width, tip, tail)
    if aod:
        d.polygon(tr(outer), fill=(0, 0, 0, 255))
        d.line(tr(outer + [outer[0]]), fill=AOD_LINE, width=int(2 * S), joint='curve')
        d.polygon(tr(blade(length - 6, width - 7, tip - 2, -length * lume_from)), outline=AOD_LINE, width=int(1.2 * S))
    else:
        d.polygon(tr(outer), fill=HAND_EDGE)
        d.polygon(tr(blade(length - 1.5, width - 2.8, tip - 0.6, tail - 1.5)), fill=HAND)
        d.polygon(tr(blade(length - 6, width - 7, tip - 2, -length * lume_from)), fill=LUME)
        d.ellipse(tr([(-width / 2 - 1, -width / 2 - 1), (width / 2 + 1, width / 2 + 1)]), fill=HAND, outline=HAND_EDGE, width=int(1.3 * S))
    path = save(shrink(img), f'hands/{name}{"_aod" if aod else ""}.png')
    return dict(path=path, pos_x=int(round(ox)), pos_y=int(round(oy)))


def second_image():
    length, tail = 200, 42
    w, h = 16, length + tail + 8
    ox, oy = w / 2, length + 4
    img = canvas(w, h)
    d = ImageDraw.Draw(img)
    d.polygon(sp([(ox - 1.3, oy + tail), (ox + 1.3, oy + tail), (ox + 0.9, oy - length + 8), (ox, oy - length), (ox - 0.9, oy - length + 8)]), fill=ORANGE)
    d.rounded_rectangle(sp([(ox - 3, oy + 16), (ox + 3, oy + tail)]), radius=1.5 * S, fill=ORANGE)
    path = save(shrink(img), 'hands/second.png')
    return dict(path=path, pos_x=int(round(ox)), pos_y=int(round(oy)))


def cap_image(aod=False):
    r = 11
    img = canvas(2 * r)
    d = ImageDraw.Draw(img)
    d.ellipse(sp([(0.5, 0.5), (2 * r - 0.5, 2 * r - 0.5)]), fill=(22, 23, 25, 255))
    d.ellipse(sp([(2.5, 2.5), (2 * r - 2.5, 2 * r - 2.5)]), outline=AOD_ORANGE if aod else ORANGE, width=int(2.4 * S))
    d.ellipse(sp([(r - 2.4, r - 2.4), (r + 2.4, r + 2.4)]), fill=(150, 154, 158, 255) if not aod else (70, 72, 76, 255))
    path = save(shrink(img), f'hands/cap{"_aod" if aod else ""}.png')
    return dict(path=path, x=int(C - r), y=int(C - r))


# ---------------------------------------------------------------- 常時表示（AOD）

def build_aod():
    img = Image.new('RGBA', (W * S, W * S), (0, 0, 0, 255))
    layer = canvas(W)
    d = ImageDraw.Draw(layer)
    for b in index_blocks():
        d.polygon(sp(block_poly(*b)), outline=AOD_DIM, width=int(1.5 * S))
    x, y, w, h = LCD
    d.rectangle(sp([(x - 1.4, y - 1.4), (x + w + 1.4, y + h + 1.4)]), outline=AOD_DIM, width=int(1.4 * S))
    d.polygon(sp([polar(238, -3.6), polar(238, 3.6), polar(222, 0)]), fill=AOD_ORANGE)
    img.alpha_composite(layer)
    lcd_marks(img, AOD_LCD, aod=True)
    L['aod_bg'] = save(shrink(img).convert('RGB'), 'aod_bg.png')


# ---------------------------------------------------------------- 書き出し

def preview(bg, hh=10, mm=8, ss=36, wday=5, month=10, day=25, bat=72):
    mask = Image.new('L', (W, W), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, W - 1, W - 1), fill=255)

    def open_(path):
        return Image.open(os.path.join(ROOT, 'assets', 'balance3', path)).convert('RGBA')

    def digits(img, arr, x, y, s_, step):
        for i, ch in enumerate(s_):
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

    D = L['lcd']
    img = bg.convert('RGBA')
    img.alpha_composite(open_(D['week'][wday]), (D['week_x'], D['week_y']))
    digits(img, D['small'], D['month_x'], D['date_y'], f'{month:02d}', D['small_w'] + 1)
    digits(img, D['small'], D['day_x'], D['date_y'], f'{day:02d}', D['small_w'] + 1)
    digits(img, D['big'], D['time_x'], D['time_y'], f'{hh:02d}', D['big_w'] + D['big_space'])
    digits(img, D['big'], D['min_x'], D['time_y'], f'{mm:02d}', D['big_w'] + D['big_space'])
    digits(img, D['sec'], D['sec_x'], D['sec_y'], f'{ss:02d}', D['sec_w'] + 1)
    img.alpha_composite(open_(L['bat']['src'][round(bat / 5)]), (L['bat']['x'], L['bat']['y']))
    hand(img, L['hour'], (hh % 12) * 30 + mm * 0.5)
    hand(img, L['minute'], mm * 6 + ss * 0.1)
    hand(img, L['second'], ss * 6)
    img.alpha_composite(open_(L['cap']['path']), (L['cap']['x'], L['cap']['y']))
    out = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    out.save(os.path.join(ROOT, 'preview.png'))

    img = open_(L['aod_bg'])
    digits(img, D['big_aod'], D['time_x'], D['time_y'], f'{hh:02d}', D['big_w'] + D['big_space'])
    digits(img, D['big_aod'], D['min_x'], D['time_y'], f'{mm:02d}', D['big_w'] + D['big_space'])
    hand(img, L['hour_aod'], (hh % 12) * 30 + mm * 0.5, shadow=False)
    hand(img, L['minute_aod'], mm * 6, shadow=False)
    img.alpha_composite(open_(L['cap_aod']['path']), (L['cap']['x'], L['cap']['y']))
    out = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    out.save(os.path.join(ROOT, 'preview_aod.png'))


def main():
    import shutil
    shutil.rmtree(IMG_DIR, ignore_errors=True)
    bg = build_background()
    D = L['lcd']
    D['big'] = digit_set('lcd/big', *BIG, LCD_ON, LCD_OFF)
    D['sec'] = digit_set('lcd/sec', *SEC, LCD_ON, LCD_OFF)
    D['small'] = digit_set('lcd/small', *SMALL, LCD_ON, LCD_OFF)
    D['big_aod'] = digit_set('lcd/big_aod', *BIG, AOD_LCD, None)
    D['week'] = week_images()
    L['bat'] = battery_frames()
    L['hour'] = hand_image('hour', 108, 24, 16, 14, 0.55)
    L['minute'] = hand_image('minute', 176, 18, 24, 18, 0.45)
    L['second'] = second_image()
    L['cap'] = cap_image()
    L['hour_aod'] = hand_image('hour', 108, 24, 16, 14, 0.55, aod=True)
    L['minute_aod'] = hand_image('minute', 176, 18, 24, 18, 0.45, aod=True)
    L['cap_aod'] = cap_image(aod=True)
    build_aod()
    preview(bg)
    L['icon'] = save(Image.open(os.path.join(ROOT, 'preview.png')).convert('RGBA').resize((124, 124), Image.LANCZOS), 'icon.png')
    with open(os.path.join(ROOT, 'watchface', 'layout.js'), 'w') as f:
        f.write('// tools/gen.py が作るファイル（手で編集しない）\nexport const L = ' + json.dumps(L, ensure_ascii=False, indent=1) + '\n')


if __name__ == '__main__':
    main()
