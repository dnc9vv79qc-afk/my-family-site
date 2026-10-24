"""TOUGH Ti: G-SHOCK 風のアナログ文字盤（黒ケース × シアン）の画像と watchface/layout.js を作る。

    python3 tools/gen.py

絵は 4 倍の大きさで描いてから縮める（輪郭をなめらかにするため）。角度は 12 時が 0°・時計回り。
"""
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

CYAN = (52, 198, 232, 255)
CYAN_HI = (160, 236, 252, 255)
CYAN_LO = (14, 92, 116, 255)
LUME = (228, 233, 226, 255)
WHITE = (234, 236, 236, 255)
GREY = (150, 154, 157, 255)
ENGRAVE = (64, 66, 70, 255)
AOD_LINE = (120, 124, 128, 255)
AOD_CYAN = (30, 120, 142, 255)

R_BEZEL = 240  # ケース（ベゼル）の外側
R_FLANGE = 206  # 見返しリング（都市コード・分目盛り）
R_DIAL = 176  # 文字盤

# サブダイヤル: 24 時間計（右上）/ 曜日（左下）/ 電池（右下）。日付窓は 3 時
SUB_R = 46
SUB = {
    'h24': (296, 182),
    'week': (164, 270),
    'bat': (292, 300),
}
DATE_BOX = (360, 228, 40, 26)  # x, y, w, h

CITIES = ['UTC', 'LON', 'PAR', 'ATH', 'JED', 'THR', 'DXB', 'KBL', 'KHI', 'DEL', 'DAC', 'RGN', 'BKK', 'HKG',
          'TYO', 'ADL', 'NOU', 'WLG', 'PPG', 'HNL', 'ANC', 'LAX', 'DEN', 'CHI', 'NYC', 'SCL', 'RIO', 'FEN', 'RAI']

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
    """彫り込み: 暗い影（右下）と明るいふち（左上）を重ねる"""
    shadow = canvas(W)
    draw_fn(shadow, (8, 8, 9, 255))
    hi = canvas(W)
    draw_fn(hi, (88, 90, 94, 255))
    body = canvas(W)
    draw_fn(body, ENGRAVE)
    dst.alpha_composite(hi, (-S, -S))
    dst.alpha_composite(shadow, (S, S))
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


# ---------------------------------------------------------------- 太い数字（12・6）
# 10×14 の升目で描く角ばった数字。外側の角は面取り
STROKE = 3.3


def glyph_rects(ch):
    t = STROKE
    if ch == '1':
        return [(5.4, 0, 5.4 + t, 14), ('poly', [(1.6, 2.6), (5.4, 0), (5.4 + t, 0), (5.4 + t, 3.0), (1.6, 5.2)])]
    if ch == '2':
        return [(0, 0, 10, t), (10 - t, 0, 10, 7.4), (0, 5.4, 10, 5.4 + t), (0, 5.4, t, 14), (0, 14 - t, 10, 14)]
    if ch == '6':
        return [(0, 0, t, 14), (0, 0, 10, t), (0, 5.4, 10, 5.4 + t), (10 - t, 5.4, 10, 14), (0, 14 - t, 10, 14)]
    raise ValueError(ch)


def numeral_mask(s, x, y, unit, gap=1.6):
    """左上 (x, y)、升目 1 つ = unit px の数字の形"""
    def draw(d):
        ox = x
        for ch in s:
            for r in glyph_rects(ch):
                if r[0] == 'poly':
                    d.polygon(sp([(ox + px * unit, y + py * unit) for px, py in r[1]]), fill=255)
                else:
                    x0, y0, x1, y1 = r
                    d.rectangle(sp([(ox + x0 * unit, y + y0 * unit), (ox + x1 * unit, y + y1 * unit)]), fill=255)
            # 外側の角を面取り
            k = 1.3 * unit
            w = (10 if ch != '1' else 5.4 + STROKE) * unit
            x0 = ox + (0 if ch != '1' else 1.6 * unit)
            for (cx, cy, dx, dy) in [(x0, y, 1, 1), (ox + w, y, -1, 1), (x0, y + 14 * unit, 1, -1), (ox + w, y + 14 * unit, -1, -1)]:
                d.polygon(sp([(cx, cy), (cx + dx * k, cy), (cx, cy + dy * k)]), fill=0)
            ox += w + gap * unit
    return mask_of(draw)


