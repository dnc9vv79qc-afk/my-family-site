# watch-server

時計（Amazfit Balance 3 Ti の HYROX Face）向けの小さな API。Vercel の無料プラン（Hobby）で動かす。

- OwnTracks（iPhone）から位置・気圧・高度・バッテリーを受け取って保存
- 時計（Zepp アプリのサイドサービス）に最新データを JSON で返す
- 現在地まわりの簡易地図を PNG で返す
  - OpenStreetMap のデータ（OpenFreeMap のベクタータイル）から道路・鉄道・川・水域・公園だけを抜き出して暗い配色で描き直す
  - 道路の描画量は `detail` で 3 段階（1: 大通りと鉄道 / 2: + 中くらいの道・建物 / 3: + 細い道）
  - 今日の軌跡（オレンジの線）と現在地（オレンジの点）を重ねる
  - 現在地が地図の端（中心から 20% より外）に寄ったときだけ中心を移す。普段は地図が揺れない

地図データ © OpenStreetMap contributors（ODbL）。タイル提供: OpenFreeMap。雨予報: Open-Meteo。HUD の文字は Rubik（`lib/fonts`、SIL OFL 1.1）。

## API

| パス | 認証 | 内容 |
| --- | --- | --- |
| `POST /api/owntracks` | Basic（`OWNTRACKS_USER` / `OWNTRACKS_PASS`） | OwnTracks の HTTP モードの送信先 |
| `GET /api/state?key=…` | `WATCH_KEY` | 最新データ `{ age, lat, lon, alt, hpa, hpa_trend_3h, ticker, place, map_sig, batt, vel, today_km, view }`。`map_sig` は地図の中身が変わったかの目印（HYROX Link は同じなら地図を送らない）。`rain` は `{ start, slots }`（2 時間先までの 15 分ごとの降水量。時計の縁に青く表示）。`ticker` は時計の 2 ページ目上部にそのまま出す短い情報 3 行（つながり方・iPhone の電池 / 家からの距離・速さ・今日の移動 / 雨予報・気圧の変化・気温）。中身は `lib/ticker.js` で決める。雨予報は Open-Meteo（無料・キー不要、10 分キャッシュ）。`place` は座標から引いた地名をローマ字大文字にしたもの（例: `NISHIKU KUJO`）。Nominatim・Photon・BigDataCloud に同時に問い合わせ、区 + 町名まで取れたものを使う（約 100m 単位で 30 日キャッシュ、区だけなら 1 日） |
| `GET /api/health` | なし | 動作確認。固定の座標（大阪駅）で各地名サービスの結果かエラーを返す（個人データなし） |
| `GET /api/map?key=…&detail=2` | `WATCH_KEY` | 地図 PNG（既定 480×160、zoom 16 ≒ 1px 2m）。`w` `h` `zoom` `detail` で変更。detail 2 以上で建物も描く。`center=here` で現在地を真ん中に、`lat` `lon` でその地点を真ん中に描く（全画面地図・HYROX Link の地図画面用、普段の地図の中心は動かさない） |
| `GET /api/hud?key=…` | `WATCH_KEY` | 2 ページ目上部の雨表示 PNG（120×34、傘と 15 分刻み 8 本）。`&full=1` で 5 アイコン版（240×56）:雨（2 時間先まで 15 分刻み）/ 家の方向と距離 / 移動手段（速さから推定）/ iPhone の電池・Wi-Fi・充電 / 気圧の 3 時間変化。描き方は `lib/hud.js` |
| `GET /api/chart?key=…` | `WATCH_KEY` | iPhone の気圧（OwnTracks の `p`）の直近 24 時間の折れ線 PNG（既定 220×44） |

## 環境変数（Vercel の Settings → Environment Variables）

| 名前 | 内容 |
| --- | --- |
| `WATCH_KEY` | 時計から読むときの合言葉（長いランダム文字列） |
| `HOME_LAT` / `HOME_LON` | 家の座標（任意。「HOME 2.4km」「AT HOME」の表示に使う。省略時は九条あたり） |
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
