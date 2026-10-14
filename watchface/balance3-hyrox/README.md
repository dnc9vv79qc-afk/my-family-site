# HYROX Face（Amazfit Balance 3 用ウォッチフェイス）

![preview](preview.png)

HYROX 風デジタルウォッチフェイスのクローン。元デザインの「月」の位置には日付（月 + 日）を表示する。

- 対象: Zepp OS / 丸型 480×480（Amazfit Balance 3 / Balance 3 Ti）
- API: Zepp OS 3.0 以上

## 表示内容

| 位置 | 表示 | Zepp のデータ種別 |
| --- | --- | --- |
| 上中央 | 日付（月・日） | IMG_DATE |
| 左上（スマイル） | ストレス | `STRESS` |
| 右上（稲妻） | バッテリー % | `BATTERY` |
| 中段左 "EPOC" | トレーニング負荷 | `TRAINING_LOAD` |
| 中段中央 | 歩数 | `STEP` |
| 中段右 | VO2max | `VO2MAX` |
| 中央 | 時:分、秒、A.M./P.M.（12時間表示のとき点灯） | IMG_TIME |
| 曜日行 | 当日をハイライト | IMG_WEEK |
| 左下（ハート） | 心拍 | `HEART` |
| 右下（炎） | 消費カロリー | `CAL` |
| 外周の弧 | 左上: 歩数目標 / 右上: バッテリー / 左下: カロリー目標 / 右下: 心拍 | IMG_LEVEL |

機種で使えないデータ種別は `--` 表示になる。常時表示（AOD）では時刻・日付・曜日のみ表示する。

## ファイル構成

```
app.json / app.js        Zepp OS アプリ設定
watchface/index.js       ウォッチフェイス本体
watchface/layout.js      座標・画像パス（自動生成）
assets/balance3.r/       画像素材（自動生成）
tools/gen_assets.py      画像素材・layout.js・preview.png の生成スクリプト
tools/fonts/             Rubik フォント（SIL OFL 1.1）
```

デザインを変えるときは `tools/gen_assets.py` を編集して再生成する（Python 3 + Pillow）。

```sh
python3 tools/gen_assets.py
```

## ビルドと時計への転送（手元の PC で）

1. Node.js を入れて Zeus CLI をインストール: `npm i -g @zeppos/zeus-cli`
2. このフォルダで `zeus login`（Zepp 開発者アカウント）
3. `zeus preview` → 表示された QR コードをスマホの Zepp アプリ（プロフィール → 開発者モード → スキャン）で読み取る
   - `zeus build` で `dist/*.zab` だけ作ることもできる
   - シミュレーターで確認する場合は `zeus dev`

`app.json` の `appId`（1131180）は Zepp 開発者コンソールで発行したもの。

## ビルド済みファイル（release/）

- `release/HYROX_Face-1.0.0.zab` … ビルド済みのインストールパッケージ
- `release/balance3ti-qr.png` … Balance 3 Ti への転送用 QR コード（**2026-10-21 まで有効**）。Zepp アプリ → プロフィール → 開発者モード → スキャン で読み取る。期限が切れたら `zeus preview` で作り直す