def numeral_width(s, unit, gap=1.6):
    return sum((10 if ch != '1' else 5.4 + STROKE) * unit for ch in s) + gap * unit * (len(s) - 1)


# ---------------------------------------------------------------- 背景（ケース・見返し・文字盤）

def base_layer():
    n = W * S
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    xx = (xx + 0.5) / S - C
    yy = (yy + 0.5) / S - C
    r = np.hypot(xx, yy)
    ang = (np.degrees(np.arctan2(xx, -yy)) + 360) % 360
    rgb = np.zeros((n, n, 3), np.float32)
    rng = np.random.default_rng(7)

    # ケース: 黒い樹脂。左上から光が当たり、外へいくほど丸く落ちる
    light = np.cos(np.radians(ang - 315))
    t = np.clip((r - R_FLANGE) / (R_BEZEL - R_FLANGE), 0, 1)
    dome = np.clip(np.sin(t * math.pi), 0, 1) ** 0.6
    bez = 22 + 10 * dome + 6 * light * dome
    # ブロック状の段差（ベゼルの 4 か所の張り出し）
    for c_ in (60, 120, 240, 300):
        d = np.abs(((ang - c_ + 180) % 360) - 180)
        bez -= 7 * np.exp(-((d - 0) / 1.2) ** 2) * (t > 0.08)
    noise = rng.normal(0, 1.4, (n, n)).astype(np.float32)
    bezel = np.stack([bez, bez + 1, bez + 3], -1) + noise[..., None]

    # 見返し: 内側へ下がる斜面
    tf = np.clip((r - R_DIAL) / (R_FLANGE - R_DIAL), 0, 1)
    fl = 12 + 8 * tf + 3 * light
    flange = np.stack([fl, fl + 1, fl + 2], -1)

    # 文字盤: 中央が少し明るいチャコール
    td = np.clip(r / R_DIAL, 0, 1)
    dv = 47 - 15 * td ** 1.6 + 2.5 * light * td
    dial = np.stack([dv, dv + 2, dv + 4], -1) + rng.normal(0, 1.1, (n, n)).astype(np.float32)[..., None]

    rgb = np.where((r >= R_FLANGE)[..., None], bezel, np.where((r >= R_DIAL)[..., None], flange, dial))
    # 段差の線: 見返しの外側に影、文字盤の縁にハイライト
    rgb -= (14 * np.exp(-((r - R_FLANGE) / 1.0) ** 2))[..., None]
    rgb += (10 * np.exp(-((r - (R_BEZEL - 2.5)) / 1.2) ** 2) * (0.5 + 0.5 * light))[..., None]
    rgb -= (10 * np.exp(-((r - R_DIAL) / 0.9) ** 2))[..., None]
    alpha = np.clip((R_BEZEL - r) * S, 0, 1) * 255
    out = np.concatenate([np.clip(rgb, 0, 255), alpha[..., None]], -1).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def subdial_layer(cx, cy, r):
    """くぼんだサブダイヤル: 同心円の溝、上側の内影、下側のふちのハイライト"""
    n = int(2 * (r + 4) * S)
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    xx = (xx + 0.5) / S - (r + 4)
    yy = (yy + 0.5) / S - (r + 4)
    rr = np.hypot(xx, yy)
    v = 26 + 2.2 * np.sin(rr * 2 * math.pi / 1.6)
    v -= 10 * np.clip(1 - (r - rr) / 9, 0, 1) * np.clip(-yy / r, 0, 1)  # 上側の内影
    rgb = np.stack([v, v + 1, v + 3], -1)
    rim = np.exp(-((rr - r) / 0.8) ** 2) * np.clip(yy / r, 0, 1) * 70  # 下のふち
    rgb += rim[..., None]
    a = np.clip((r + 0.6 - rr) * S, 0, 1) * 255
    img = Image.fromarray(np.concatenate([np.clip(rgb, 0, 255), a[..., None]], -1).astype(np.uint8), 'RGBA')
    return img, (int((cx - r - 4) * S), int((cy - r - 4) * S))


