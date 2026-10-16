# HYROX Link（HYROX Face の連携アプリ）

`watch-server` から最新データ（位置・iPhone の気圧・今日の移動距離など）と現在地まわりの地図を取り、
時計に転送して HYROX Face（ウォッチフェイス）の 2 ページ目に表示させるための小さな Zepp OS アプリ。

```
OwnTracks（iPhone）→ watch-server（Vercel）
                         ↑ 取得（Zepp アプリ内のサイドサービス）
                         │  地図 PNG は時計用に変換して転送
HYROX Link（時計）─── 共有ストレージ（link.json）と地図ファイル ──→ HYROX Face が読む
```

- App ID: 1131196（Balance 3 Ti 専用）
- 時計でアプリを開くと同期する（画面の SYNC ボタンでも）。地図は 2 ページ目用（480×160）と全画面用（480×480、ズーム 15、現在地が真ん中）の 2 枚を届ける
- **地図画面**（`page/map`）: ウォッチフェイスの全画面地図の真ん中をタップで開く。スワイプで半画面ずつ移動、リューズか ＋/－ でズーム 13〜17、◎ で現在地。動かすたびにスマホ経由でその範囲の地図を 1 枚もらう（1〜3 秒）
- **AUTO** ボタンで自動同期を ON にすると、アプリを閉じても 15 分ごとに同期する（`app-service/sync.js`、Zepp OS のアプリサービス）
  - 初回は時計でバックグラウンド実行の許可を求められる。裏で動き続けられるアプリは時計全体で 1 つだけ
  - ボタンの下に前回の自動同期の結果（`last 3m OK` など）が出る
  - 間隔は `shared.js` の `AUTO_MIN`
- 受け取ったデータは `ShareLocalStorage('link.json')` に `state` / `map` として保存
- ウォッチフェイスは `@zos/share-storage` の `LocalStorage(1131196, 'link.json')` と `FileSystem(1131196)` で読む

## 設定（スマホの Zepp アプリ → HYROX Link → 設定）

| 項目 | 内容 |
| --- | --- |
| サーバー URL | 空欄なら `https://my-family-site-six.vercel.app` |
| 合言葉 | watch-server の `WATCH_KEY` |
| 地図の描画量 | 1: 大通りと鉄道 / 2: 標準 / 3: 細い道まで |

合言葉はリポジトリに書かない。

## ビルド

```sh
npm install
zeus build && zeus prune --ip
```

`release/` にビルド済みファイルと転送用 QR コード（期限 2026-10-21）。
