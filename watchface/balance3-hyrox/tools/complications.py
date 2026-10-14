"""表示枠（コンプリケーション）で選べるデータの一覧とアイコン。

アイコンは s×s（スーパーサンプリング済み）のキャンバスに黄色で描く。
"""
import math

YELLOW = (255, 230, 0, 255)
CLEAR = (0, 0, 0, 0)


def _w(s, r):
    return max(1, round(s * r))


def _poly(d, s, pts, fill=YELLOW):
    d.polygon([(x * s, y * s) for x, y in pts], fill=fill)


def _circle(d, s, cx, cy, r, fill=None, outline=None, width=0.0):
    d.ellipse([(cx - r) * s, (cy - r) * s, (cx + r) * s, (cy + r) * s],
              fill=fill, outline=outline, width=_w(s, width) if outline else 0)


def _line(d, s, pts, width):
    d.line([(x * s, y * s) for x, y in pts], fill=YELLOW, width=_w(s, width), joint='curve')
    for x, y in (pts[0], pts[-1]):  # 丸い端
        _circle(d, s, x, y, width / 2, fill=YELLOW)


def _arc(d, s, cx, cy, r, a0, a1, width):
    """a0→a1 度（PIL 準拠: 0°=3時、時計回り）。"""
    d.arc([(cx - r) * s, (cy - r) * s, (cx + r) * s, (cy + r) * s], a0, a1,
          fill=YELLOW, width=_w(s, width))


def paint_heart(d, s):
    pts = []
    for i in range(200):
        t = 2 * math.pi * i / 200
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((0.5 + x / 34, 0.47 - y / 34))
    _poly(d, s, pts)


def paint_heart_outline(d, s):
    paint_heart(d, s)
    pts = []
    for i in range(200):
        t = 2 * math.pi * i / 200
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((0.5 + x / 58, 0.45 - y / 58))
    _poly(d, s, pts, fill=CLEAR)


def paint_flame(d, s):
    outer = [(0.50, 0.00), (0.60, 0.14), (0.72, 0.28), (0.82, 0.42), (0.88, 0.57), (0.88, 0.72),
             (0.82, 0.85), (0.70, 0.95), (0.50, 1.00), (0.30, 0.95), (0.18, 0.85), (0.12, 0.72),
             (0.13, 0.56), (0.20, 0.42), (0.27, 0.33), (0.30, 0.47), (0.38, 0.52), (0.40, 0.36),
             (0.44, 0.20)]
    _poly(d, s, outer)
    inner = [(0.52, 0.50), (0.62, 0.64), (0.66, 0.76), (0.62, 0.87), (0.50, 0.91), (0.38, 0.87),
             (0.34, 0.76), (0.40, 0.66), (0.44, 0.72)]
    _poly(d, s, inner, fill=CLEAR)


def paint_fat_burn(d, s):
    paint_flame(d, s)
    _circle(d, s, 0.80, 0.80, 0.19, fill=CLEAR)
    _circle(d, s, 0.80, 0.80, 0.13, fill=YELLOW)


def paint_bolt(d, s):
    _poly(d, s, [(0.62, 0.02), (0.18, 0.56), (0.47, 0.56), (0.36, 0.98), (0.82, 0.42),
                 (0.53, 0.42), (0.66, 0.02)])


def paint_smiley(d, s):
    for i in range(12):
        a = math.radians(i * 30)
        d.line([(s * (0.5 + 0.40 * math.sin(a)), s * (0.5 - 0.40 * math.cos(a))),
                (s * (0.5 + 0.49 * math.sin(a)), s * (0.5 - 0.49 * math.cos(a)))],
               fill=YELLOW, width=_w(s, 0.07))
    _circle(d, s, 0.5, 0.5, 0.31, outline=YELLOW, width=0.08)
    for ex in (0.39, 0.61):
        _circle(d, s, ex, 0.42, 0.045, fill=YELLOW)
    _arc(d, s, 0.5, 0.5, 0.16, 20, 160, 0.065)


def paint_steps(d, s):
    # 2 つの足跡
    for ox, oy in ((0.08, 0.30), (0.50, 0.02)):
        d.ellipse([(ox + 0.04) * s, (oy + 0.10) * s, (ox + 0.38) * s, (oy + 0.52) * s], fill=YELLOW)
        d.ellipse([(ox + 0.09) * s, (oy + 0.55) * s, (ox + 0.33) * s, (oy + 0.70) * s], fill=YELLOW)


def paint_pulse(d, s):
    _line(d, s, [(0.04, 0.55), (0.26, 0.55), (0.36, 0.30), (0.50, 0.85), (0.62, 0.15),
                 (0.72, 0.55), (0.96, 0.55)], 0.09)


