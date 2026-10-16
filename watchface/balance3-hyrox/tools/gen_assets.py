#!/usr/bin/env python3
"""ウォッチフェイス（1 ページ目 CROSSFIT / 2 ページ目 データ + 地図）の画像素材とレイアウト定数を生成する。

  python3 tools/gen_assets.py

出力:
  assets/balance3/images/...     ウォッチフェイス用 PNG
  watchface/layout.js            index.js が読み込む座標定数
  preview.png / preview_page2.png  サンプル値を入れた完成イメージ
"""
import json
import math
import os

from PIL import Image, ImageDraw, ImageFont

import page1
import page2

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_DIR = os.path.join(ROOT, 'tools', 'fonts')
IMG_DIR = os.path.join(ROOT, 'assets', 'balance3', 'images')

W = H = 480
CX = CY = 240
SS = 4  # アイコン・弧のスーパーサンプリング倍率

WHITE = (255, 255, 255, 255)
GRAY = (150, 150, 150, 255)
BLACK = (0, 0, 0, 255)


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


# ---------------------------------------------------------------- 現在地

def build_place_font():
    """現在地表示用に Rubik を英大文字・数字だけの TTF にして同梱する。"""
    from fontTools import subset
    from fontTools.ttLib import TTFont

    f = TTFont(os.path.join(FONT_DIR, 'rubik-latin-500-normal.woff'))
    f.flavor = None
    sub = subset.Subsetter()
    sub.populate(text='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -.')
    sub.subset(f)
    out = os.path.join(os.path.dirname(IMG_DIR), 'fonts', 'place.ttf')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    f.save(out)
    return 'fonts/place.ttf'


# ---------------------------------------------------------------- 生成

def main():
    import sys
    g = sys.modules[__name__]
    layout = {'place_font': build_place_font()}

    # 1 ページ目（CROSSFIT）
    layout['p1'], pv = page1.build(g)
    pv.save(os.path.join(ROOT, 'preview.png'))

    # 編集モードのマスクと透明画像
    layout['mask100'] = save(Image.new('RGBA', (W, H), (0, 0, 0, 255)), 'comp/edit/mask100.png')
    layout['mask70'] = save(Image.new('RGBA', (W, H), (0, 0, 0, 178)), 'comp/edit/mask70.png')
    layout['blank'] = save(Image.new('RGBA', (8, 8), (0, 0, 0, 0)), 'comp/blank.png')

    # 2 ページ目
    layout['p2'], pv2 = page2.build(g)
    pv2.save(os.path.join(ROOT, 'preview_page2.png'))

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
