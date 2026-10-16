// 現在地まわりの簡易地図 PNG（道路・鉄道・川 + 今日の軌跡 + 現在地）。
// 現在地が地図の端に寄ったときだけ中心を移すので、普段は地図が揺れない。
// ?detail=1|2|3（道路の描画量）&zoom=16&w=480&h=160
// &center=here: 現在地を真ん中に描く（時計の全画面地図用。普段の地図の中心は動かさない）
// &lat=..&lon=..: その地点を真ん中に描く（HYROX Link の地図画面でスクロールしたとき）
import { renderMap } from '../lib/map.js'
import { lastLocation, trailSince, getView, setView } from '../lib/store.js'
import { checkWatchKey, nextCenter, startOfTodayJst } from '../lib/util.js'

const clamp = (raw, lo, hi, d) => {
  const v = raw === null || raw === '' ? NaN : Number(raw)
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d
}

export default async function handler(req, res) {
  if (!checkWatchKey(req)) return res.status(401).end()
  const q = new URL(req.url, 'http://x').searchParams
  const w = clamp(q.get('w'), 64, 480, 480)
  const h = clamp(q.get('h'), 64, 480, 160)
  const zoom = clamp(q.get('zoom'), 12, 18, 16)
  const detail = clamp(q.get('detail'), 1, 3, 2)

  const last = await lastLocation()
  if (!last) return res.status(404).end()
  const lat = clamp(q.get('lat'), -85, 85, NaN)
  const lon = clamp(q.get('lon'), -180, 180, NaN)
  let view = { lat: last.lat, lon: last.lon }
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    view = { lat, lon }
  } else if (q.get('center') !== 'here') {
    view = nextCenter(await getView(), last, { w, h, zoom })
    if (view.moved) await setView({ lat: view.lat, lon: view.lon })
  }

  const trail = (await trailSince(startOfTodayJst())).map((p) => [p.lat, p.lon])
  const png = await renderMap({ lat: view.lat, lon: view.lon, w, h, zoom, detail, trail, here: [last.lat, last.lon] })
  res.setHeader('Content-Type', 'image/png')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Map-Center', `${view.lat},${view.lon}`)
  res.status(200).send(png)
}