def paint_lungs(d, s):
    _line(d, s, [(0.5, 0.08), (0.5, 0.45)], 0.08)
    _line(d, s, [(0.5, 0.40), (0.38, 0.50)], 0.07)
    _line(d, s, [(0.5, 0.40), (0.62, 0.50)], 0.07)
    _poly(d, s, [(0.40, 0.30), (0.30, 0.25), (0.16, 0.42), (0.08, 0.70), (0.10, 0.88), (0.24, 0.92),
                 (0.40, 0.80), (0.42, 0.55)])
    _poly(d, s, [(0.60, 0.30), (0.70, 0.25), (0.84, 0.42), (0.92, 0.70), (0.90, 0.88), (0.76, 0.92),
                 (0.60, 0.80), (0.58, 0.55)])


def paint_recovery(d, s):
    _arc(d, s, 0.5, 0.52, 0.38, 200, 500, 0.10)
    _poly(d, s, [(0.03, 0.30), (0.28, 0.24), (0.14, 0.50)])
    _line(d, s, [(0.5, 0.30), (0.5, 0.54), (0.66, 0.64)], 0.09)


def paint_gauge(d, s):
    _arc(d, s, 0.5, 0.62, 0.42, 180, 360, 0.11)
    _line(d, s, [(0.5, 0.62), (0.74, 0.36)], 0.09)
    _circle(d, s, 0.5, 0.62, 0.09, fill=YELLOW)


def paint_spo2(d, s):
    pts = []
    for i in range(101):
        a = 2 * math.pi * i / 100
        r = 0.30 if math.cos(a) < 0 else 0.30 * (1 - math.cos(a) * 0.15)
        x = 0.42 + r * math.sin(a)
        y = 0.62 - r * math.cos(a) * (1.9 if math.cos(a) > 0 else 1.0)
        pts.append((x, max(0.04, y)))
    _poly(d, s, pts)
    _circle(d, s, 0.80, 0.78, 0.15, outline=YELLOW, width=0.07)


def paint_drop(d, s):
    pts = []
    for i in range(101):
        a = 2 * math.pi * i / 100
        x = 0.5 + 0.32 * math.sin(a) * (1 - 0.5 * max(0, math.cos(a)) ** 1.5)
        y = 0.64 - (0.60 if math.cos(a) > 0 else 0.32) * math.cos(a)
        pts.append((x, y))
    _poly(d, s, pts)


def paint_pai(d, s):
    paint_heart_outline(d, s)


def paint_stand(d, s):
    _circle(d, s, 0.5, 0.14, 0.12, fill=YELLOW)
    _line(d, s, [(0.5, 0.34), (0.5, 0.64)], 0.16)
    _line(d, s, [(0.5, 0.36), (0.24, 0.56)], 0.10)
    _line(d, s, [(0.5, 0.36), (0.76, 0.56)], 0.10)
    _line(d, s, [(0.46, 0.62), (0.36, 0.94)], 0.11)
    _line(d, s, [(0.54, 0.62), (0.64, 0.94)], 0.11)


def paint_pin(d, s):
    _circle(d, s, 0.5, 0.38, 0.32, fill=YELLOW)
    _poly(d, s, [(0.22, 0.52), (0.5, 0.98), (0.78, 0.52)])
    _circle(d, s, 0.5, 0.38, 0.12, fill=CLEAR)


def paint_stairs(d, s):
    _poly(d, s, [(0.04, 0.96), (0.04, 0.72), (0.30, 0.72), (0.30, 0.48), (0.56, 0.48), (0.56, 0.24),
                 (0.82, 0.24), (0.82, 0.04), (0.96, 0.04), (0.96, 0.96)])


def paint_thermo(d, s):
    _circle(d, s, 0.5, 0.76, 0.20, fill=YELLOW)
    d.rounded_rectangle([0.38 * s, 0.04 * s, 0.62 * s, 0.70 * s], radius=0.12 * s, fill=YELLOW)
    d.rounded_rectangle([0.45 * s, 0.12 * s, 0.55 * s, 0.62 * s], radius=0.05 * s, fill=CLEAR)
    _circle(d, s, 0.5, 0.76, 0.09, fill=CLEAR)


def paint_sun(d, s):
    _circle(d, s, 0.5, 0.5, 0.22, fill=YELLOW)
    for i in range(8):
        a = math.radians(i * 45)
        _line(d, s, [(0.5 + 0.34 * math.sin(a), 0.5 - 0.34 * math.cos(a)),
                     (0.5 + 0.44 * math.sin(a), 0.5 - 0.44 * math.cos(a))], 0.08)


def _horizon_sun(d, s, up):
    _arc(d, s, 0.5, 0.72, 0.24, 180, 360, 0.09)
    for deg in (-60, 0, 60):
        a = math.radians(deg)
        _line(d, s, [(0.5 + 0.34 * math.sin(a), 0.72 - 0.34 * math.cos(a)),
                     (0.5 + 0.42 * math.sin(a), 0.72 - 0.42 * math.cos(a))], 0.07)
    _line(d, s, [(0.06, 0.80), (0.94, 0.80)], 0.08)
    if up:
        _poly(d, s, [(0.38, 0.30), (0.5, 0.14), (0.62, 0.30)])
    else:
        _poly(d, s, [(0.38, 0.14), (0.5, 0.30), (0.62, 0.14)])


def paint_sunrise(d, s):
    _horizon_sun(d, s, True)