def draw_bezel_marks(bg):
    def numbers(layer, fill):
        for i, s in enumerate(['60', '10', '20', '30', '40', '50']):
            deg = i * 60
            text_at(layer, s, *polar(223, deg), 13, fill, weight=700, rot=deg if deg not in (120, 180, 240) else deg + 180)
    engraved(bg, numbers)

    def words(layer, fill):
        arc_text(layer, 'TOUGH Ti', 222, 330, 15, fill, weight=700, spacing=1.6)
        arc_text(layer, 'SHOCK RESIST', 222, 150, 13, fill, weight=700, spacing=1.4, bottom=True)
        arc_text(layer, 'MULTI BAND', 222, 270, 10, fill, weight=600, spacing=1.2)
        arc_text(layer, '20 BAR', 222, 210, 10, fill, weight=600, spacing=1.2, bottom=True)
    engraved(bg, words)


def draw_flange(bg):
    layer = canvas(W)
    d = ImageDraw.Draw(layer)
    for i in range(60):
        deg = i * 6
        if i % 5 == 0:
            d.polygon(sp(radial_bar(R_DIAL + 1, R_DIAL + 12, deg, 2.6)), fill=CYAN)
        else:
            d.polygon(sp(radial_bar(R_DIAL + 1, R_DIAL + 7, deg, 1.3)), fill=CYAN)
    step = 360 / len(CITIES)
    for i, s in enumerate(CITIES):
        deg = (i + 0.5) * step
        bottom = 95 < deg < 265
        arc_text(layer, s, 196, deg, 8.4, (40, 168, 200, 255), weight=600, spacing=0.6, bottom=bottom)
    bg.alpha_composite(layer)


def draw_indices(bg):
    """シアンの立体インデックスと太い 12・6。3 時は日付窓、ほかはバー"""
    def bars(d):
        for h in range(12):
            if h in (0, 3, 6):
                continue
            w = 9 if h % 3 == 0 else 7.5
            d.polygon(sp(radial_bar(R_DIAL - 40, R_DIAL - 8, h * 30, w)), fill=255)
        # 12 時の両脇の小さな三角
    applied(bg, mask_of(bars))

    unit = 3.2
    nw = numeral_width('12', unit)
    applied(bg, numeral_mask('12', C - nw / 2, 72, unit))
    unit6 = 3.0
    nw6 = numeral_width('6', unit6)
    applied(bg, numeral_mask('6', 214 - nw6 / 2, 370 - 14 * unit6, unit6))


def draw_date_window(bg):
    x, y, w, h = DATE_BOX
    layer = canvas(W)
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle(sp([(x - 3, y - 3), (x + w + 3, y + h + 3)]), radius=4 * S, fill=CYAN_LO)
    d.rounded_rectangle(sp([(x - 1.6, y - 1.6), (x + w + 1.6, y + h + 1.6)]), radius=3 * S, fill=CYAN)
    d.rounded_rectangle(sp([(x, y), (x + w, y + h)]), radius=2 * S, fill=(14, 15, 16, 255))
    drop_shadow(bg, layer, off=2, blur=2)
    bg.alpha_composite(layer)
    # 窓の中の上側の影
    sh = canvas(W)
    ImageDraw.Draw(sh).rectangle(sp([(x, y), (x + w, y + 4)]), fill=(0, 0, 0, 120))
    bg.alpha_composite(sh.filter(ImageFilter.GaussianBlur(1.5 * S)))


