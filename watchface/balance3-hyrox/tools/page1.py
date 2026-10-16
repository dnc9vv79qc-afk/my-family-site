"""1 ページ目（CROSSFIT）: 天気・日付 / ロゴ・現在地・電池・雨 / 縦積みの時刻 / カレンダー / 円弧メーター 3 つ。"""
import calendar
import math

from PIL import Image, ImageDraw, ImageFilter

from complications import CATALOG

ORANGE = (255, 140, 26, 255)
WHITE = (255, 255, 255, 255)
VAL = (214, 214, 214, 255)
GRAY = (128, 128, 128, 255)
LINE = (58, 58, 58, 255)
TRACK = (55, 55, 55, 255)
AOD_GRAY = (170, 170, 170, 255)
YELLOW = (255, 196, 64, 255)  # 天気アイコンだけ
RAIN = (63, 169, 245, 255)

# 円弧メーター（編集で中身を入れ替えられる）
GAUGE_R = 42
GAUGE_W = 6
GAUGE_BOX = 92
GAUGE_Y = 374
GAUGE_LEVELS = 11
GAUGES = [
    dict(edit_id=111, cx=140, default='STEP'),
    dict(edit_id=112, cx=240, default='HEART'),
    dict(edit_id=113, cx=340, default='CAL'),
]
GAUGE_LABEL = {
    'HEART': 'BPM', 'STEP': 'STEPS', 'CAL': 'CAL', 'BATTERY': 'BATT', 'STRESS': 'STRESS',
    'TRAINING_LOAD': 'EPOC', 'VO2MAX': 'VO2MAX', 'RECOVERY_TIME': 'RECOV H', 'READINESS': 'READY',
    'SPO2': 'SPO2', 'PAI_DAILY': 'PAI', 'FAT_BURNING': 'FAT MIN', 'STAND': 'STAND', 'DISTANCE': 'KM',
    'FLOOR': 'FLOORS', 'WEATHER_CURRENT': 'TEMP', 'HUMIDITY': 'HUMID', 'UVI': 'UV', 'ALTIMETER': 'HPA',
    'ALTITUDE': 'ALT M', 'SUN_RISE': 'SUNRISE', 'SUN_SET': 'SUNSET', 'SLEEP': 'SLEEP',
}

# Zepp の天気 index (0-28) → アイコンと表示名
WEATHER = [
    ('sun_cloud', 'PARTLY CLOUDY'), ('rain', 'SHOWERS'), ('snow', 'SNOW SHOWERS'), ('sun', 'SUNNY'),
    ('cloud', 'OVERCAST'), ('rain', 'LIGHT RAIN'), ('snow', 'LIGHT SNOW'), ('rain', 'RAIN'),
    ('snow', 'SNOW'), ('snow', 'HEAVY SNOW'), ('rain', 'HEAVY RAIN'), ('dust', 'SANDSTORM'),
    ('snow', 'SLEET'), ('fog', 'FOG'), ('fog', 'HAZE'), ('storm', 'T-STORMS'), ('snow', 'SNOWSTORM'),
    ('dust', 'DUST'), ('rain', 'HEAVY RAIN'), ('storm', 'HAIL'), ('storm', 'T-STORM HAIL'),
    ('rain', 'RAINSTORM'), ('dust', 'DUST'), ('dust', 'SANDSTORM'), ('rain', 'RAINSTORM'),
    ('cloud', '--'), ('moon_cloud', 'PARTLY CLOUDY'), ('rain', 'SHOWERS'), ('moon', 'CLEAR'),
]

# 上段・左列の基準位置
WX_X, WX_CX, DATE_CX, LX = 120, 182, 310, 44

# カレンダー（日曜始まり、最大 6 週）
CAL_X0, CAL_DX, CAL_HEAD_Y, CAL_Y0, CAL_DY = 324, 18.3, 150, 174, 23


# ---------------------------------------------------------------- 絵

def kettlebell_mask(n, S):
    """n×n（S 倍で描いた）ケトルベルのシルエット。"""
    N = n * S

    def P(v):
        return v * N

    hm = Image.new('L', (N, N), 0)
    d = ImageDraw.Draw(hm)
    d.rounded_rectangle([P(0.25), P(0.12), P(0.75), P(0.56)], radius=P(0.5 / 2.2), fill=255)
    d.rounded_rectangle([P(0.35), P(0.22), P(0.65), P(0.56)], radius=P(0.3 / 2.2), fill=0)
    bm = Image.new('L', (N, N), 0)
    d = ImageDraw.Draw(bm)
    cx, cy, r = 0.5, 0.64, 0.27
    d.ellipse([P(cx - r), P(cy - r), P(cx + r), P(cy + r)], fill=255)
    d.rectangle([0, P(cy + r * 0.86), N, N], fill=0)
    d.rounded_rectangle([P(cx - r * 0.55), P(cy + r * 0.70), P(cx + r * 0.55), P(cy + r * 0.92)],
                        radius=P(0.03), fill=255)
    return Image.composite(Image.new('L', (N, N), 255), hm, bm)


