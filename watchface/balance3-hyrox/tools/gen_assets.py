#!/usr/bin/env python3
"""HYROX 風ウォッチフェイスの画像素材とレイアウト定数を生成する。

  python3 tools/gen_assets.py

出力:
  assets/balance3.r/images/...   ウォッチフェイス用 PNG
  watchface/layout.js            index.js が読み込む座標定数
  preview.png                    サンプル値を入れた完成イメージ
"""
import json
import math
import os

from PIL import Image, ImageDraw, ImageFont

from complications import CATALOG, SLOTS

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_DIR = os.path.join(ROOT, 'tools', 'fonts')
IMG_DIR = os.path.join(ROOT, 'assets', 'balance3.r', 'images')

W = H = 480
CX = CY = 240
SS = 4  # アイコン・弧のスーパーサンプリング倍率

YELLOW = (255, 230, 0, 255)
WHITE = (255, 255, 255, 255)
GRAY = (150, 150, 150, 255)
DIM = (95, 95, 95, 255)
TRACK = (70, 70, 70, 255)
DIVIDER = (60, 60, 60, 255)
BLACK = (0, 0, 0, 255)
AOD_GRAY = (170, 170, 170, 255)


def font(weight, size):
    return ImageFont.truetype(os.path.join(FONT_DIR, f'rubik-latin-{weight}-normal.woff'), size)


