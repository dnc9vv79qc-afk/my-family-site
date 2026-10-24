# TOUGH Ti（Amazfit Balance 3 Ti 用アナログ文字盤）

G-SHOCK（スカイコックピット）風の、黒いケースにシアンを差した無骨なアナログ文字盤。HYROX Face とは別のウォッチフェイス。

![preview](preview.png) ![aod](preview_aod.png)

- **針**: 剣形の時針・分針（シアンのふち＋明るい夜光色）、シアンの秒針
- **24 時間計**（右上）: 30 分刻みで動く 24 時間表示の針
- **曜日**（左下）: SU〜SA を指す針
- **電池**（右下）: E〜F の針。0〜20% はシアンの帯
- **日付窓**（3 時）
- **ケース・見返し**: ベゼルに彫り込みの数字と文字、見返しに世界の都市コードとシアンの分目盛り
- **常時表示（AOD）**: 黒地に目盛りと 12・6 の輪郭、日付、中抜きの時分針
- 心拍などの数値は出さない。編集（中身の入れ替え）もなし

## ファイル

```
app.json               アプリ設定（appId 1000002 は仮）
watchface/index.js     文字盤（TIME_POINTER・IMG_WEEK・IMG_LEVEL・IMG_DATE）
watchface/layout.js    tools/gen.py が作る座標と画像の一覧
tools/gen.py           文字盤の絵をすべて描く（Python 3 + Pillow + numpy）
tools/fonts/           Rubik フォント（SIL OFL 1.1）
```

デザインを変えるときは `tools/gen.py` を編集して再生成する。

```sh
python3 tools/gen.py
zeus build && zeus prune --ip
```

## ビルド済みファイル（release/）

- `release/TOUGH_Ti-1.0.0.zab` … インストールパッケージ
- `release/balance3ti-qr.png` … 転送用 QR コード（**2026-10-31 まで有効**）。Zepp アプリ → プロフィール → 開発者モード → スキャン