def ghost_kettlebell(size, S):
    """背景に薄く敷くケトルベル（塗り + 少し明るい縁）。"""
    m = kettlebell_mask(size, S)
    edge = Image.composite(Image.new('L', m.size, 0), m.filter(ImageFilter.MaxFilter(13)),
                           m.filter(ImageFilter.MinFilter(13)))
    img = Image.new('RGBA', m.size, ORANGE[:3] + (0,))
    img.putalpha(m.point(lambda v: v * 38 // 255))
    e = Image.new('RGBA', m.size, ORANGE[:3] + (0,))
    e.putalpha(edge.point(lambda v: v * 98 // 255))
    img.alpha_composite(e)
    return img.resize((size, size), Image.LANCZOS)


def weather_icon(kind, n, S):
    N = n * S
    img = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    def P(v):
        return v * N

    def cloud(col, dx=0.0, dy=0.0):
        d.ellipse([P(0.06 + dx), P(0.40 + dy), P(0.52 + dx), P(0.86 + dy)], fill=col)
        d.ellipse([P(0.30 + dx), P(0.26 + dy), P(0.80 + dx), P(0.76 + dy)], fill=col)
        d.rounded_rectangle([P(0.06 + dx), P(0.56 + dy), P(0.94 + dx), P(0.86 + dy)], radius=P(0.15), fill=col)

    def sun(cx, cy, r, rays=True):
        d.ellipse([P(cx - r), P(cy - r), P(cx + r), P(cy + r)], fill=YELLOW)
        if rays:
            for i in range(8):
                a = math.radians(i * 45)
                d.line([(P(cx + (r + 0.07) * math.sin(a)), P(cy - (r + 0.07) * math.cos(a))),
                        (P(cx + (r + 0.15) * math.sin(a)), P(cy - (r + 0.15) * math.cos(a)))],
                       fill=YELLOW, width=round(P(0.06)))

    def moon(cx, cy, r):
        d.ellipse([P(cx - r), P(cy - r), P(cx + r), P(cy + r)], fill=YELLOW)
        d.ellipse([P(cx - r + 0.16), P(cy - r - 0.08), P(cx + r + 0.16), P(cy + r - 0.08)], fill=(0, 0, 0, 0))

    light = (235, 235, 235, 255)
    if kind == 'sun':
        sun(0.5, 0.5, 0.2)
    elif kind == 'moon':
        moon(0.5, 0.5, 0.3)
    elif kind == 'sun_cloud':
        sun(0.64, 0.30, 0.16)
        cloud(light, -0.04, 0.06)
    elif kind == 'moon_cloud':
        moon(0.66, 0.30, 0.2)
        cloud(light, -0.04, 0.06)
    elif kind == 'cloud':
        cloud((190, 190, 190, 255), 0, -0.04)
    elif kind in ('rain', 'snow', 'storm'):
        cloud(light, 0, -0.16)
        if kind == 'rain':
            for x in (0.30, 0.52, 0.74):
                d.line([(P(x), P(0.78)), (P(x - 0.06), P(0.96))], fill=RAIN, width=round(P(0.08)))
        elif kind == 'snow':
            for x in (0.30, 0.52, 0.74):
                d.ellipse([P(x - 0.05), P(0.80), P(x + 0.05), P(0.90)], fill=light)
        else:
            d.polygon([(P(0.56), P(0.66)), (P(0.38), P(0.86)), (P(0.50), P(0.86)), (P(0.44), P(1.0)),
                       (P(0.66), P(0.78)), (P(0.54), P(0.78))], fill=YELLOW)
    elif kind == 'fog':
        for i, y in enumerate((0.34, 0.52, 0.70)):
            d.rounded_rectangle([P(0.10 + 0.08 * (i % 2)), P(y), P(0.90 - 0.08 * (i % 2)), P(y + 0.09)],
                                radius=P(0.045), fill=(190, 190, 190, 255))
    elif kind == 'dust':
        for x, y in ((0.2, 0.3), (0.5, 0.25), (0.8, 0.35), (0.3, 0.55), (0.65, 0.55), (0.45, 0.78), (0.8, 0.75)):
            d.ellipse([P(x - 0.06), P(y - 0.06), P(x + 0.06), P(y + 0.06)], fill=(200, 170, 120, 255))
    return img.resize((n, n), Image.LANCZOS)


def tint(img, color):
    out = Image.new('RGBA', img.size, color[:3] + (0,))
    out.putalpha(img.getchannel('A'))
    return out


# ---------------------------------------------------------------- 本体

def build(g):
    font, save, label_image, text_center = g.font, g.save, g.label_image, g.text_center
    W, H, SS = g.W, g.H, g.SS

    tm = g.DigitSet('p1_time', 700, 110, WHITE, sx=0.72)
    tm_aod = g.DigitSet('p1_time_aod', 500, 110, AOD_GRAY, sx=0.72)
    sec = g.DigitSet('p1_sec', 700, 24, ORANGE, sx=0.80)
    dt = g.DigitSet('p1_date', 700, 31, WHITE, sx=0.84, extra='.')
    dt_aod = g.DigitSet('p1_date_aod', 500, 31, AOD_GRAY, sx=0.84, extra='.')
    temp = g.DigitSet('p1_temp', 700, 34, WHITE, sx=0.86, extra='-°')
    stat = g.DigitSet('p1_stat', 700, 27, WHITE, sx=0.86, extra='-')
    gv = g.DigitSet('p1_gauge', 700, 21, WHITE, sx=0.88, extra='%-.:°')

    L = {}
    bg = Image.new('RGBA', (W, H), (0, 0, 0, 255))

    def unit_img(text, ds, size, color=VAL):
        li = label_image(text, font(500, size), color, pad=1)
        img = Image.new('RGBA', (li.width + 2, ds.h), (0, 0, 0, 0))
        img.paste(li, (2, ds.h - li.height), li)
        return img

    # ---- 縁の目盛り・上の三角・メーターの溝（スーパーサンプリング）
    big = Image.new('RGBA', (W * SS, H * SS), (0, 0, 0, 0))
    bd = ImageDraw.Draw(big)
    c = W * SS / 2
    for i in range(0, 60, 5):
        a = math.radians(i * 6)
        bd.line([(c + 226 * SS * math.sin(a), c - 226 * SS * math.cos(a)),
                 (c + 234 * SS * math.sin(a), c - 234 * SS * math.cos(a))], fill=(90, 90, 90, 255), width=2 * SS)
    bd.polygon([(c - 8 * SS, 6 * SS), (c + 8 * SS, 6 * SS), (c, 18 * SS)], fill=ORANGE)
    bg.alpha_composite(big.resize((W, H), Image.LANCZOS))

    # 左: 薄いケトルベル（文字の下）
    bg.alpha_composite(ghost_kettlebell(156, SS), (22, 150))

    d = ImageDraw.Draw(bg)

    def label(x, y, s, f, color, spacing=0, anchor='l'):
        """左上（anchor='l'）または中心（'c'）に文字を置く。"""
        if anchor == 'c':
            text_center(d, x, y, s, f, color, spacing=spacing)
            return
        li = label_image(s, f, color, pad=0, spacing=spacing)
        bg.alpha_composite(li, (round(x), round(y)))

    # ---- 上段: 天気 | 日付
    icons = {}
    for kind, _ in WEATHER:
        if kind not in icons:
            icons[kind] = save(weather_icon(kind, 34, SS), f'p1/wx/{kind}.png')
    TXT_W, TXT_H = 170, 18  # 全部同じ大きさ（画像を差し替えても欠けないように）
    f_wx = font(500, 13)
    wx_text = []
    for i, (_, name) in enumerate(WEATHER):
        cnv = Image.new('RGBA', (TXT_W, TXT_H), (0, 0, 0, 0))
        text_center(ImageDraw.Draw(cnv), TXT_W / 2, TXT_H / 2, name, f_wx, VAL, spacing=1.5)
        wx_text.append((save(cnv, f'p1/wx/text_{i}.png'), cnv))
    L['weather'] = dict(icon=dict(x=WX_X, y=44, w=34, h=34, src=[icons[k] for k, _ in WEATHER]),
                        text=dict(x=WX_CX - TXT_W // 2, y=86, w=TXT_W, h=TXT_H, src=[p for p, _ in wx_text]))
    deg = unit_img('°', temp, 24, WHITE)
    L['temp'] = dict(x=WX_X + 38, y=46, w=80, h=temp.h, font=temp.paths, negative=temp.extra_paths['-'],
                     invalid=temp.extra_paths['-'], unit=save(deg, 'p1/unit_deg.png'))
    d.line([(252, 42), (252, 102)], fill=ORANGE, width=2)

    date_w = dt.w * 4 + dt.glyphs['.'].width
    date_x = round(DATE_CX - date_w / 2)
    L['date'] = dict(x=date_x, y=46, digits=dt.paths, dot=dt.extra_paths['.'], aod=dt_aod.paths,
                     dot_aod=dt_aod.extra_paths['.'])
    weeks = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
    WK_W = 60
    wk = []
    for i, s in enumerate(weeks):
        li = label_image(s, font(700, 17), ORANGE, pad=0, spacing=1.5)
        cnv = Image.new('RGBA', (WK_W, li.height), (0, 0, 0, 0))
        cnv.paste(li, ((WK_W - li.width) // 2, 0), li)
        wk.append((save(cnv, f'p1/week/{i + 1}.png'), cnv))
    L['week'] = dict(x=DATE_CX - WK_W // 2, y=84, src=[p for p, _ in wk])
    d.line([(96, 110), (384, 110)], fill=ORANGE, width=2)

    # ---- 左: ロゴ・現在地・電池・雨
    for i in range(2):
        x = LX + 2 + i * 13
        d.polygon([(x + 7, 120), (x + 13, 120), (x + 6, 133), (x, 133)], fill=ORANGE)
    logo = label_image('CROSSFIT', font(700, 31), WHITE, pad=0)
    logo = logo.resize((round(logo.width * 0.72), logo.height), Image.LANCZOS)
    bg.alpha_composite(logo, (LX - 1, 140))
    L['place'] = dict(x=LX, y=172, w=124, line_h=18, size=14, space=2, color=0xFF8C1A)

    label(LX + 2, 222, 'BATTERY', font(500, 11), GRAY, spacing=1.5)
    pct = unit_img('%', stat, 13)
    L['bat'] = dict(x=LX + 2, y=237, w=80, h=stat.h, font=stat.paths, invalid=stat.extra_paths['-'],
                    unit=save(pct, 'p1/unit_pct.png'))
    label(LX + 2, 272, 'RAIN', font(500, 11), GRAY, spacing=1.5)
    words = {}
    for w_ in ('NOW', 'DRY', '--'):
        li = label_image(w_, font(700, 25), WHITE, pad=0)
        cnv = Image.new('RGBA', (80, stat.h + 4), (0, 0, 0, 0))
        cnv.paste(li, (0, stat.h - li.height), li)
        words[w_] = save(cnv, f'p1/rain_{w_.strip("-") or "none"}.png')
    mins = unit_img('MIN', stat, 12)
    L['rain'] = dict(x=LX + 2, y=287, w=80, h=stat.h, font=stat.paths, unit=save(mins, 'p1/unit_min.png'),
                     words=words, word_w=80, word_h=stat.h + 4)

    # ---- 中央: 時・分を縦に、秒はオレンジ
    TIME_CX = 222  # 秒とカレンダーの間を空けるため少し左
    hour_x = TIME_CX - tm.w
    HOUR_Y = 120
    MIN_Y = HOUR_Y + tm.h + 14
    L['time'] = dict(x=hour_x, hour_y=HOUR_Y, minute_y=MIN_Y, digits=tm.paths, aod=tm_aod.paths,
                     sec_x=TIME_CX + tm.w + 3, sec_y=HOUR_Y + tm.h - sec.h, sec=sec.paths)

    # ---- 右: 月 + カレンダー
    d.line([(318, 138), (326, 122)], fill=ORANGE, width=3)
    MON_W = 60
    months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
    mon = []
    for i, s in enumerate(months):
        li = label_image(s, font(700, 19), WHITE, pad=0, spacing=1)
        cnv = Image.new('RGBA', (MON_W, li.height), (0, 0, 0, 0))
        cnv.paste(li, (0, 0), li)
        mon.append((save(cnv, f'p1/month/{i + 1}.png'), cnv))
    L['month'] = dict(x=332, y=122, src=[p for p, _ in mon])
    d.line([(312, 146), (312, 300)], fill=ORANGE, width=1)
    for i, s in enumerate('SMTWTFS'):
        text_center(d, CAL_X0 + i * CAL_DX, CAL_HEAD_Y + 4, s, font(500, 10), GRAY)
    ring = Image.new('RGBA', (20 * SS, 20 * SS), (0, 0, 0, 0))
    ImageDraw.Draw(ring).ellipse([SS, SS, 19 * SS - 1, 19 * SS - 1], outline=ORANGE, width=2 * SS)
    ring = ring.resize((20, 20), Image.LANCZOS)
    L['cal'] = dict(x0=CAL_X0, dx=CAL_DX, y0=CAL_Y0, dy=CAL_DY, cell_w=19, cell_h=18, size=12,
                    color=0xD6D6D6, today_color=0xFFFFFF, ring=save(ring, 'p1/cal_ring.png'))
    d.line([(112, 318), (368, 318)], fill=ORANGE, width=2)

    # ---- 下: 円弧メーター 3 つ（溝は IMG_LEVEL の画像に含める）
    def gauge_arc(ratio):
        big = Image.new('RGBA', (GAUGE_BOX * SS, GAUGE_BOX * SS), (0, 0, 0, 0))
        gd = ImageDraw.Draw(big)
        r = GAUGE_R * SS
        cc = GAUGE_BOX * SS / 2
        box = [cc - r, cc - r, cc + r, cc + r]
        gd.arc(box, 135, 405, fill=TRACK, width=GAUGE_W * SS)
        if ratio > 0:
            gd.arc(box, 135, 135 + 270 * ratio, fill=ORANGE, width=GAUGE_W * SS)
        return big.resize((GAUGE_BOX, GAUGE_BOX), Image.LANCZOS)

    levels = [gauge_arc(i / (GAUGE_LEVELS - 1)) for i in range(GAUGE_LEVELS)]
    level_paths = [save(im, f'p1/gauge/{i}.png') for i, im in enumerate(levels)]
    for x in (190, 290):
        d.line([(x, 346), (x, 404)], fill=LINE, width=1)

    f_gl = font(600, 11)  # 小さく細いと時計の画像変換で下半分が消えるので太めに
    types = {}
    deco = {}
    for t in CATALOG:
        k = t['key']
        ic = tint(g.icon(18, t['icon']), WHITE)
        li = label_image(GAUGE_LABEL.get(k, t['label'].upper()), f_gl, (232, 232, 232, 255), pad=1, spacing=1.2)
        lab = Image.new('RGBA', (76, li.height), (0, 0, 0, 0))
        lab.paste(li, ((76 - li.width) // 2, 0), li)
        deco[k] = (ic, lab)
        types[k] = dict(icon=save(ic, f'p1/gicon/{k}.png'), label=save(lab, f'p1/glabel/{k}.png'),
                        label_h=lab.height, title=t['title'], unit=t.get('unit'), sep=t.get('sep'),
                        negative=bool(t.get('negative')))
    # 枠内の相対位置
    ICON_Y, VALUE_CY, LABEL_CY = 18, 47, 69

    def render_gauge(key, level=7):
        t = next(c_ for c_ in CATALOG if c_['key'] == key)
        img = levels[level].copy()
        ic, lab = deco[key]
        img.alpha_composite(ic, ((GAUGE_BOX - 18) // 2, ICON_Y - 9))
        s = t['sample'] + (t.get('unit') or '')
        gv.draw(img, s, (GAUGE_BOX - gv.text_width(s)) / 2, VALUE_CY - gv.h / 2)
        img.alpha_composite(lab, ((GAUGE_BOX - 76) // 2, round(LABEL_CY - lab.height / 2)))
        return img

    sel = Image.new('RGBA', (GAUGE_BOX, GAUGE_BOX), (0, 0, 0, 0))
    ImageDraw.Draw(sel).ellipse([1, 1, GAUGE_BOX - 2, GAUGE_BOX - 2], outline=(255, 230, 0, 255), width=3)
    unsel = Image.new('RGBA', (GAUGE_BOX, GAUGE_BOX), (0, 0, 0, 0))
    ImageDraw.Draw(unsel).ellipse([1, 1, GAUGE_BOX - 2, GAUGE_BOX - 2], outline=(120, 120, 120, 255), width=2)
    previews = {c_['key']: save(render_gauge(c_['key']), f'p1/gpreview/{c_["key"]}.png') for c_ in CATALOG}
    tips = Image.new('RGBA', (132, 36), (0, 0, 0, 0))
    ImageDraw.Draw(tips).rounded_rectangle([0, 0, 131, 35], radius=18, fill=(255, 230, 0, 255))

    gauges = []
    for gg in GAUGES:
        x, y = gg['cx'] - GAUGE_BOX // 2, GAUGE_Y - GAUGE_BOX // 2
        gauges.append(dict(edit_id=gg['edit_id'], default=gg['default'], x=x, y=y, w=GAUGE_BOX, h=GAUGE_BOX,
                           icon=dict(x=gg['cx'] - 9, y=y + ICON_Y - 9),
                           value=dict(x=x + 2, y=round(y + VALUE_CY - gv.h / 2), w=GAUGE_BOX - 4, h=gv.h),
                           label=dict(x=gg['cx'] - 38, cy=y + LABEL_CY),
                           tips_x=(GAUGE_BOX - 132) // 2, tips_y=-40))
    L['gauge'] = dict(
        slots=gauges, levels=level_paths, types=types, order=[c_['key'] for c_ in CATALOG],
        previews=previews, select=save(sel, 'p1/gauge_select.png'), unselect=save(unsel, 'p1/gauge_unselect.png'),
        tips=save(tips, 'p1/tips.png'),
        font=dict(digits=gv.paths, invalid=gv.extra_paths['-'], negative=gv.extra_paths['-'],
                  dot=gv.extra_paths['.'], colon=gv.extra_paths[':'],
                  units={'%': gv.extra_paths['%'], '°': gv.extra_paths['°']}),
    )

    # ---- 最下段
    text_center(d, 240, 432, 'EAT  //  TRAIN  //  REPEAT', font(500, 12), VAL, spacing=1.5)
    d.line([(196, 452), (222, 452)], fill=ORANGE, width=2)
    d.line([(258, 452), (284, 452)], fill=ORANGE, width=2)
    d.rectangle([226, 446, 230, 458], fill=ORANGE)
    d.rectangle([250, 446, 254, 458], fill=ORANGE)
    d.line([(230, 452), (250, 452)], fill=ORANGE, width=3)

    # 円形にマスク
    mask = Image.new('L', (W * SS, H * SS), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, W * SS - 1, H * SS - 1], fill=255)
    mask = mask.resize((W, H), Image.LANCZOS)
    out = Image.new('RGBA', (W, H), (0, 0, 0, 255))
    out.paste(bg, (0, 0), mask)
    L['bg'] = save(out, 'p1/bg.png')
    L['toggle'] = dict(x=164, y=116, w=142, h=196)

    # ---- プレビュー（サンプル値）
    pv = out.copy()
    pd = ImageDraw.Draw(pv)
    pv.alpha_composite(Image.open(g.IMG_DIR + '/' + L['weather']['icon']['src'][0][7:]), (WX_X, 44))
    pv.alpha_composite(wx_text[0][1], (L['weather']['text']['x'], 86))
    temp.draw(pv, '18', WX_X + 38, 46)
    pv.alpha_composite(deg, (WX_X + 38 + temp.text_width('18'), 46))
    dt.draw(pv, '10.17', date_x, 46)
    pv.alpha_composite(wk[5][1], (L['week']['x'], 84))
    pv.alpha_composite(mon[9][1], (332, 122))
    for i, s in enumerate(['NISHIKU', 'KUJO']):
        pv.alpha_composite(label_image(s, font(500, 14), ORANGE, pad=0, spacing=2), (LX + 2, 175 + i * 18))
    stat.draw(pv, '66', LX + 2, 237)
    pv.alpha_composite(pct, (LX + 2 + stat.text_width('66'), 237))
    stat.draw(pv, '45', LX + 2, 287)
    pv.alpha_composite(mins, (LX + 2 + stat.text_width('45'), 287))
    tm.draw(pv, '10', hour_x, HOUR_Y)
    tm.draw(pv, '24', hour_x, MIN_Y)
    sec.draw(pv, '36', L['time']['sec_x'], L['time']['sec_y'])
    for wi, week in enumerate(calendar.Calendar(firstweekday=6).monthdayscalendar(2026, 10)):
        for di, day in enumerate(week):
            if not day:
                continue
            cx, cy = CAL_X0 + di * CAL_DX, CAL_Y0 + wi * CAL_DY
            if day == 17:
                pv.alpha_composite(ring, (round(cx - 10), round(cy - 10)))
            text_center(pd, cx, cy, str(day), font(500, 12), WHITE if day == 17 else VAL)
    for gg, key, lv in zip(gauges, ('STEP', 'HEART', 'CAL'), (8, 5, 7)):
        pv.alpha_composite(render_gauge(key, lv), (gg['x'], gg['y']))
    return L, pv