def draw_subdials(bg):
    for key, (cx, cy) in SUB.items():
        img, pos = subdial_layer(cx, cy, SUB_R)
        bg.alpha_composite(img, pos)
        layer = canvas(W)
        d = ImageDraw.Draw(layer)
        r = SUB_R
        if key == 'h24':
            for i in range(48):
                deg = i * 7.5
                if i % 4 == 0:
                    d.polygon(sp(radial_bar(r - 7, r - 1.5, deg, 1.8, cx, cy)), fill=WHITE)
                else:
                    d.polygon(sp(radial_bar(r - 4, r - 1.5, deg, 0.9, cx, cy)), fill=GREY)
            for h in (24, 6, 12, 18):
                text_at(layer, str(h), *polar(r - 16, h / 24 * 360 % 360, cx, cy), 10.5, WHITE, weight=600)
            text_at(layer, '24H', cx, cy + 18, 7.5, CYAN, weight=700, spacing=0.6)
        elif key == 'week':
            for i, s in enumerate(['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']):
                deg = i * 360 / 7
                text_at(layer, s, *polar(r - 14, deg, cx, cy), 9, CYAN if i == 0 else WHITE, weight=700)
                d.polygon(sp(radial_bar(r - 4.5, r - 1.5, deg, 1.6, cx, cy)), fill=GREY)
        elif key == 'bat':
            for i in range(11):
                deg = -135 + i * 27
                big = i % 5 == 0
                d.polygon(sp(radial_bar(r - (7 if big else 4), r - 1.5, deg, 1.8 if big else 1.0, cx, cy)), fill=WHITE if big else GREY)
            # 残り少ない側（0〜20%）はシアンの帯
            d.arc(sp([(cx - r + 2.5, cy - r + 2.5), (cx + r - 2.5, cy + r - 2.5)]), start=-135 - 90, end=-135 + 54 - 90, fill=CYAN, width=int(2 * S))
            text_at(layer, 'E', *polar(r - 15, -120, cx, cy), 10, CYAN, weight=700)
            text_at(layer, 'F', *polar(r - 15, 120, cx, cy), 10, WHITE, weight=700)
            text_at(layer, 'BATT', cx, cy + 20, 7.5, CYAN, weight=700, spacing=0.6)
        bg.alpha_composite(layer)


def draw_dial_print(bg):
    layer = canvas(W)
    text_at(layer, 'TOUGH Ti', 176, 168, 14, CYAN, weight=700, spacing=1.0)
    text_at(layer, 'SHOCK RESIST', 176, 186, 8.5, CYAN, weight=600, spacing=1.0)
    bg.alpha_composite(layer)


def build_background():
    bg = base_layer()
    draw_bezel_marks(bg)
    draw_flange(bg)
    draw_subdials(bg)
    draw_indices(bg)
    draw_date_window(bg)
    draw_dial_print(bg)
    full = Image.new('RGBA', (W * S, W * S), (0, 0, 0, 255))
    full.alpha_composite(bg)
    out = shrink(full).convert('RGB')
    L['bg'] = save(out, 'bg.png')
    return out


# ---------------------------------------------------------------- 針

def sword(length, tail, width, tip=0.13):
    """上向きの剣形の針（回転の中心が原点）"""
    return [(0, -length), (width / 2, -length * (1 - tip)), (width / 2 * 0.86, -length * 0.25), (width * 0.24, 0),
            (width * 0.24, tail), (-width * 0.24, tail), (-width * 0.24, 0), (-width / 2 * 0.86, -length * 0.25),
            (-width / 2, -length * (1 - tip))]


def inset(pts, k):
    """多角形を重心へ向けて少し縮める（ふち取り用のざっくりした内側）"""
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    return [(x + (cx - x) * k[0], y + (cy - y) * k[1]) for x, y in pts]


