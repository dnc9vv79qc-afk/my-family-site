# watch-server

時計（Amazfit Balance 3 Ti の HYROX Face）向けの小さな API。Vercel の無料プラン（Hobby）で動かす。

- OwnTracks（iPhone）から位置・気圧・高度・バッテリーを受け取って保存
- 時計（Zepp アプリのサイドサービス）に最新データを JSON で返す
- 現在地まわりの簡易地図を PNG で返す
  - OpenStreetMap のデータ（OpenFreeMap のベクタータイル）から道路・鉄道・川・水域・公園だけを抜き出して暗い配色で描き直す
  - 道路の描画量は `detail` で 3 段階（1: 大通りと鉄道 / 2: + 中くらいの道 / 3: + 細い道）
  - 今日の軌跡（オレンジの線）と現在地（オレンジの点）を重ねる
  - 現在地が地図の端（中心から 20% より外）に寄ったときだけ中心を移す。普段は地図が揺れない

地図データ © OpenStreetMap contributors（ODbL）。タイル提供: OpenFreeMap。

## API

| パス | 認証 | 内容 |
| --- | --- | --- |
| `POST /api/owntracks` | Basic（`OWNTRACKS_USER` / `OWNTRACKS_PASS`） | OwnTracks の HTTP モードの送信先 |
| `GET /api/state?key=…` | `WATCH_KEY` | 最新データ `{ age, lat, lon, alt, hpa, batt, vel, today_km, view }` |
| `GET /api/map?key=…&detail=2` | `WATCH_KEY` | 地図 PNG（既定 480×156、zoom 16 ≒ 1px 2m）。`w` `h` `zoom` `detail` で変更 |

## 環境変数（Vercel の Settings → Environment Variables）

| 名前 | 内容 |
| --- | --- |
| `WATCH_KEY` | 時計から読むときの合言葉（長いランダム文字列） |
| `OWNTRACKS_USER` / `OWNTRACKS_PASS` | OwnTracks から送るときのユーザー名・パスワード |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Upstash Redis（Vercel の Storage から追加すると自動で入る） |

合言葉やパスワードはこのリポジトリ（公開）には書かないこと。

## セットアップ（スマホのブラウザでできる）

1. https://vercel.com に GitHub アカウントでログイン
2. Add New → Project → このリポジトリを Import
   - **Root Directory** を `watch-server` にする
   - Deploy
3. プロジェクトの Storage → Upstash（Redis）を追加して、このプロジェクトにつなぐ（無料プラン）
4. Settings → Environment Variables に `WATCH_KEY` `OWNTRACKS_USER` `OWNTRACKS_PASS` を追加 → Redeploy
5. iPhone の OwnTracks: 設定 → モードを **HTTP** に
   - URL: `https://<プロジェクト名>.vercel.app/api/owntracks`
   - 認証をオンにして、ユーザー名・パスワードを入力
6. ブラウザで `https://<プロジェクト名>.vercel.app/api/map?key=<WATCH_KEY>` を開いて地図が出れば OK

## ローカルでの試験

```sh
npm install
# Node 22 以降。プロキシ環境なら NODE_USE_ENV_PROXY=1
```

Redis の環境変数が無いときはメモリに保存するので、関数を直接呼んで試せる。
