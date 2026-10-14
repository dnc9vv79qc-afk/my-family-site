"""2 ページ目（タップで切り替え）: 気圧・高度・天気・日の入り・現在地・時刻・自宅周辺の地図。"""
import math

from PIL import Image, ImageDraw

from complications import paint_sun, paint_sunset
from gen_map import HOME, build_map, meters_per_px

ORANGE = (255, 140, 26, 255)  # 機能色だけ（今の時刻・現在地・ルート・電池低下）
WHITE = (255, 255, 255, 255)  # 時刻だけ
VAL = (214, 214, 214, 255)  # その他の値
GRAY = (128, 128, 128, 255)  # ラベル
DIM = (96, 96, 96, 255)  # 単位
LINE = (58, 58, 58, 255)  # 区切り線

MAP_Y = 320
MAP_H = 480 - MAP_Y


RING_IN = 213  # リングの内側の半径
RING_OUT = 240


def tint(img, color):
    """アイコンを単色に塗り替える（形はアルファから）。"""
    out = Image.new('RGBA', img.size, color[:3] + (0,))
    out.putalpha(img.getchannel('A'))
    return out


def build_ring(g):
    font, save = g.font, g.save
    W, H, SS = g.W, g.H, g.SS
    big = Image.new('RGBA', (W * SS, H * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    c = W * SS / 2

    def circle(rad, **kw):
        r = rad * SS
        d.ellipse([c - r, c - r, c + r, c + r], **kw)

    # 帯: 外側ほど暗い、ごく弱いグラデーションで文字盤と分ける
    for rad in range(RING_OUT, RING_IN - 1, -1):
        t = (RING_OUT - rad) / (RING_OUT - RING_IN)
        v = round(6 + 14 * t)
        circle(rad, fill=(v, v, v + 1, 255))
    circle(RING_IN, fill=(0, 0, 0, 0))
    # 細い二重線（内側の縁）と外周の線
    circle(RING_IN, outline=(92, 92, 92, 255), width=SS)
    circle(RING_IN - 3, outline=(40, 40, 40, 255), width=SS)
    circle(RING_OUT - 1, outline=(34, 34, 34, 255), width=SS)

    def pt(deg, rad):
        a = math.radians(deg)
        return c + rad * SS * math.sin(a), c - rad * SS * math.cos(a)

    # 目盛り: 1 時間 > 30 分 > 15 分 で長さ・太さ・明るさを変える。2 時間ごとは数字
    for q in range(96):
        deg = q * 3.75
        if q % 8 == 0:
            d.line([pt(deg, 214), pt(deg, 217)], fill=(150, 150, 150, 255), width=round(1.6 * SS))
            continue
        if q % 4 == 0:
            d.line([pt(deg, 216), pt(deg, 232)], fill=(205, 205, 205, 255), width=round(2.4 * SS))
        elif q % 2 == 0:
            d.line([pt(deg, 216), pt(deg, 226)], fill=(125, 125, 125, 255), width=round(1.5 * SS))
        else:
            d.line([pt(deg, 216), pt(deg, 222)], fill=(70, 70, 70, 255), width=round(1.0 * SS))
    img = big.resize((W, H), Image.LANCZOS)

    for hh in range(0, 24, 2):
        deg = hh * 15
        t = f'{hh:02d}'
        tw = math.ceil(font(500, 15).getlength(t)) + 4
        lbl = Image.new('RGBA', (tw * 4, 20 * 4), (0, 0, 0, 0))
        main = hh % 6 == 0
        g.text_center(ImageDraw.Draw(lbl), tw * 2, 40, t, font(700 if main else 500, 60),
                      (235, 235, 235, 255) if main else (165, 165, 165, 255), spacing=2)
        lbl = lbl.resize((tw, 20), Image.LANCZOS)
        a = math.radians(deg)
        cx, cy = 240 + 227 * math.sin(a), 240 - 227 * math.cos(a)  # 数字は回さず正立
        img.alpha_composite(lbl, (round(cx - lbl.width / 2), round(cy - lbl.height / 2)))

    # 動く印の画像（上向きに置いて中心で回す）
    now = Image.new('RGBA', (8 * SS, 17 * SS), (0, 0, 0, 0))  # 数字にかからない長さで内側へ
    nd = ImageDraw.Draw(now)
    nd.rounded_rectangle([0, 0, 8 * SS - 1, 17 * SS - 1], radius=2 * SS, fill=(0, 0, 0, 255))
    nd.rounded_rectangle([SS, SS, 7 * SS - 1, 16 * SS - 1], radius=2 * SS, fill=ORANGE)
    now = now.resize((8, 17), Image.LANCZOS)
    # 日の出・日の入り: 内側を指す小さな三角
    sun = Image.new('RGBA', (10 * SS, 8 * SS), (0, 0, 0, 0))
    ImageDraw.Draw(sun).polygon([(0, 0), (10 * SS, 0), (5 * SS, 8 * SS)], fill=(225, 225, 225, 255))
    sun = sun.resize((10, 8), Image.LANCZOS)
    layout = dict(src=save(img, 'p2/ring.png'),
                  now=dict(src=save(now, 'p2/ring_now.png'), pos_x=240 - 4, pos_y=240 - 222),
                  sun=dict(src=save(sun, 'p2/ring_sun.png'), pos_x=240 - 5, pos_y=240 - 210),
                  day_arc=dict(radius=206, width=2, color=0x7A4A14),
                  rain_arc=dict(radius=237, width=5, color=0x3FA9F5))
    return img, layout


def build(g):
    """g は gen_assets モジュール（共通の描画ヘルパーを使う）。"""
    font, save, label_image, text_center = g.font, g.save, g.label_image, g.text_center
    W, H = g.W, g.H

    val = g.DigitSet('p2_val', 700, 32, VAL, sx=0.86, extra='%-.:°')
    mid = g.DigitSet('p2_mid', 700, 24, VAL, sx=0.88, extra='%-.:°')
    xs = g.DigitSet('p2_xs', 500, 17, VAL, sx=0.9, extra='-.')
    tm = g.DigitSet('p2_time', 700, 84, WHITE, sx=0.82)
    sec = g.DigitSet('p2_sec', 700, 28, VAL, sx=0.88)
    day = g.DigitSet('p2_day', 700, 22, VAL, sx=0.9)

    def unit(text, ds, size=13):
        """数字の高さに合わせ、下寄せした小さな単位画像。"""
        f = font(500, size)
        li = label_image(text, f, DIM, pad=1)
        img = Image.new('RGBA', (li.width + 2, ds.h), (0, 0, 0, 0))
        img.paste(li, (2, ds.h - li.height), li)
        return img

    L = {}
    bg = Image.new('RGBA', (W, H), (0, 0, 0, 255))
    d = ImageDraw.Draw(bg)
    f_lab = font(500, 13)

    def label(cx, cy, s, color=GRAY, f=f_lab, spacing=2):
        text_center(d, cx, cy, s, f, color, spacing=spacing)

    def value(name, ds, cx, y, kind, w=110, unit_img=None, sep=None, negative=False, align='c'):
        L[name] = dict(x=round(cx - w / 2) if align == 'c' else cx, y=y, w=w, h=ds.h, kind=kind,
                       font=ds.paths, invalid=ds.extra_paths.get('-') or ds.paths[0], align=align,
                       unit=save(unit_img, f'p2/unit_{name}.png') if unit_img else None,
                       dot=ds.extra_paths.get({'dot': '.', 'colon': ':'}.get(sep)) if sep else None,
                       negative=ds.extra_paths.get('-') if negative else None)

    def rule(y, x0, x1):
        """段の区切り線。両端に短い縦の止め。"""
        d.line([(x0, y), (x1, y)], fill=LINE, width=1)
        for x in (x0, x1):
            d.line([(x, y - 3), (x, y + 3)], fill=LINE, width=1)

    def vline(x, y0, y1):
        d.line([(x, y0), (x, y1)], fill=LINE, width=1)

    # ---- 最上部: 雨（傘 + 15 分刻み 8 本）。サーバーが描き HYROX Link が届ける
    L['hud'] = dict(x=180, y=40, w=120, h=34)

    # ---- 1 段目 (80-146): 気圧 / 高度 / 天気
    for x in (183, 297):
        vline(x, 86, 142)
    label(130, 92, 'PRES')
    value('pres', val, 130, 104, 'ALTIMETER', unit_img=unit('hPa', val))
    label(240, 92, 'ALT')
    value('alt', val, 240, 104, 'ALTITUDE', unit_img=unit('m', val), negative=True)
    sun = g.icon(20, paint_sun)  # 黄色は天気アイコンだけ
    bg.alpha_composite(sun, (318 - 10, 92 - 10))
    label(352, 92, 'WX')
    value('temp', val, 350, 104, 'WEATHER_CURRENT', unit_img=unit('°', val, 15), negative=True)
    label(326, 140, 'H', f=font(500, 12), spacing=0)
    value('high', xs, 334, 134, 'WEATHER_HIGH', w=28, negative=True, align='l')
    label(366, 140, 'L', f=font(500, 12), spacing=0)
    value('low', xs, 374, 134, 'WEATHER_LOW', w=28, negative=True, align='l')
    rule(152, 50, 430)

    # ---- 2 段目 (152-220): 日の入り / 現在地 / バッテリー
    for x in (150, 330):
        vline(x, 160, 212)
    ss = tint(g.icon(16, paint_sunset), GRAY)
    bg.alpha_composite(ss, (66 - 8, 170 - 8))
    label(108, 170, 'SUNSET')
    value('sunset', mid, 97, 182, 'SUN_SET', w=100, sep='colon')
    label(240, 170, 'LOCATION')
    L['place'] = dict(x=152, y=177, w=176, h=24, size=18, space=2, color=0xD6D6D6)
    # 座標と LINK（最終同期）は時計側で書き換えるので TEXT ウィジェットにする
    L['coords'] = dict(x=152, y=201, w=176, h=16, size=11, color=0x7A7A7A,
                       text=f'{HOME[0]:.3f}°N  {HOME[1]:.3f}°E')
    label(368, 170, 'BAT')
    bars = []
    for lv in range(6):
        # 残り 1 本（約 20% 以下）だけオレンジで知らせる
        on = ORANGE if lv <= 1 else VAL
        im = Image.new('RGBA', (29, 12), (0, 0, 0, 0))
        bd = ImageDraw.Draw(im)
        for i in range(5):
            hgt = 4 + i * 2
            bd.rectangle([i * 6, 12 - hgt, i * 6 + 3, 11], fill=on if i < lv else LINE)
        bars.append(save(im, f'p2/bat/{lv}.png'))
    L['bat_bars'] = dict(x=388, y=164, src=bars)
    value('bat', mid, 383, 182, 'BATTERY', w=90, unit_img=unit('%', mid))
    rule(220, 34, 446)

    # ---- 3 段目 (220-296): 曜日・日付 / 時刻（秒）
    f_week = font(500, 20)
    weeks = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
    week_imgs = [label_image(s, f_week, VAL, spacing=2) for s in weeks]
    ww = max(i.width for i in week_imgs)
    week_paths = []
    for i, im in enumerate(week_imgs):
        c = Image.new('RGBA', (ww, im.height), (0, 0, 0, 0))
        c.paste(im, (0, 0), im)
        week_imgs[i] = c
        week_paths.append(save(c, f'p2/week/{i + 1}.png'))
    L['week'] = dict(x=62, y=236, src=week_paths)
    f_mon = font(500, 16)
    months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
    mon_imgs = []
    for m in months:
        li = label_image(m, f_mon, GRAY, pad=0, spacing=1)
        c = Image.new('RGBA', (li.width + 2, day.h), (0, 0, 0, 0))
        c.paste(li, (2, day.h - li.height), li)
        mon_imgs.append(c)
    mon_paths = [save(im, f'p2/month/{i + 1}.png') for i, im in enumerate(mon_imgs)]
    L['date'] = dict(day_x=62, day_y=264, day=day.paths, month_x=62 + day.w * 2 + 5, month_y=264,
                     month=mon_paths)

    colon = label_image(':', font(700, 84), WHITE, pad=0)
    t_x = 150
    t_y = 229
    L['time'] = dict(hour_x=t_x, minute_x=t_x + tm.w * 2 + colon.width + 4, y=t_y, digits=tm.paths,
                     sec_x=t_x + tm.w * 4 + colon.width + 9, sec_y=t_y + tm.h - sec.h, sec=sec.paths)
    colon_y = round(t_y + (tm.h - colon.height) / 2)
    bg.alpha_composite(colon, (t_x + tm.w * 2 + 2, colon_y))
    rule(296, 40, 440)

    # ---- 地図の見出し (296-320): 歩数 | LOCAL MAP | 今日の移動距離（地図の上には文字を置かない）
    hy = 308
    vline(160, 301, 315)
    vline(320, 301, 315)
    label(240, hy, 'LOCAL MAP', color=GRAY, spacing=2)
    label(84, hy, 'STEPS', f=font(500, 11))
    value('steps', xs, 108, hy - xs.h // 2, 'STEP', w=50, align='l')
    label(343, hy, 'TRAIL', f=font(500, 11))
    value('trail', xs, 364, hy - xs.h // 2, 'DISTANCE', w=50, unit_img=unit('km', xs, 10), sep='dot',
          align='l')

    # ---- 地図
    # bg には自宅周辺の固定地図。連携アプリ（HYROX Link）から届いた地図はその上に IMG で重ね、
    # さらに上に透過のオーバーレイ（グリッド・方位・縮尺）を重ねる
    mp = build_map(W, MAP_H).convert('RGBA')
    bg.alpha_composite(mp, (0, MAP_Y))
    hx, hy = 240, MAP_Y + MAP_H // 2 - 8
    pin = Image.new('RGBA', (W * g.SS, H * g.SS), (0, 0, 0, 0))
    hd = ImageDraw.Draw(pin)
    S = g.SS

    def disc(r, **kw):
        hd.ellipse([(hx - r) * S, (hy - r) * S, (hx + r) * S, (hy + r) * S], **kw)

    disc(16, fill=(255, 140, 26, 50))
    disc(16, outline=(255, 140, 26, 160), width=S)
    disc(7.5, fill=(0, 0, 0, 255))
    disc(6.5, fill=ORANGE)
    disc(2.5, fill=WHITE)
    bg.alpha_composite(pin.resize((W, H), Image.LANCZOS))
    d = ImageDraw.Draw(bg)
    text_center(d, hx + 36, hy, 'HOME', font(500, 11), VAL, spacing=1)

    ov = Image.new('RGBA', (W, MAP_H), (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    for x in range(0, W, 40):
        od.line([(x, 0), (x, MAP_H)], fill=(255, 255, 255, 12))
    for y in range(0, MAP_H, 40):
        od.line([(0, y), (W, y)], fill=(255, 255, 255, 12))
    for y in range(6):  # 上端を黒へなじませる
        od.line([(0, y), (W, y)], fill=(0, 0, 0, round(255 * (1 - y / 6))))
    oy = lambda y: y - MAP_Y  # noqa: E731

    # 方位（北）
    nx, ny = 92, oy(362)
    big = Image.new('RGBA', (28 * S, 34 * S), (0, 0, 0, 0))
    bd = ImageDraw.Draw(big)
    bd.ellipse([1 * S, 7 * S, 27 * S - 1, 33 * S - 1], fill=(0, 0, 0, 170), outline=(110, 110, 110, 255), width=S)
    bd.polygon([(14 * S, 10 * S), (19 * S, 24 * S), (14 * S, 21 * S), (9 * S, 24 * S)], fill=(225, 225, 225, 255))
    arrow = big.resize((28, 34), Image.LANCZOS)
    ov.alpha_composite(arrow, (nx - 14, ny - 20))
    text_center(od, nx, ny - 21, 'N', font(700, 10), VAL)

    # 縮尺 200m（サーバーの地図も同じズーム 16）
    px200 = round(200 / meters_per_px())
    sx0, sy = 240 - px200 // 2, oy(430)
    od.rectangle([sx0 - 4, sy - 13, sx0 + px200 + 4, sy + 4], fill=(0, 0, 0, 150))
    od.line([(sx0, sy), (sx0 + px200, sy)], fill=VAL, width=2)
    for x in (sx0, sx0 + px200):
        od.line([(x, sy - 4), (x, sy)], fill=VAL, width=2)
    text_center(od, 240, sy - 8, '200m', font(500, 10), VAL)
    text_center(od, 240, oy(444), '© OpenStreetMap', font(400, 8), (100, 100, 100, 255))
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
    put('steps', xs, '8418')
    put('trail', xs, '3.42')
    text_center(ImageDraw.Draw(pv), L['place']['x'] + L['place']['w'] / 2, L['place']['y'] + 12,
                'NISHIKU KUJO', font(500, 18), VAL, spacing=2)
    text_center(ImageDraw.Draw(pv), 240, L['coords']['y'] + 8, L['coords']['text'], font(400, 11), (122, 122, 122, 255))
    pv.alpha_composite(week_imgs[3], (L['week']['x'], L['week']['y']))
    day.draw(pv, '17', L['date']['day_x'], L['date']['day_y'])
    pv.alpha_composite(mon_imgs[8], (L['date']['month_x'], L['date']['month_y']))
    tm.draw(pv, '15', L['time']['hour_x'], t_y)
    tm.draw(pv, '56', L['time']['minute_x'], t_y)
    sec.draw(pv, '13', L['time']['sec_x'], L['time']['sec_y'])
    # ---- 縁: 24 時間の目盛りリング（固定部分）。動く部分（今の時刻・日の出入り・雨）は時計側で重ねる
    ring, ring_layout = build_ring(g)
    L['ring'] = ring_layout
    pv.alpha_composite(ring)

    # プレビューだけ: 日の出〜日の入りの弧と、動く印（日の出 6:02 / 日の入り 17:25 / 今 15:56）
    S = g.SS
    arc = Image.new('RGBA', (W * S, H * S), (0, 0, 0, 0))
    a = ring_layout['day_arc']
    r = a['radius'] * S
    col = ((a['color'] >> 16) & 255, (a['color'] >> 8) & 255, a['color'] & 255, 255)
    ImageDraw.Draw(arc).arc([240 * S - r, 240 * S - r, 240 * S + r, 240 * S + r],
                            362 * 0.25 - 90, 1045 * 0.25 - 90, fill=col, width=a['width'] * S)
    pv.alpha_composite(arc.resize((W, H), Image.LANCZOS))

    def mark(m, minutes):
        im = Image.open(g.IMG_DIR + '/' + m['src'][7:])
        layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        layer.alpha_composite(im, (m['pos_x'], m['pos_y']))
        pv.alpha_composite(layer.rotate(-minutes * 0.25, resample=Image.BICUBIC, center=(240, 240)))

    mark(ring_layout['sun'], 362)
    mark(ring_layout['sun'], 1045)
    mark(ring_layout['now'], 15 * 60 + 56)
    return L, pv
