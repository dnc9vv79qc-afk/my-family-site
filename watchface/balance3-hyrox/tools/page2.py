"""2 ページ目（タップで切り替え）: 気圧・高度・天気・日の入り・現在地・時刻・自宅周辺の地図。"""
from PIL import Image, ImageDraw

from complications import paint_sun, paint_sunset
from gen_map import HOME, build_map, meters_per_px

ORANGE = (255, 140, 26, 255)
WHITE = (255, 255, 255, 255)
GRAY = (140, 140, 140, 255)
LINE = (55, 55, 55, 255)

MAP_Y = 324
MAP_H = 480 - MAP_Y


def build(g):
    """g は gen_assets モジュール（共通の描画ヘルパーを使う）。"""
    font, save, label_image, text_center = g.font, g.save, g.label_image, g.text_center
    W, H = g.W, g.H

    val = g.DigitSet('p2_val', 700, 34, WHITE, sx=0.86, extra='%-.:°')
    mid = g.DigitSet('p2_mid', 700, 26, WHITE, sx=0.88, extra='%-.:°')
    xs = g.DigitSet('p2_xs', 500, 18, WHITE, sx=0.9, extra='-.')
    tm = g.DigitSet('p2_time', 700, 92, WHITE, sx=0.82)
    sec = g.DigitSet('p2_sec', 700, 30, WHITE, sx=0.88)
    day = g.DigitSet('p2_day', 700, 24, WHITE, sx=0.9)

    def unit(text, ds, size=13):
        """数字の高さに合わせ、下寄せした小さな単位画像。"""
        f = font(500, size)
        li = label_image(text, f, GRAY, pad=1)
        img = Image.new('RGBA', (li.width + 2, ds.h), (0, 0, 0, 0))
        img.paste(li, (2, ds.h - li.height), li)
        return img

    L = {}
    bg = Image.new('RGBA', (W, H), (0, 0, 0, 255))
    d = ImageDraw.Draw(bg)
    f_lab = font(500, 14)

    def label(cx, cy, s, color=GRAY, f=f_lab, spacing=1):
        text_center(d, cx, cy, s, f, color, spacing=spacing)

    def value(name, ds, cx, y, kind, w=110, unit_img=None, sep=None, negative=False, align='c'):
        L[name] = dict(x=round(cx - w / 2) if align == 'c' else cx, y=y, w=w, h=ds.h, kind=kind,
                       font=ds.paths, invalid=ds.extra_paths.get('-') or ds.paths[0], align=align,
                       unit=save(unit_img, f'p2/unit_{name}.png') if unit_img else None,
                       dot=ds.extra_paths.get({'dot': '.', 'colon': ':'}.get(sep)) if sep else None,
                       negative=ds.extra_paths.get('-') if negative else None)

    # ---- 1 段目: 気圧 / 高度 / 気温
    for x in (183, 297):
        d.line([(x, 96), (x, 158)], fill=LINE, width=1)
    label(125, 104, 'PRES')
    value('pres', val, 125, 116, 'ALTIMETER', unit_img=unit('hPa', val))
    label(240, 104, 'ALT')
    value('alt', val, 240, 116, 'ALTITUDE', unit_img=unit('m', val), negative=True)
    sun = g.icon(22, paint_sun)
    bg.alpha_composite(sun, (355 - 11, 104 - 11))
    value('temp', val, 355, 116, 'WEATHER_CURRENT', unit_img=unit('°', val, 16), negative=True)
    label(326, 152, 'H', f=font(500, 13))
    value('high', xs, 334, 146, 'WEATHER_HIGH', w=28, negative=True, align='l')
    label(366, 152, 'L', f=font(500, 13))
    value('low', xs, 374, 146, 'WEATHER_LOW', w=28, negative=True, align='l')
    d.line([(56, 166), (424, 166)], fill=LINE, width=1)

    # ---- 2 段目: 日の入り / 現在地 / バッテリー
    for x in (150, 330):
        d.line([(x, 176), (x, 228)], fill=LINE, width=1)
    ss = g.icon(18, paint_sunset)
    bg.alpha_composite(ss, (62 - 9, 188 - 9))
    label(104, 188, 'SUNSET')
    value('sunset', mid, 95, 202, 'SUN_SET', w=100, sep='colon')
    label(240, 182, 'LOC')
    L['place'] = dict(x=152, y=191, w=176, h=24, size=19, space=2, color=0xFFFFFF)
    label(240, 225, f'{HOME[0]:.3f}°N  {HOME[1]:.3f}°E', f=font(400, 12), spacing=0)
    label(372, 188, 'BAT')
    bars = []
    for lv in range(6):
        im = Image.new('RGBA', (34, 16), (0, 0, 0, 0))
        bd = ImageDraw.Draw(im)
        for i in range(5):
            hgt = 4 + i * 3
            bd.rectangle([i * 7, 16 - hgt, i * 7 + 4, 15], fill=ORANGE if i < lv else LINE)
        bars.append(save(im, f'p2/bat/{lv}.png'))
    L['bat_bars'] = dict(x=392, y=180, src=bars)
    value('bat', mid, 385, 202, 'BATTERY', w=90, unit_img=unit('%', mid))
    d.line([(30, 238), (450, 238)], fill=LINE, width=1)

    # ---- 3 段目: 曜日・日付 / 時刻
    f_week = font(500, 22)
    weeks = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
    week_imgs = [label_image(s, f_week, WHITE, spacing=2) for s in weeks]
    ww = max(i.width for i in week_imgs)
    week_paths = []
    for i, im in enumerate(week_imgs):
        c = Image.new('RGBA', (ww, im.height), (0, 0, 0, 0))
        c.paste(im, (0, 0), im)
        week_imgs[i] = c
        week_paths.append(save(c, f'p2/week/{i + 1}.png'))
    L['week'] = dict(x=58, y=254, src=week_paths)
    f_mon = font(500, 18)
    months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
    mon_imgs = []
    for m in months:
        li = label_image(m, f_mon, GRAY, pad=0, spacing=1)
        c = Image.new('RGBA', (li.width + 2, day.h), (0, 0, 0, 0))
        c.paste(li, (2, day.h - li.height), li)
        mon_imgs.append(c)
    mon_paths = [save(im, f'p2/month/{i + 1}.png') for i, im in enumerate(mon_imgs)]
    L['date'] = dict(day_x=58, day_y=286, day=day.paths, month_x=58 + day.w * 2 + 6, month_y=286,
                     month=mon_paths)

    colon = label_image(':', font(700, 92), WHITE, pad=0)
    t_x = 150
    t_y = 248
    L['time'] = dict(hour_x=t_x, minute_x=t_x + tm.w * 2 + colon.width + 4, y=t_y, digits=tm.paths,
                     sec_x=t_x + tm.w * 4 + colon.width + 8, sec_y=t_y + tm.h - sec.h, sec=sec.paths)
    colon_y = round(t_y + (tm.h - colon.height) / 2)
    bg.alpha_composite(colon, (t_x + tm.w * 2 + 2, colon_y))
    d.line([(35, 320), (445, 320)], fill=LINE, width=1)

    # ---- 地図
    mp = build_map(W, MAP_H).convert('RGBA')
    bg.alpha_composite(mp, (0, MAP_Y))
    grid = Image.new('RGBA', (W, MAP_H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    for x in range(0, W, 40):
        gd.line([(x, 0), (x, MAP_H)], fill=(255, 255, 255, 14))
    for y in range(0, MAP_H, 40):
        gd.line([(0, y), (W, y)], fill=(255, 255, 255, 14))
    # 上端を黒へなじませる
    for y in range(18):
        gd.line([(0, y), (W, y)], fill=(0, 0, 0, round(255 * (1 - y / 18))))
    bg.alpha_composite(grid, (0, MAP_Y))
    d = ImageDraw.Draw(bg)

    hx, hy = 240, MAP_Y + MAP_H // 2
    halo = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    hd = ImageDraw.Draw(halo)
    hd.ellipse([hx - 14, hy - 14, hx + 14, hy + 14], fill=(255, 140, 26, 60))
    hd.ellipse([hx - 8, hy - 8, hx + 8, hy + 8], fill=WHITE)
    hd.ellipse([hx - 5, hy - 5, hx + 5, hy + 5], fill=ORANGE)
    bg.alpha_composite(halo)
    text_center(d, hx + 34, hy - 1, 'HOME', font(500, 12), WHITE, spacing=1)

    # 左: 歩数、右: 今日の移動距離
    label(100, 384, 'STEPS')
    value('steps', xs, 100, 396, 'STEP', w=80)
    label(380, 384, 'TRAIL')
    value('trail', xs, 380, 396, 'DISTANCE', w=80, unit_img=unit('km', xs, 11), sep='dot')

    # 縮尺 200m
    px200 = round(200 / meters_per_px())
    sx0 = 240 - px200 // 2
    d.line([(sx0, 444), (sx0 + px200, 444)], fill=(200, 200, 200, 255), width=2)
    for x in (sx0, sx0 + px200):
        d.line([(x, 439), (x, 449)], fill=(200, 200, 200, 255), width=2)
    text_center(d, 240, 434, '200m', font(500, 11), (200, 200, 200, 255))
    text_center(d, 240, 461, '© OpenStreetMap', font(400, 9), (110, 110, 110, 255))

    # 円形にマスク
    mask = Image.new('L', (W * g.SS, H * g.SS), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, W * g.SS - 1, H * g.SS - 1], fill=255)
    mask = mask.resize((W, H), Image.LANCZOS)
    out = Image.new('RGBA', (W, H), (0, 0, 0, 255))
    out.paste(bg, (0, 0), mask)
    L['bg'] = save(out, 'p2/bg.png')

    # ---- プレビュー
    pv = out.copy()

    def put(name, ds, s, unit_name=None):
        c = L[name]
        width = ds.text_width(s) + (Image.open(g.IMG_DIR + '/' + c['unit'][7:]).width if c['unit'] else 0)
        x = c['x'] + (c['w'] - width) / 2 if c['align'] == 'c' else c['x']
        ds.draw(pv, s, x, c['y'])
        if c['unit']:
            u = Image.open(g.IMG_DIR + '/' + c['unit'][7:])
            pv.alpha_composite(u, (round(x + ds.text_width(s)), c['y']))

    put('pres', val, '1016')
    put('alt', val, '2')
    put('temp', val, '27')
    put('high', xs, '28')
    put('low', xs, '18')
    put('sunset', mid, '17:25')
    put('bat', mid, '81')
    pv.alpha_composite(Image.open(g.IMG_DIR + '/p2/bat/5.png'), (L['bat_bars']['x'], L['bat_bars']['y']))
    put('steps', xs, '1918')
    put('trail', xs, '3.42')
    text_center(ImageDraw.Draw(pv), L['place']['x'] + L['place']['w'] / 2, L['place']['y'] + 12,
                'NISHIKU KUJO', font(500, 19), WHITE, spacing=2)
    pv.alpha_composite(week_imgs[3], (L['week']['x'], L['week']['y']))
    day.draw(pv, '17', L['date']['day_x'], L['date']['day_y'])
    pv.alpha_composite(mon_imgs[8], (L['date']['month_x'], L['date']['month_y']))
    tm.draw(pv, '03', L['time']['hour_x'], t_y)
    tm.draw(pv, '56', L['time']['minute_x'], t_y)
    sec.draw(pv, '13', L['time']['sec_x'], L['time']['sec_y'])
    return L, pv
