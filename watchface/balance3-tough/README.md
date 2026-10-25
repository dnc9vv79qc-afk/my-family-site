# TOUGH Ti（Amazfit Balance 3 Ti 用アナログ文字盤）

ミリタリー × G-SHOCK 風のいかつさ × 実用性。黒にオレンジを差した、無骨で見やすいアナログ文字盤。HYROX Face とは別のウォッチフェイス。

![preview](preview.png) ![aod](preview_aod.png)

- **文字盤は画面の端まで**: 時計本体に金属のベゼルがあるので、画面にはベゼルを描かない。外周は分目盛りのリング（12 時にオレンジの三角、3・6・9 にオレンジの目盛り）
- **ガード**: リングの斜め 4 か所に六角ボルトで留めたガード
- **文字盤**: 中央にうっすら浮き出たハニカム模様
- **インデックス**: 立体の金属バー。12・3・6・9 は外側半分にオレンジ
- **針**: スケルトン（中抜き）の時針・分針。外側に夜光、先端にオレンジ。秒針と中心もオレンジ
- **曜日**（左）: 大きな曜日名と M T W T F S S の行。今日だけオレンジ＋下線
- **時刻・日付**（右の窓）: 角を落とした太い金属枠に、極太のデジタル時刻と 月 / 日
- **電池**（下）: 20 個のブロックに区切ったオレンジのリングと残量 %。小ダイヤルのふちは刻み入りの金属
- **常時表示（AOD）**: 黒地にインデックスの輪郭（12・3・6・9 はオレンジ）、窓の時刻と日付、中抜きの時分針
- 心拍などの数値は出さない。編集（中身の入れ替え）もなし

## ファイル

```
app.json               アプリ設定（appId 1000002 は仮）
watchface/index.js     文字盤（TIME_POINTER・IMG_WEEK・IMG_TIME・IMG_DATE・IMG_LEVEL・TEXT_IMG）
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
- `release/balance3ti-qr.png` … 転送用 QR コード（**2026-11-01 まで有効**）。Zepp アプリ → プロフィール → 開発者モード → スキャン
