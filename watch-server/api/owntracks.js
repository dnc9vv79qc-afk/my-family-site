// OwnTracks（HTTP モード）からの位置を受け取る。
// アプリ側の URL: https://<デプロイ先>/api/owntracks 、認証: Basic（OWNTRACKS_USER / OWNTRACKS_PASS）
import { saveLocation } from '../lib/store.js'
import { checkOwnTracks, readJson } from '../lib/util.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!checkOwnTracks(req)) return res.status(401).end()

  const m = await readJson(req).catch(() => null)
  if (m && m._type === 'location' && typeof m.lat === 'number' && typeof m.lon === 'number') {
    await saveLocation({
      tst: m.tst || Math.floor(Date.now() / 1000),
      lat: m.lat,
      lon: m.lon,
      alt: m.alt ?? null,
      // iPhone の気圧センサー（kPa）→ hPa
      hpa: typeof m.p === "number" ? Math.round(m.p * 100) / 10 : null,
      batt: m.batt ?? null,
      vel: m.vel ?? null,
      acc: m.acc ?? null,
      ssid: m.SSID ?? null,
    })
  }
  // OwnTracks は JSON 配列の返事を期待する
  res.setHeader('Content-Type', 'application/json')
  res.status(200).send('[]')
}
