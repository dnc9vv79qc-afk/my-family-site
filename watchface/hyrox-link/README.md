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
- 時計でアプリを開くと同期する（画面の SYNC ボタンでも）
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
