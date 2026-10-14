"""2 ページ目（タップで切り替え）: 気圧・高度・天気・日の入り・現在地・時刻・自宅周辺の地図。"""
import math

from PIL import Image, ImageDraw

from complications import paint_sun, paint_sunset
from gen_map import HOME, build_map, meters_per_px

ORANGE = (255, 140, 26, 255)
WHITE = (255, 255, 255, 255)
GRAY = (140, 140, 140, 255)
LINE = (55, 55, 55, 255)

MAP_Y = 324
MAP_H = 480 - MAP_Y


RING_IN = 213  # リングの内側の半径
RING_OUT = 240


def build_ring(g):
    font, save = g.font, g.save
    W, H, SS = g.W, g.H, g.SS
    big = Image.new('RGBA', (W * SS, H * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    c = W * SS / 2
    # 黒い帯と内側の細線
    d.ellipse([0, 0, W * SS - 1, H * SS - 1], fill=(0, 0, 0, 255))
    r = RING_IN * SS
    d.ellipse([c - r, c - r, c + r, c + r], fill=(0, 0, 0, 0))
    d.ellipse([c - r, c - r, c + r, c + r], outline=(60, 60, 60, 255), width=SS)

    def pt(deg, rad):
        a = math.radians(deg)
        return c + rad * SS * math.sin(a), c - rad * SS * math.cos(a)

    for q in range(96):  # 15 分ごと
        deg = q * 3.75
        h = q / 4
        if q % 8 == 0:
            continue  # 2 時間ごとは数字
        if q % 4 == 0:
            d.line([pt(deg, 222), pt(deg, 233)], fill=(200, 200, 200, 255), width=round(2.2 * SS))
        else:
            d.line([pt(deg, 226), pt(deg, 231)], fill=(90, 90, 90, 255), width=round(1.4 * SS))
    for hh in (0, 6, 12, 18):  # オレンジの印
        d.line([pt(hh * 15 - 2.2, 215), pt(hh * 15 - 2.2, 220)], fill=ORANGE, width=round(2.4 * SS))
        d.line([pt(hh * 15 + 2.2, 215), pt(hh * 15 + 2.2, 220)], fill=ORANGE, width=round(2.4 * SS))
    img = big.resize((W, H), Image.LANCZOS)

    f = font(500, 15)
    for hh in range(0, 24, 2):
        deg = hh * 15
        t = f'{hh:02d}'
        tw = math.ceil(f.getlength(t)) + 4
        lbl = Image.new('RGBA', (tw * 4, 20 * 4), (0, 0, 0, 0))
        text_center = g.text_center
        text_center(ImageDraw.Draw(lbl), tw * 2, 40, t, font(500, 60), (210, 210, 210, 255), spacing=2)
        lbl = lbl.resize((tw, 20), Image.LANCZOS)
        rot = -deg if not (90 < deg < 270) else 180 - deg  # 下半分は読める向きに
        lbl = lbl.rotate(rot, resample=Image.BICUBIC, expand=True)
        a = math.radians(deg)
        cx, cy = 240 + 227 * math.sin(a), 240 - 227 * math.cos(a)
        img.alpha_composite(lbl, (round(cx - lbl.width / 2), round(cy - lbl.height / 2)))

    # 動く印の画像（上向きに置いて中心で回す）
    now = Image.new('RGBA', (6 * SS, 20 * SS), (0, 0, 0, 0))
    ImageDraw.Draw(now).rounded_rectangle([0, 0, 6 * SS - 1, 20 * SS - 1], radius=2 * SS, fill=ORANGE)
    now = now.resize((6, 20), Image.LANCZOS)
    sun = Image.new('RGBA', (10 * SS, 10 * SS), (0, 0, 0, 0))
    ImageDraw.Draw(sun).polygon([(5 * SS, 0), (10 * SS, 5 * SS), (5 * SS, 10 * SS), (0, 5 * SS)], fill=(255, 196, 64, 255))
    sun = sun.resize((10, 10), Image.LANCZOS)
    layout = dict(src=save(img, 'p2/ring.png'),
                  now=dict(src=save(now, 'p2/ring_now.png'), pos_x=240 - 3, pos_y=240 - 236),
                  sun=dict(src=save(sun, 'p2/ring_sun.png'), pos_x=240 - 5, pos_y=240 - 222),
                  day_arc=dict(radius=216, width=3, color=0x6B5418),
                  rain_arc=dict(radius=237, width=5, color=0x3FA9F5))
    return img, layout


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

    # ---- 最上部: 状況で形・色が変わるアイコン列（HUD）。サーバーが描き HYROX Link が届ける
    L['hud'] = dict(x=180, y=56, w=120, h=34)  # 雨（傘 + 15 分刻み 8 本）

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
    # 座標と LINK（最終同期）は時計側で書き換えるので TEXT ウィジェットにする
    L['coords'] = dict(x=152, y=216, w=176, h=18, size=12, color=0x8C8C8C,
                       text=f'{HOME[0]:.3f}°N  {HOME[1]:.3f}°E')
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
    t_x = 144
    t_y = 248
    L['time'] = dict(hour_x=t_x, minute_x=t_x + tm.w * 2 + colon.width + 4, y=t_y, digits=tm.paths,
                     sec_x=t_x + tm.w * 4 + colon.width + 8, sec_y=t_y + tm.h - sec.h, sec=sec.paths)
    colon_y = round(t_y + (tm.h - colon.height) / 2)
    bg.alpha_composite(colon, (t_x + tm.w * 2 + 2, colon_y))
    d.line([(35, 320), (445, 320)], fill=LINE, width=1)

    # ---- 地図
    # bg には自宅周辺の固定地図。連携アプリ（HYROX Link）から届いた地図はその上に IMG で重ね、
    # さらに上に透過のオーバーレイ（グリッド・ラベル・縮尺）を重ねる
    mp = build_map(W, MAP_H).convert('RGBA')
    bg.alpha_composite(mp, (0, MAP_Y))
    hx, hy = 240, MAP_Y + MAP_H // 2
    halo = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    hd = ImageDraw.Draw(halo)
    hd.ellipse([hx - 14, hy - 14, hx + 14, hy + 14], fill=(255, 140, 26, 60))
    hd.ellipse([hx - 8, hy - 8, hx + 8, hy + 8], fill=WHITE)
    hd.ellipse([hx - 5, hy - 5, hx + 5, hy + 5], fill=ORANGE)
    bg.alpha_composite(halo)
    d = ImageDraw.Draw(bg)
    text_center(d, hx + 34, hy - 1, 'HOME', font(500, 12), WHITE, spacing=1)

    ov = Image.new('RGBA', (W, MAP_H), (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    for x in range(0, W, 40):
        od.line([(x, 0), (x, MAP_H)], fill=(255, 255, 255, 14))
    for y in range(0, MAP_H, 40):
        od.line([(0, y), (W, y)], fill=(255, 255, 255, 14))
    for y in range(18):  # 上端を黒へなじませる
        od.line([(0, y), (W, y)], fill=(0, 0, 0, round(255 * (1 - y / 18))))
    oy = lambda y: y - MAP_Y  # noqa: E731

    # 左: 歩数、右: 今日の移動距離
    text_center(od, 122, oy(380), 'STEPS', f_lab, GRAY, spacing=1)
    value('steps', xs, 122, 392, 'STEP', w=80)
    text_center(od, 358, oy(380), 'TRAIL', f_lab, GRAY, spacing=1)
    value('trail', xs, 358, 392, 'DISTANCE', w=80, unit_img=unit('km', xs, 11), sep='dot')

    # 縮尺 200m（サーバーの地図も同じズーム 16）
    px200 = round(200 / meters_per_px())
    sx0 = 240 - px200 // 2
    od.line([(sx0, oy(430)), (sx0 + px200, oy(430))], fill=(200, 200, 200, 255), width=2)
    for x in (sx0, sx0 + px200):
        od.line([(x, oy(425)), (x, oy(435))], fill=(200, 200, 200, 255), width=2)
    text_center(od, 240, oy(420), '200m', font(500, 11), (200, 200, 200, 255))
    text_center(od, 240, oy(446), '© OpenStreetMap', font(400, 9), (110, 110, 110, 255))
    L['map'] = dict(x=0, y=MAP_Y, w=W, h=MAP_H, overlay=save(ov, 'p2/map_overlay.png'))
    bg.alpha_composite(ov, (0, MAP_Y))

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
    text_center(ImageDraw.Draw(pv), 240, 225, L['coords']['text'], font(400, 12), GRAY)
    pv.alpha_composite(week_imgs[3], (L['week']['x'], L['week']['y']))
    day.draw(pv, '17', L['date']['day_x'], L['date']['day_y'])
    pv.alpha_composite(mon_imgs[8], (L['date']['month_x'], L['date']['month_y']))
    tm.draw(pv, '03', L['time']['hour_x'], t_y)
    tm.draw(pv, '56', L['time']['minute_x'], t_y)
    sec.draw(pv, '13', L['time']['sec_x'], L['time']['sec_y'])
    # ---- 縁: 24 時間の目盛りリング（固定部分）。動く部分（今の時刻・日の出入り・雨）は時計側で重ねる
    ring, ring_layout = build_ring(g)
    L['ring'] = ring_layout
    pv.alpha_composite(ring)
    return L, pv