def hand_image(name, length, tail, width, aod=False):
    pad = 4
    w = int(width + pad * 2)
    h = int(length + tail + pad * 2)
    ox, oy = w / 2, length + pad  # 回転の中心
    img = canvas(w, h)
    d = ImageDraw.Draw(img)
    outer = [(ox + x, oy + y) for x, y in sword(length, tail, width)]
    if aod:
        d.polygon(sp(outer), fill=(0, 0, 0, 255), outline=None)
        d.line(sp(outer + [outer[0]]), fill=AOD_LINE, width=int(2 * S), joint='curve')
    else:
        d.polygon(sp(outer), fill=CYAN)
        lume = [(ox + x, oy + y) for x, y in sword(length - 9, -6, width - 6.5, tip=0.11)]
        lume = [(x, y) for x, y in lume]
        d.polygon(sp(lume), fill=LUME)
        # 中心線の細い影で立体に
        d.line(sp([(ox, oy - length + 12), (ox, oy - 14)]), fill=(196, 202, 196, 255), width=int(1 * S))
    path = save(shrink(img), f'hands/{name}{"_aod" if aod else ""}.png')
    return dict(path=path, pos_x=int(round(ox)), pos_y=int(round(oy)))


def second_image(aod=False):
    length, tail = 170, 44
    w, h = 18, length + tail + 8
    ox, oy = w / 2, length + 4
    img = canvas(w, h)
    d = ImageDraw.Draw(img)
    col = AOD_LINE if aod else CYAN
    d.polygon(sp([(ox - 1.2, oy + tail), (ox + 1.2, oy + tail), (ox + 0.8, oy - length + 18), (ox, oy - length), (ox - 0.8, oy - length + 18)]), fill=col)
    d.ellipse(sp([(ox - 6, oy + 24 - 6), (ox + 6, oy + 24 + 6)]), outline=col, width=int(2.4 * S))
    d.polygon(sp([(ox - 2.6, oy - length + 30), (ox + 2.6, oy - length + 30), (ox + 1.4, oy - length + 12), (ox - 1.4, oy - length + 12)]), fill=col)
    path = save(shrink(img), f'hands/second{"_aod" if aod else ""}.png')
    return dict(path=path, pos_x=int(round(ox)), pos_y=int(round(oy)))


def cap_image(aod=False):
    r = 11
    img = canvas(2 * r)
    d = ImageDraw.Draw(img)
    d.ellipse(sp([(0.5, 0.5), (2 * r - 0.5, 2 * r - 0.5)]), fill=(20, 21, 22, 255))
    d.ellipse(sp([(3, 3), (2 * r - 3, 2 * r - 3)]), outline=AOD_LINE if aod else CYAN, width=int(2.2 * S))
    d.ellipse(sp([(r - 2, r - 2), (r + 2, r + 2)]), fill=(90, 94, 98, 255))
    path = save(shrink(img), f'hands/cap{"_aod" if aod else ""}.png')
    return dict(path=path, x=int(C - r), y=int(C - r))


def sub_hand_frames(key, angles):
    """サブダイヤルの針を角度ごとに描いたコマ（IMG_LEVEL / IMG_WEEK / 時刻で差し替え）"""
    cx, cy = SUB[key]
    r = SUB_R
    box = 2 * r
    paths = []
    for i, deg in enumerate(angles):
        img = canvas(box)
        d = ImageDraw.Draw(img)
        c = r
        tip = polar(r - 9, deg, c, c)
        body = [(c - 1.9, c + 8), (c + 1.9, c + 8), (c + 1.0, c - (r - 21)), (c - 1.0, c - (r - 21))]
        body = rotate_pts(body, deg, c, c)
        d.polygon(sp(body), fill=WHITE)
        head = rotate_pts([(c - 2.2, c - (r - 21)), (c + 2.2, c - (r - 21)), (c, c - (r - 9))], deg, c, c)
        d.polygon(sp(head), fill=CYAN)
        d.ellipse(sp([(c - 4.2, c - 4.2), (c + 4.2, c + 4.2)]), fill=CYAN)
        d.ellipse(sp([(c - 1.6, c - 1.6), (c + 1.6, c + 1.6)]), fill=(20, 21, 22, 255))
        _ = tip
        # 影をつけて文字盤から浮かせる
        out = canvas(box)
        drop_shadow(out, img, off=1.2, blur=1.2, alpha=0.8)
        out.alpha_composite(img)
        paths.append(save(shrink(out), f'sub/{key}/{i}.png'))
    return dict(x=int(cx - r), y=int(cy - r), w=box, h=box, src=paths)