def paint_sunset(d, s):
    _horizon_sun(d, s, False)


def paint_moon(d, s):
    _circle(d, s, 0.48, 0.52, 0.40, fill=YELLOW)
    _circle(d, s, 0.66, 0.38, 0.34, fill=CLEAR)


def paint_mountain(d, s):
    _poly(d, s, [(0.02, 0.90), (0.36, 0.22), (0.54, 0.56), (0.68, 0.40), (0.98, 0.90)])
    _poly(d, s, [(0.27, 0.40), (0.36, 0.22), (0.45, 0.40), (0.40, 0.36), (0.36, 0.42), (0.32, 0.36)],
          fill=CLEAR)


def paint_barometer(d, s):
    _circle(d, s, 0.5, 0.5, 0.42, outline=YELLOW, width=0.09)
    _line(d, s, [(0.5, 0.5), (0.70, 0.30)], 0.08)
    _circle(d, s, 0.5, 0.5, 0.08, fill=YELLOW)
    for deg in (-120, -60, 0, 60, 120):
        a = math.radians(deg)
        _line(d, s, [(0.5 + 0.26 * math.sin(a), 0.5 - 0.26 * math.cos(a)),
                     (0.5 + 0.30 * math.sin(a), 0.5 - 0.30 * math.cos(a))], 0.05)


# key: data_type / edit_type 名。sep は区切り画像（dot=小数点, colon=時刻）。
CATALOG = [
    dict(key='HEART', label='BPM', title='Heart rate', icon=paint_heart, sample='76'),
    dict(key='STEP', label='Steps', title='Steps', icon=paint_steps, sample='1918'),
    dict(key='CAL', label='kcal', title='Calories', icon=paint_flame, sample='420'),
    dict(key='BATTERY', label='Battery', title='Battery', icon=paint_bolt, sample='84', unit='%'),
    dict(key='STRESS', label='Stress', title='Stress', icon=paint_smiley, sample='46'),
    dict(key='TRAINING_LOAD', label='EPOC', title='Training load', icon=paint_pulse, sample='292'),
    dict(key='VO2MAX', label='VO2max', title='VO2max', icon=paint_lungs, sample='53'),
    dict(key='RECOVERY_TIME', label='Recovery h', title='Recovery time', icon=paint_recovery, sample='18'),
    dict(key='READINESS', label='Readiness', title='Readiness', icon=paint_gauge, sample='82'),
    dict(key='SPO2', label='SpO2', title='SpO2', icon=paint_spo2, sample='98', unit='%'),
    dict(key='PAI_DAILY', label='PAI', title='PAI', icon=paint_pai, sample='12'),
    dict(key='FAT_BURNING', label='Fat burn', title='Fat burning', icon=paint_fat_burn, sample='24'),
    dict(key='STAND', label='Stand', title='Stand', icon=paint_stand, sample='8'),
    dict(key='DISTANCE', label='km', title='Distance', icon=paint_pin, sample='3.42', sep='dot'),
    dict(key='FLOOR', label='Floors', title='Floors', icon=paint_stairs, sample='12'),
    dict(key='WEATHER_CURRENT', label='Temp', title='Temperature', icon=paint_thermo, sample='23',
         unit='°', negative=True),
    dict(key='HUMIDITY', label='Humidity', title='Humidity', icon=paint_drop, sample='64', unit='%'),
    dict(key='UVI', label='UV', title='UV index', icon=paint_sun, sample='3'),
    dict(key='ALTIMETER', label='hPa', title='Air pressure', icon=paint_barometer, sample='1013'),
    dict(key='ALTITUDE', label='Alt m', title='Altitude', icon=paint_mountain, sample='35', negative=True),
    dict(key='SUN_RISE', label='Sunrise', title='Sunrise', icon=paint_sunrise, sample='05:48', sep='colon'),
    dict(key='SUN_SET', label='Sunset', title='Sunset', icon=paint_sunset, sample='17:12', sep='colon'),
    dict(key='SLEEP', label='Sleep', title='Sleep', icon=paint_moon, sample='07:24', sep='colon'),
]

# 表示枠。style: top=アイコン上+白数字, mid=黄数字+ラベル下, bot=白数字+アイコン下
SLOTS = [
    dict(id='a', edit_id=101, style='top', cx=132, y=58, w=104, h=72, default='STRESS'),
    dict(id='b', edit_id=102, style='top', cx=346, y=58, w=104, h=72, default='BATTERY'),
    dict(id='c', edit_id=103, style='mid', cx=116, y=142, w=110, h=62, default='TRAINING_LOAD'),
    dict(id='d', edit_id=104, style='mid', cx=240, y=142, w=110, h=62, default='STEP'),
    dict(id='e', edit_id=105, style='mid', cx=364, y=142, w=110, h=62, default='VO2MAX'),
    dict(id='f', edit_id=106, style='bot', cx=118, y=352, w=104, h=68, default='HEART'),
    dict(id='g', edit_id=107, style='bot', cx=362, y=352, w=104, h=68, default='CAL'),
]
