# HYROX Face（Amazfit Balance 3 用ウォッチフェイス）

![preview](preview.png)

HYROX 風デジタルウォッチフェイスのクローン。元デザインの「月」の位置には日付（月 + 日）を表示する。

- 対象: Zepp OS / 丸型 480×480（Amazfit Balance 3 / Balance 3 Ti）
- API: Zepp OS 3.0 以上

## 表示内容

![入れ替え例](preview_alt.png)

| 位置 | 表示 |
| --- | --- |
| 上中央 | 日付（月・日） |
| 中央 | 時:分、秒、A.M./P.M.（12時間表示のとき点灯） |
| 曜日行 | 当日をハイライト |
| 外周の弧 | 左上: 歩数目標 / 右上: バッテリー / 左下: カロリー目標 / 右下: 心拍 |
| **表示枠 ×7** | 左上・右上（アイコン + 数字）、中段 3 つ（数字 + ラベル）、左下・右下（数字 + アイコン）。**それぞれ自由に入れ替え可能** |

### 表示枠で選べるデータ

心拍 / 歩数 / カロリー / バッテリー / ストレス / EPOC（トレーニング負荷）/ VO2max / 回復時間 / Readiness / SpO2 / PAI / 脂肪燃焼 / スタンド / 距離 / 階段 / 気温 / 湿度 / UV / 気圧 / 高度 / 日の出 / 日の入り / 睡眠

- 入れ替え方: 時計の文字盤を長押し → 「編集」→ 枠をタップして上下にスクロールで選ぶ
- 初期設定: ストレス / バッテリー / EPOC / 歩数 / VO2max / 心拍 / カロリー
- 枠をタップすると、そのデータの純正アプリが開く
- 機種で使えないデータは選択肢に出ない。値が取れないときは `--`
- 常時表示（AOD）は時刻・日付・曜日のみ

## ファイル構成

```
app.json / app.js        Zepp OS アプリ設定
watchface/index.js       ウォッチフェイス本体
watchface/layout.js      座標・画像パス（自動生成）
assets/balance3.r/       画像素材（自動生成）
tools/gen_assets.py      画像素材・layout.js・preview.png の生成スクリプト
tools/complications.py   表示枠の位置と、選べるデータ・アイコンの定義
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

- `release/HYROX_Face-1.0.0.zab` … ビルド済みのインストールパッケージ（480×480 丸型の全対応機種入り）
- `release/balance3ti-qr.png` … Balance 3 Ti への転送用 QR コード（**2026-10-21 まで有効**、表示枠カスタマイズ版）。Zepp アプリ → プロフィール → 開発者モード → スキャン で読み取る。期限が切れたら `zeus preview` で作り直す