def date_digits():
    paths = []
    f = font(600, 20 * S)
    for i in range(10):
        t = text_img(str(i), f, WHITE)
        cell = Image.new('RGBA', (11 * S, 20 * S), (0, 0, 0, 0))
        cell.alpha_composite(t, ((cell.width - t.width) // 2, (cell.height - t.height) // 2))
        paths.append(save(shrink(cell), f'date/{i}.png'))
    x, y, w, h = DATE_BOX
    return dict(src=paths, x=int(x + (w - 22) / 2), y=int(y + (h - 20) / 2), w=22)


# ---------------------------------------------------------------- 常時表示（AOD）

def build_aod():
    img = Image.new('RGBA', (W * S, W * S), (0, 0, 0, 255))
    layer = canvas(W)
    d = ImageDraw.Draw(layer)
    for i in range(60):
        deg = i * 6
        if i % 5 == 0:
            d.polygon(sp(radial_bar(R_DIAL + 1, R_DIAL + 12, deg, 2.4)), fill=AOD_CYAN)
    for h in range(12):
        if h in (0, 3, 6):
            continue
        d.polygon(sp(radial_bar(R_DIAL - 40, R_DIAL - 8, h * 30, 7)), outline=AOD_CYAN, width=int(1.6 * S))
    unit = 3.2
    nw = numeral_width('12', unit)
    m = numeral_mask('12', C - nw / 2, 72, unit)
    edge = m.filter(ImageFilter.MaxFilter(5))
    ring = Image.fromarray(np.clip(np.asarray(edge, np.int16) - np.asarray(m.filter(ImageFilter.MinFilter(5)), np.int16), 0, 255).astype(np.uint8))
    col = Image.new('RGBA', m.size, AOD_CYAN)
    col.putalpha(ring)
    layer.alpha_composite(col)
    unit6 = 3.0
    m6 = numeral_mask('6', 214 - numeral_width('6', unit6) / 2, 370 - 14 * unit6, unit6)
    ring6 = np.clip(np.asarray(m6.filter(ImageFilter.MaxFilter(5)), np.int16) - np.asarray(m6.filter(ImageFilter.MinFilter(5)), np.int16), 0, 255)
    col6 = Image.new('RGBA', m6.size, AOD_CYAN)
    col6.putalpha(Image.fromarray(ring6.astype(np.uint8)))
    layer.alpha_composite(col6)
    x, y, w, h = DATE_BOX
    d.rounded_rectangle(sp([(x - 1.6, y - 1.6), (x + w + 1.6, y + h + 1.6)]), radius=3 * S, outline=AOD_CYAN, width=int(1.4 * S))
    img.alpha_composite(layer)
    L['aod_bg'] = save(shrink(img).convert('RGB'), 'aod_bg.png')
    paths = []
    f = font(500, 20 * S)
    for i in range(10):
        t = text_img(str(i), f, (170, 174, 176, 255))
        cell = Image.new('RGBA', (11 * S, 20 * S), (0, 0, 0, 0))
        cell.alpha_composite(t, ((cell.width - t.width) // 2, (cell.height - t.height) // 2))
        paths.append(save(shrink(cell), f'date_aod/{i}.png'))
    L['aod_date'] = dict(src=paths)


# ---------------------------------------------------------------- 書き出し

def preview(bg, hh=10, mm=8, ss=36, wday=5, day=24, bat=72):
    img = bg.convert('RGBA')

    def put(path, x, y):
        img.alpha_composite(Image.open(os.path.join(ROOT, 'assets', 'balance3', path)).convert('RGBA'), (x, y))

    put(L['h24']['src'][(hh * 60 + mm) // 30], L['h24']['x'], L['h24']['y'])
    put(L['week']['src'][(wday + 6) % 7], L['week']['x'], L['week']['y'])
    put(L['bat']['src'][round(bat / 5)], L['bat']['x'], L['bat']['y'])
    dd = L['date']
    put(dd['src'][day // 10], dd['x'], dd['y'])
    put(dd['src'][day % 10], dd['x'] + 11, dd['y'])

    def hand(info, deg):
        h = Image.open(os.path.join(ROOT, 'assets', 'balance3', info['path'])).convert('RGBA')
        big = Image.new('RGBA', (W, W), (0, 0, 0, 0))
        big.alpha_composite(h, (int(C - info['pos_x']), int(C - info['pos_y'])))
        big = big.rotate(-deg, resample=Image.BICUBIC, center=(C, C))
        sh = Image.new('RGBA', (W, W), (0, 0, 0, 255))
        sh.putalpha(big.getchannel('A').filter(ImageFilter.GaussianBlur(3)).point(lambda v: int(v * 0.7)))
        img.alpha_composite(sh, (3, 5))
        img.alpha_composite(big)

    hand(L['hour'], (hh % 12) * 30 + mm * 0.5)
    hand(L['minute'], mm * 6 + ss * 0.1)
    hand(L['second'], ss * 6)
    put(L['cap']['path'], L['cap']['x'], L['cap']['y'])
    mask = Image.new('L', (W, W), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, W - 1, W - 1), fill=255)
    out = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    out.save(os.path.join(ROOT, 'preview.png'))

    aod = Image.open(os.path.join(ROOT, 'assets', 'balance3', L['aod_bg'])).convert('RGBA')
    img = aod
    put(L['aod_date']['src'][day // 10], dd['x'], dd['y'])
    put(L['aod_date']['src'][day % 10], dd['x'] + 11, dd['y'])
    hand(L['hour_aod'], (hh % 12) * 30 + mm * 0.5)
    hand(L['minute_aod'], mm * 6)
    put(L['cap_aod']['path'], L['cap']['x'], L['cap']['y'])
    out = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    out.save(os.path.join(ROOT, 'preview_aod.png'))


def icon():
    bg = Image.open(os.path.join(ROOT, 'preview.png')).convert('RGBA').resize((124, 124), Image.LANCZOS)
    L['icon'] = save(bg, 'icon.png')


def main():
    bg = build_background()
    L['hour'] = hand_image('hour', 104, 20, 22)
    L['minute'] = hand_image('minute', 158, 26, 17)
    L['second'] = second_image()
    L['cap'] = cap_image()
    L['hour_aod'] = hand_image('hour', 104, 20, 22, aod=True)
    L['minute_aod'] = hand_image('minute', 158, 26, 17, aod=True)
    L['cap_aod'] = cap_image(aod=True)
    L['h24'] = sub_hand_frames('h24', [i * 7.5 for i in range(48)])
    # IMG_WEEK は月曜始まり。目盛りは 12 時が日曜で時計回り
    L['week'] = sub_hand_frames('week', [((i + 1) % 7) * 360 / 7 for i in range(7)])
    L['bat'] = sub_hand_frames('bat', [-135 + i * 13.5 for i in range(21)])
    L['date'] = date_digits()
    build_aod()
    preview(bg)
    icon()
    with open(os.path.join(ROOT, 'watchface', 'layout.js'), 'w') as f:
        import json
        f.write('// tools/gen.py が作るファイル（手で編集しない）\nexport const L = ' + json.dumps(L, ensure_ascii=False, indent=1) + '\n')


if __name__ == '__main__':
    main()