def save(img, rel):
    path = os.path.join(IMG_DIR, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    return 'images/' + rel


# ---------------------------------------------------------------- 数字フォント

class DigitSet:
    """0-9 を同じ幅・高さの画像にした等幅数字セット。y 座標は数字の上端。"""

    def __init__(self, name, weight, size, color, sx=1.0, extra=()):
        self.name = name
        f = font(weight, size)
        top = min(f.getbbox(d)[1] for d in '0123456789')
        bottom = max(f.getbbox(d)[3] for d in '0123456789')
        self.h = bottom - top
        adv = math.ceil(max(f.getlength(d) for d in '0123456789')) + 2
        self.w = round(adv * sx)
        self.glyphs = {}
        for ch in list('0123456789') + list(extra):
            # 数字は等幅にするため中央寄せ、記号は字幅どおり
            cw = adv if ch.isdigit() else math.ceil(f.getlength(ch)) + 4
            raw = Image.new('RGBA', (cw, self.h), (0, 0, 0, 0))
            ImageDraw.Draw(raw).text(((cw - f.getlength(ch)) / 2, -top), ch, font=f, fill=color)
            if sx != 1.0:
                raw = raw.resize((max(1, round(cw * sx)), self.h), Image.LANCZOS)
            self.glyphs[ch] = raw
        self.paths = [save(self.glyphs[d], f'{name}/{d}.png') for d in '0123456789']
        self.extra_paths = {ch: save(self.glyphs[ch], f'{name}/{ord(ch)}.png') for ch in extra}

    def text_width(self, s, space=0):
        return sum(self.glyphs[c].width for c in s) + space * (len(s) - 1)

    def draw(self, canvas, s, x, y, space=0):
        for c in s:
            g = self.glyphs[c]
            canvas.alpha_composite(g, (round(x), round(y)))
            x += g.width + space


def text_center(draw, cx, cy, s, f, fill, spacing=0):
    """文字列を (cx, cy) に中央寄せで描画（spacing は字間）。"""
    widths = [f.getlength(c) for c in s]
    total = sum(widths) + spacing * (len(s) - 1)
    l, t, r, b = f.getbbox(s)
    x = cx - total / 2
    y = cy - (t + b) / 2
    for c, w in zip(s, widths):
        draw.text((x, y), c, font=f, fill=fill)
        x += w + spacing


def label_image(s, f, fill, pad=2, spacing=0):
    l, t, r, b = f.getbbox(s)
    w = math.ceil(sum(f.getlength(c) for c in s) + spacing * (len(s) - 1)) + pad * 2
    img = Image.new('RGBA', (w, b - t + pad * 2), (0, 0, 0, 0))
    text_center(ImageDraw.Draw(img), w / 2, img.height / 2, s, f, fill, spacing)
    return img


# ---------------------------------------------------------------- アイコン

def icon(size, painter):
    big = Image.new('RGBA', (size * SS, size * SS), (0, 0, 0, 0))
    painter(ImageDraw.Draw(big), size * SS)
    return big.resize((size, size), Image.LANCZOS)


# ---------------------------------------------------------------- 表示枠

ICON_SIZE = 28
LABEL_W = 110
TIPS_W = 132


def slot_x(slot):
    return round(slot['cx'] - slot['w'] / 2)


def slot_geometry(slot, ds):
    """枠内の相対座標: 数字の上端 y と、アイコン/ラベルの中心 y。"""
    if slot['style'] == 'top':
        return dict(value_y=40, deco_cy=19)
    if slot['style'] == 'mid':
        return dict(value_y=6, deco_cy=47)
    return dict(value_y=6, deco_cy=50)


def build_complications(val_w, val_y):
    f_lab = font(400, 19)
    types = {}
    deco = {}
    for t in CATALOG:
        k = t['key']
        ic = icon(ICON_SIZE, t['icon'])
        li = label_image(t['label'], f_lab, GRAY)
        lab = Image.new('RGBA', (LABEL_W, li.height), (0, 0, 0, 0))
        lab.paste(li, ((LABEL_W - li.width) // 2, 0), li)
        deco[k] = (ic, lab)
        types[k] = dict(icon=save(ic, f'comp/icon/{k}.png'), label=save(lab, f'comp/label/{k}.png'),
                        label_h=lab.height, title=t['title'], unit=t.get('unit'), sep=t.get('sep'),
                        negative=bool(t.get('negative')))

    def ds_for(slot):
        return val_y if slot['style'] == 'mid' else val_w

    def render(slot, key):
        t = next(c for c in CATALOG if c['key'] == key)
        ds = ds_for(slot)
        g = slot_geometry(slot, ds)
        img = Image.new('RGBA', (slot['w'], slot['h']), (0, 0, 0, 0))
        text = t['sample'] + (t.get('unit') or '')
        ds.draw(img, text, (slot['w'] - ds.text_width(text)) / 2, g['value_y'])
        ic, lab = deco[key]
        if slot['style'] == 'mid':
            img.alpha_composite(lab, ((slot['w'] - LABEL_W) // 2, round(g['deco_cy'] - lab.height / 2)))
        else:
            img.alpha_composite(ic, ((slot['w'] - ICON_SIZE) // 2, round(g['deco_cy'] - ICON_SIZE / 2)))
        return img

    # 編集画面用の素材（枠の形ごと）
    styles = {}
    for slot in SLOTS:
        st = slot['style']
        if st in styles:
            continue
        w, h = slot['w'], slot['h']
        sel = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        ImageDraw.Draw(sel).rounded_rectangle([1, 1, w - 2, h - 2], radius=12, outline=YELLOW, width=3)
        unsel = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        ImageDraw.Draw(unsel).rounded_rectangle([1, 1, w - 2, h - 2], radius=12,
                                                outline=(120, 120, 120, 255), width=2)
        styles[st] = dict(select=save(sel, f'comp/edit/{st}_select.png'),
                          unselect=save(unsel, f'comp/edit/{st}_unselect.png'),
                          preview={c['key']: save(render(slot, c['key']), f'comp/preview/{st}/{c["key"]}.png')
                                   for c in CATALOG})

    tips = Image.new('RGBA', (TIPS_W, 36), (0, 0, 0, 0))
    ImageDraw.Draw(tips).rounded_rectangle([0, 0, TIPS_W - 1, 35], radius=18, fill=YELLOW)
    tips_path = save(tips, 'comp/edit/tips.png')

    slots = []
    for slot in SLOTS:
        ds = ds_for(slot)
        g = slot_geometry(slot, ds)
        x = slot_x(slot)
        tips_y = -40 if slot['style'] == 'bot' else slot['h'] + 4
        slots.append(dict(
            edit_id=slot['edit_id'], style=slot['style'], x=x, y=slot['y'], w=slot['w'], h=slot['h'],
            default=slot['default'],
            value=dict(x=x, y=slot['y'] + g['value_y'], w=slot['w'], h=ds.h),
            icon=dict(x=round(slot['cx'] - ICON_SIZE / 2), y=round(slot['y'] + g['deco_cy'] - ICON_SIZE / 2)),
            label=dict(x=round(slot['cx'] - LABEL_W / 2), cy=slot['y'] + g['deco_cy']),
            font='y' if ds is val_y else 'w',
            tips_x=(slot['w'] - TIPS_W) // 2, tips_y=tips_y,
        ))

    def font_info(ds):
        return dict(digits=ds.paths, invalid=ds.extra_paths['-'], negative=ds.extra_paths['-'],
                    dot=ds.extra_paths['.'], colon=ds.extra_paths[':'],
                    units={'%': ds.extra_paths['%'], '°': ds.extra_paths['°']})

    # 編集モードのマスク
    mask100 = Image.new('RGBA', (W, H), (0, 0, 0, 255))
    mask70 = Image.new('RGBA', (W, H), (0, 0, 0, 178))
    blank = Image.new('RGBA', (8, 8), (0, 0, 0, 0))

    return dict(render=render, layout=dict(
        types=types, order=[c['key'] for c in CATALOG], slots=slots, edit_styles=styles,
        tips=tips_path, fonts=dict(w=font_info(val_w), y=font_info(val_y)),
        mask100=save(mask100, 'comp/edit/mask100.png'), mask70=save(mask70, 'comp/edit/mask70.png'),
        blank=save(blank, 'comp/blank.png'),
    ))


# ---------------------------------------------------------------- 外周の弧

ARC_R = 228
ARC_W = 8
ARC_LEVELS = 11  # 0%,10%,...,100%


def arc_point(deg, r):
    a = math.radians(deg)  # 時計回り、0°=12時
    return CX + r * math.sin(a), CY - r * math.cos(a)


def draw_arc(d, a_from, a_to, color, scale):
    lo, hi = sorted((a_from, a_to))
    if hi - lo < 0.01:
        return
    r = ARC_R * scale
    c = CX * scale
    w = ARC_W * scale
    # PIL の arc は 0°=3時・時計回りなので -90 ずらす
    d.arc([c - r - w / 2, c - r - w / 2, c + r + w / 2, c + r + w / 2],
          lo - 90, hi - 90, fill=color, width=round(w))
    for a in (lo, hi):  # 丸いキャップ
        x, y = arc_point(a, ARC_R)
        d.ellipse([(x - ARC_W / 2) * scale, (y - ARC_W / 2) * scale,
                   (x + ARC_W / 2) * scale, (y + ARC_W / 2) * scale], fill=color)


# 各弧: 縦軸側(start)から外側(end)へ伸びる
ARCS = {
    'tl': (-4, -78),
    'tr': (4, 78),
    'bl': (184, 258),
    'br': (176, 102),
}


def arc_bbox(a_from, a_to):
    pts = [arc_point(a_from + (a_to - a_from) * i / 50, ARC_R) for i in range(51)]
    pad = ARC_W / 2 + 2
    x0 = math.floor(min(p[0] for p in pts) - pad)
    y0 = math.floor(min(p[1] for p in pts) - pad)
    x1 = math.ceil(max(p[0] for p in pts) + pad)
    y1 = math.ceil(max(p[1] for p in pts) + pad)
    return x0, y0, x1, y1


def arc_level_image(a_from, a_to, ratio):
    big = Image.new('RGBA', (W * SS, H * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    draw_arc(d, a_from, a_to, TRACK, SS)
    if ratio > 0:
        draw_arc(d, a_from, a_from + (a_to - a_from) * ratio, YELLOW, SS)
    full = big.resize((W, H), Image.LANCZOS)
    return full.crop(arc_bbox(a_from, a_to))


# ---------------------------------------------------------------- 生成

def main():
    layout = {}

    # 数字セット
    time_big = DigitSet('time', 700, 124, WHITE, sx=0.78)
    time_aod = DigitSet('time_aod', 500, 124, AOD_GRAY, sx=0.78)
    sec = DigitSet('sec', 700, 44, YELLOW, sx=0.88)
    val_w = DigitSet('val_w', 700, 34, WHITE, sx=0.86, extra='%-.:°')
    val_y = DigitSet('val_y', 700, 32, YELLOW, sx=0.86, extra='%-.:°')
    day = DigitSet('day', 700, 34, WHITE, sx=0.86)

    # ---- 時刻
    colon = label_image(':', font(700, 124), WHITE, pad=0)
    colon_aod = label_image(':', font(500, 124), AOD_GRAY, pad=0)
    gap = 2
    total = time_big.w * 4 + colon.width + gap * 2
    tx = CX + 4 - total / 2
    ty = 210
    hour_x = round(tx)
    colon_x = round(tx + time_big.w * 2 + gap)
    minute_x = round(tx + time_big.w * 2 + gap * 2 + colon.width)
    # コロンの縦位置: 数字の中央に合わせる
    colon_y = round(ty + (time_big.h - colon.height) / 2)
    layout['time'] = dict(hour_x=hour_x, minute_x=minute_x, y=ty,
                          hour=time_big.paths, aod=time_aod.paths)
    layout['colon_aod'] = dict(x=colon_x, y=colon_y, src=save(colon_aod, 'time_aod/colon.png'))

    sec_cx, sec_y = 428, 258
    layout['sec'] = dict(x=round(sec_cx - sec.w), y=sec_y, digits=sec.paths)

    # AM/PM: 背景に暗い文字、点灯側は白画像を重ねる
    f_ampm = font(500, 19)
    am_img = label_image('A.M.', f_ampm, WHITE)
    pm_img = label_image('P.M.', f_ampm, WHITE)
    am_pos = (round(58 - am_img.width / 2), round(238 - am_img.height / 2))
    pm_pos = (round(58 - pm_img.width / 2), round(276 - pm_img.height / 2))
    layout['ampm'] = dict(am_x=am_pos[0], am_y=am_pos[1], pm_x=pm_pos[0], pm_y=pm_pos[1],
                          am=save(am_img, 'ampm/am.png'), pm=save(pm_img, 'ampm/pm.png'))

    # ---- 曜日（ハイライト済みの行全体を 7 枚）
    days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    day_cx = [72, 128, 184, 240, 296, 352, 408]
    row_x, row_y, row_w, row_h = 36, 309, 408, 32
    f_day = font(400, 20)
    f_day_b = font(700, 20)
    week_paths = []
    week_imgs = []
    for i in range(7):
        img = Image.new('RGBA', (row_w, row_h), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        for j, (name, cx) in enumerate(zip(days, day_cx)):
            lx = cx - row_x
            if i == j:
                d.rounded_rectangle([lx - 25, 3, lx + 25, row_h - 3], radius=7, fill=YELLOW)
                text_center(d, lx, row_h / 2, name, f_day_b, BLACK)
            else:
                text_center(d, lx, row_h / 2, name, f_day, GRAY)
        week_imgs.append(img)
        week_paths.append(save(img, f'week/{i + 1}.png'))
    layout['week'] = dict(x=row_x, y=row_y, src=week_paths)

    # ---- 日付（月の代わり）
    date_cx, date_cy, date_r = 240, 72, 41
    months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
    f_mon = font(700, 15)
    mon_w = max(math.ceil(sum(f_mon.getlength(c) for c in m) + 2 * 2) for m in months) + 4
    mon_imgs = []
    for m in months:
        li = label_image(m, f_mon, YELLOW, spacing=2)
        canvas = Image.new('RGBA', (mon_w, li.height), (0, 0, 0, 0))
        canvas.paste(li, ((mon_w - li.width) // 2, 0), li)
        mon_imgs.append(canvas)
    mon_paths = [save(img, f'month/{i + 1}.png') for i, img in enumerate(mon_imgs)]
    mon_y = 47
    day_y = 67
    layout['date'] = dict(month_x=round(date_cx - mon_w / 2), month_y=mon_y, month=mon_paths,
                          day_x=round(date_cx - day.w), day_y=day_y, day=day.paths)

    # ---- 表示枠（コンプリケーション）
    comp = build_complications(val_w, val_y)
    layout.update(comp['layout'])

    # ---- 外周の弧（IMG_LEVEL 用、各 11 段階）
    arc_kinds = {'tl': 'STEP', 'tr': 'BATTERY', 'bl': 'CAL', 'br': 'HEART'}
    layout['arcs'] = {}
    arc_imgs = {}
    for key, (a0, a1) in ARCS.items():
        x0, y0, _, _ = arc_bbox(a0, a1)
        imgs = [arc_level_image(a0, a1, i / (ARC_LEVELS - 1)) for i in range(ARC_LEVELS)]
        arc_imgs[key] = (x0, y0, imgs)
        layout['arcs'][key] = dict(x=x0, y=y0, kind=arc_kinds[key],
                                   src=[save(img, f'arc_{key}/{i}.png') for i, img in enumerate(imgs)])

    # ---- 背景
    bg = Image.new('RGBA', (W, H), BLACK)
    d = ImageDraw.Draw(bg)

    # 日付の円
    big = Image.new('RGBA', (W * SS, H * SS), (0, 0, 0, 0))
    bd = ImageDraw.Draw(big)
    r = date_r * SS
    bd.ellipse([date_cx * SS - r, date_cy * SS - r, date_cx * SS + r, date_cy * SS + r],
               fill=(28, 28, 28, 255), outline=(75, 75, 75, 255), width=2 * SS)
    bg.alpha_composite(big.resize((W, H), Image.LANCZOS))

    # 区切り線
    for x in (174, 306):
        d.line([(x, 146), (x, 202)], fill=DIVIDER, width=2)

    text_center(d, 58, 238, 'A.M.', f_ampm, DIM)
    text_center(d, 58, 276, 'P.M.', f_ampm, DIM)
    text_center(d, 428, 240, 'SEC', font(500, 19), GRAY)

    bg.alpha_composite(colon, (colon_x, colon_y))

    text_center(d, 240, 368, 'HYROX', font(500, 27), WHITE, spacing=7)
    text_center(d, 240, 404, 'amazfit', font(600, 34), (120, 120, 120, 255), spacing=-1)

    # 円形にマスク
    mask = Image.new('L', (W * SS, H * SS), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, W * SS - 1, H * SS - 1], fill=255)
    mask = mask.resize((W, H), Image.LANCZOS)
    bg_out = Image.new('RGBA', (W, H), (0, 0, 0, 255))
    bg_out.paste(bg, (0, 0), mask)
    layout['bg'] = save(bg_out.convert('RGB').convert('RGBA'), 'bg.png')

    # ---- プレビュー（サンプル値）
    pv = bg_out.copy()
    for key, level in [('tl', 7), ('tr', 8), ('bl', 5), ('br', 6)]:
        x0, y0, imgs = arc_imgs[key]
        pv.alpha_composite(imgs[level], (x0, y0))

    time_big.draw(pv, '09', hour_x, ty)
    time_big.draw(pv, '24', minute_x, ty)
    sec.draw(pv, '25', layout['sec']['x'], sec_y)
    pv.alpha_composite(am_img, am_pos)
    pv.alpha_composite(week_imgs[2], (row_x, row_y))
    pv.alpha_composite(mon_imgs[9], (layout['date']['month_x'], mon_y))
    day.draw(pv, '14', layout['date']['day_x'], day_y)
    base = pv.copy()
    for slot in SLOTS:
        pv.alpha_composite(comp['render'](slot, slot['default']), (slot_x(slot), slot['y']))
    pv.save(os.path.join(ROOT, 'preview.png'))

    # 表示枠を入れ替えた例
    alt = base.copy()
    alt_keys = ['READINESS', 'SPO2', 'RECOVERY_TIME', 'DISTANCE', 'PAI_DAILY', 'SUN_SET', 'WEATHER_CURRENT']
    for slot, key in zip(SLOTS, alt_keys):
        alt.alpha_composite(comp['render'](slot, key), (slot_x(slot), slot['y']))
    alt.save(os.path.join(ROOT, 'preview_alt.png'))

    # ウォッチフェイス一覧用アイコン
    icon_img = pv.resize((240, 240), Image.LANCZOS)
    layout['icon'] = save(icon_img, 'icon.png')

    with open(os.path.join(ROOT, 'watchface', 'layout.js'), 'w') as fp:
        fp.write('// tools/gen_assets.py が生成。直接編集しないこと。\n')
        fp.write('export const L = ')
        json.dump(layout, fp, indent=2, ensure_ascii=False)
        fp.write('\n')


if __name__ == '__main__':
    main()
