"""TOUGH Ti: G-SHOCK（GW-B5600 / GA-2100）風の、真っ黒な樹脂ケースに大きな反転液晶を置いたデジタル文字盤の
画像と watchface/layout.js を作る。

    python3 tools/gen.py

真ん中に四角い液晶（7 セグの極太の時・分、小さめの秒、曜日、月-日、電池）、まわりに TOUGH Ti / PROTECTION の帯と
ボタン名の刻印。絵は 4 倍の大きさで描いてから縮める（輪郭をなめらかにするため）。
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
WHITE = (230, 232, 232, 255)
TEXT_DIM = (120, 124, 128, 255)
ENGRAVE = (11, 11, 12, 255)
LCD_BG = (8, 9, 10, 255)
LCD_ON = (206, 210, 204, 255)
LCD_OFF = (24, 26, 27, 255)
AOD_LCD = (150, 154, 150, 255)
AOD_DIM = (58, 60, 64, 255)
METAL, METAL_HI, METAL_LO = (120, 124, 128, 255), (180, 184, 188, 255), (40, 42, 45, 255)
CYAN, CYAN_HI, CYAN_LO = METAL, METAL_HI, METAL_LO  # applied() の既定色

FRAME = (58, 118, 364, 244)  # 液晶まわりの枠 x, y, w, h
LCD = (80, 158, 320, 166)  # 液晶 x, y, w, h
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
    """黒い樹脂: ほぼ黒のマットに細かいざらつき。外周へ少し暗く"""
    n = W * S
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    xx = (xx + 0.5) / S - C
    yy = (yy + 0.5) / S - C
    r = np.hypot(xx, yy)
    rng = np.random.default_rng(3)
    v = 22 - 8 * np.clip(r / 240, 0, 1) ** 2 + rng.normal(0, 1.3, (n, n)).astype(np.float32)
    rgb = np.stack([v, v + 1, v + 2], -1)
    alpha = np.clip((240 - r) * S, 0, 1) * 255
    return Image.fromarray(np.concatenate([np.clip(rgb, 0, 255), alpha[..., None]], -1).astype(np.uint8), 'RGBA')


def chamfer(x, y, w, h, k):
    return [(x + k, y), (x + w - k, y), (x + w, y + k), (x + w, y + h - k), (x + w - k, y + h), (x + k, y + h), (x, y + h - k), (x, y + k)]


def draw_frame(bg):
    """液晶まわりの一段高い枠。上の帯にロゴと PROTECTION、下の帯に防水・耐衝撃の表記"""
    x, y, w, h = FRAME
    layer = canvas(W)
    d = ImageDraw.Draw(layer)
    d.polygon(sp(chamfer(x, y, w, h, 16)), fill=(30, 31, 33, 255))
    d.polygon(sp(chamfer(x + 1.5, y + 1.5, w - 3, h - 3, 15)), fill=(36, 37, 40, 255))
    drop_shadow(bg, layer, off=3, blur=3, alpha=1.0)
    bg.alpha_composite(layer)
    # 枠の縁: 上と左が明るく、下と右が暗い
    edge = canvas(W)
    de = ImageDraw.Draw(edge)
    pts = chamfer(x, y, w, h, 16)
    de.line(sp([pts[7], pts[0], pts[1], pts[2]]), fill=(78, 80, 84, 255), width=int(1.2 * S))
    de.line(sp([pts[3], pts[4], pts[5], pts[6]]), fill=(10, 10, 11, 255), width=int(1.2 * S))
    bg.alpha_composite(edge)
    # 上の帯のレンガ模様（5600 の上枠の段差）
    t = canvas(W)
    dt = ImageDraw.Draw(t)
    lx, ly, lw, lh = LCD
    for i in range(7):
        bx = lx + 150 + i * 13
        dt.rectangle(sp([(bx, y + 9), (bx + 9, y + 13)]), fill=(52, 54, 58, 255))
    text_at(t, 'TOUGH Ti', lx + 46, y + 20, 15, WHITE, weight=700, spacing=1.0)
    # PROTECTION の箱
    px, py = lx + lw - 46, y + 21
    dt.rectangle(sp([(px - 38, py - 7.5), (px + 38, py + 7.5)]), outline=ORANGE, width=int(1.3 * S))
    text_at(t, 'PROTECTION', px, py, 8.5, ORANGE, weight=700, spacing=1.0)
    by = ly + lh + 13
    text_at(t, 'WATER 20BAR RESIST', lx + 66, by, 7.5, TEXT_DIM, weight=600, spacing=0.8)
    text_at(t, 'SHOCK RESIST', lx + lw - 50, by, 7.5, TEXT_DIM, weight=600, spacing=0.8)
    bg.alpha_composite(t)


def draw_lcd(bg):
    x, y, w, h = LCD
    layer = canvas(W)
    d = ImageDraw.Draw(layer)
    d.rectangle(sp([(x - 2.5, y - 2.5), (x + w + 2.5, y + h + 2.5)]), fill=(8, 8, 9, 255))
    d.rectangle(sp([(x - 1.2, y - 1.2), (x + w + 1.2, y + h + 1.2)]), fill=(70, 72, 76, 255))
    d.rectangle(sp([(x, y), (x + w, y + h)]), fill=LCD_BG)
    bg.alpha_composite(layer)
    sh = canvas(W)
    ImageDraw.Draw(sh).rectangle(sp([(x, y), (x + w, y + 10)]), fill=(0, 0, 0, 180))
    bg.alpha_composite(sh.filter(ImageFilter.GaussianBlur(2 * S)))
    # 時:分 のコロン、月-日 のハイフン（液晶の文字と同じ傾き）
    t = canvas(W)
    dt = ImageDraw.Draw(t)
    D = L['lcd']
    for yy in (D['time_y'] + D['big_h'] * 0.32, D['time_y'] + D['big_h'] * 0.68):
        cx = D['colon_x'] + (D['time_y'] + D['big_h'] - yy) * SLANT
        dt.rectangle(sp([(cx - 3.4, yy - 3.4), (cx + 3.4, yy + 3.4)]), fill=LCD_ON)
    hx, hy = D['dash_x'], D['date_y'] + D['small_h'] / 2
    dt.polygon(sp([(hx - 4 + 1, hy - 1.3), (hx + 4 + 1, hy - 1.3), (hx + 4, hy + 1.3), (hx - 4, hy + 1.3)]), fill=LCD_ON)
    # 電池の目盛りの枠
    bx, by = D['bat_icon']
    dt.rectangle(sp([(bx, by), (bx + 18, by + 10)]), outline=LCD_ON, width=int(1.3 * S))
    dt.rectangle(sp([(bx + 18.6, by + 3), (bx + 20.4, by + 7)]), fill=LCD_ON)
    bg.alpha_composite(t)


def draw_engraving(bg):
    """樹脂の部分に沈んだ刻印: 4 つのボタン名、上に MULTI BAND、下に SHOCK RESIST"""
    def words(layer, fill):
        for s_, deg in (('ADJUST', 315), ('START', 45), ('LIGHT', 135), ('MODE', 225)):
            x, y = polar(222, deg)
            text_at(layer, s_, x, y, 12, fill, weight=700, spacing=1.6, rot=deg if deg < 90 or deg > 270 else deg - 180)
        text_at(layer, 'MULTI BAND', 240, 92, 13, fill, weight=700, spacing=2.4)
        text_at(layer, 'SHOCK RESIST', 240, 392, 17, fill, weight=700, spacing=2.6)

    def lip(layer, fill):
        words(layer, fill)
    hi = canvas(W)
    lip(hi, (60, 62, 66, 255))
    body = canvas(W)
    words(body, ENGRAVE)
    bg.alpha_composite(hi, (int(0.9 * S), int(0.9 * S)))
    bg.alpha_composite(body)


def build_background():
    lcd_layout()
    bg = base_layer()
    draw_engraving(bg)
    draw_frame(bg)
    draw_lcd(bg)
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


BIG = (43, 86, 9.8)  # 時・分: 幅・高さ・線の太さ
SEC = (23, 46, 5.8)  # 秒
SMALL = (11, 20, 2.8)  # 月-日・電池


def lcd_layout():
    x, y, w, h = LCD
    bw, sw, mw = cell_w(BIG[0], BIG[1]), cell_w(SEC[0], SEC[1]), cell_w(SMALL[0], SMALL[1])
    gap = 4
    colon = 16
    total = bw * 4 + gap * 2 + colon + 10 + sw * 2 + 2
    tx = int(x + (w - total) / 2)
    ty = y + h - BIG[1] - 14
    sec_x = tx + bw * 4 + gap * 2 + colon + 10
    date_y = y + 12
    day_x = x + w - 12 - mw * 2 - 2
    month_x = day_x - 14 - mw * 2 - 2
    L['lcd'] = dict(time_x=tx, min_x=tx + bw * 2 + gap + colon, time_y=ty, big_h=BIG[1], big_space=gap - (bw - BIG[0] - int(BIG[1] * SLANT) - 2) if False else gap,
                    colon_x=tx + bw * 2 + gap + colon / 2 - 2, sec_x=sec_x, sec_y=ty + BIG[1] - SEC[1], date_y=date_y, small_h=SMALL[1],
                    month_x=month_x, day_x=day_x, dash_x=month_x + mw * 2 + 2 + 7, week_x=x + 12, week_y=date_y - 1,
                    bat_icon=(x + w / 2 - 34, date_y + 5), bat_x=int(x + w / 2 - 10), bat_y=date_y, bat_w=mw * 3 + 2,
                    big_w=bw, sec_w=sw, small_w=mw)


def week_images():
    """曜日: 液晶の文字と同じ傾きの太字 2 文字（IMG_WEEK は月曜始まり）"""
    paths = []
    f = font(700, 21 * S)
    for i, s_ in enumerate(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']):
        t = text_img(s_, f, LCD_ON, spacing=1.0)
        h = t.height
        w = t.width + int(h * SLANT) + 2 * S
        img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        img.paste(t, (0, 0))
        img = img.transform(img.size, Image.AFFINE, (1, SLANT, -h * SLANT, 0, 1, 0), resample=Image.BICUBIC)
        paths.append(save(shrink(img), f'week/{i}.png'))
    return paths


# ---------------------------------------------------------------- 常時表示（AOD）

def build_aod():
    img = Image.new('RGBA', (W * S, W * S), (0, 0, 0, 255))
    layer = canvas(W)
    d = ImageDraw.Draw(layer)
    x, y, w, h = LCD
    d.rectangle(sp([(x - 1.2, y - 1.2), (x + w + 1.2, y + h + 1.2)]), outline=AOD_DIM, width=int(1.4 * S))
    D = L['lcd']
    for yy in (D['time_y'] + D['big_h'] * 0.32, D['time_y'] + D['big_h'] * 0.68):
        cx = D['colon_x'] + (D['time_y'] + D['big_h'] - yy) * SLANT
        d.rectangle(sp([(cx - 3.4, yy - 3.4), (cx + 3.4, yy + 3.4)]), fill=AOD_LCD)
    text_at(layer, 'TOUGH Ti', x + 46, FRAME[1] + 20, 15, (90, 92, 96, 255), weight=700, spacing=1.0)
    img.alpha_composite(layer)
    L['aod_bg'] = save(shrink(img).convert('RGB'), 'aod_bg.png')


# ---------------------------------------------------------------- 書き出し

def preview(bg, hh=16, mm=37, ss=24, wday=5, month=10, day=18, bat=72):
    mask = Image.new('L', (W, W), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, W - 1, W - 1), fill=255)

    def open_(path):
        return Image.open(os.path.join(ROOT, 'assets', 'balance3', path)).convert('RGBA')

    def digits(img, arr, x, y, s_, step):
        for i, ch in enumerate(s_):
            img.alpha_composite(open_(arr[int(ch)]), (x + i * step, y))

    D = L['lcd']
    img = bg.convert('RGBA')
    img.alpha_composite(open_(D['week'][wday]), (D['week_x'], D['week_y']))
    digits(img, D['small'], D['month_x'], D['date_y'], f'{month:02d}', D['small_w'] + 2)
    digits(img, D['small'], D['day_x'], D['date_y'], f'{day:02d}', D['small_w'] + 2)
    b = str(bat)
    digits(img, D['small'], D['bat_x'] + D['bat_w'] - len(b) * (D['small_w'] + 1), D['bat_y'], b, D['small_w'] + 1)
    digits(img, D['big'], D['time_x'], D['time_y'], f'{hh:02d}', D['big_w'] + D['big_space'])
    digits(img, D['big'], D['min_x'], D['time_y'], f'{mm:02d}', D['big_w'] + D['big_space'])
    digits(img, D['sec'], D['sec_x'], D['sec_y'], f'{ss:02d}', D['sec_w'] + 2)
    out = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    out.save(os.path.join(ROOT, 'preview.png'))

    img = open_(L['aod_bg'])
    digits(img, D['big_aod'], D['time_x'], D['time_y'], f'{hh:02d}', D['big_w'] + D['big_space'])
    digits(img, D['big_aod'], D['min_x'], D['time_y'], f'{mm:02d}', D['big_w'] + D['big_space'])
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
    build_aod()
    preview(bg)
    L['icon'] = save(Image.open(os.path.join(ROOT, 'preview.png')).convert('RGBA').resize((124, 124), Image.LANCZOS), 'icon.png')
    with open(os.path.join(ROOT, 'watchface', 'layout.js'), 'w') as f:
        f.write('// tools/gen.py が作るファイル（手で編集しない）\nexport const L = ' + json.dumps(L, ensure_ascii=False, indent=1) + '\n')


if __name__ == '__main__':
    main()
