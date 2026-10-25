# TOUGH Ti（Amazfit Balance 3 Ti 用デジタル文字盤）

G-SHOCK（GW-B5600 / GA-2100）風。真っ黒な樹脂ケースの真ん中に大きな反転液晶を置いたデジタル文字盤。HYROX Face とは別のウォッチフェイス。

![preview](preview.png) ![aod](preview_aod.png)

- **液晶**: 7 セグメントの極太の 時:分 と小さめの秒。消えているセグメントもうっすら見える。上の段に曜日・電池・月-日
- **枠**: 一段高い枠。上の帯に TOUGH Ti とオレンジの PROTECTION、下の帯に WATER 20BAR RESIST / SHOCK RESIST
- **ケース**: 黒い樹脂に沈んだ刻印（ADJUST / START / LIGHT / MODE、MULTI BAND、SHOCK RESIST）
- **常時表示（AOD）**: 黒地に液晶の枠と 時:分 だけ
- 本物のロゴ（G-SHOCK / CASIO）の代わりに TOUGH Ti と書いている（公開リポジトリのため）

## ファイル

```
app.json               アプリ設定（appId 1000002 は仮）
watchface/index.js     文字盤（IMG_TIME・IMG_WEEK・IMG_DATE・TEXT_IMG）
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
