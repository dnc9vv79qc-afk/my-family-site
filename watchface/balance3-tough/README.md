# TOUGH Ti（Amazfit Balance 3 Ti 用アナデジ文字盤）

GA-2100 と GW-B5600 を混ぜた、真っ黒な樹脂 × 7 セグ液晶のアナデジ文字盤。HYROX Face とは別のウォッチフェイス。

![preview](preview.png) ![aod](preview_aod.png)

- **GA-2100 から**: 歯車のような溝のリング（時計本体のベゼルがあるので画面は端まで文字盤）、リングの上まで伸びる上が平らな黒いインデックス（内側の端に夜光の点。12 時は 2 本、5・7 時は液晶があるので無し）、黒い刃に夜光の帯の時針・分針、9 時の小さなダイヤル（電池 E〜F）
- **GW-B5600 から**: 一段高い枠にくぼんだ反転液晶と 7 セグの数字。下の液晶に 時:分 と秒、上の液晶に曜日（土日はオレンジ）と 月-日。TOUGH Ti とオレンジの PROTECTION の箱
- **オレンジ**: 秒針・中心・12 時の三角だけ
- **常時表示（AOD）**: インデックスの輪郭、液晶の 時:分、中抜きの時分針
- 本物のロゴ（G-SHOCK / CASIO）の代わりに TOUGH Ti と書いている（公開リポジトリのため）

## ファイル

```
app.json               アプリ設定（appId 1000002 は仮）
watchface/index.js     文字盤（TIME_POINTER・IMG_TIME・IMG_WEEK・IMG_DATE・IMG_LEVEL）
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
