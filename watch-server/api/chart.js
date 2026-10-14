// 気圧の推移グラフ PNG（直近 24 時間）。?w=220&h=44&hours=24
import { renderPressure } from '../lib/chart.js'
import { trailSince } from '../lib/store.js'
import { checkWatchKey } from '../lib/util.js'

const num = (raw, lo, hi, d) => {
  const v = raw === null || raw === '' ? NaN : Number(raw)
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d
}

export default async function handler(req, res) {
  if (!checkWatchKey(req)) return res.status(401).end()
  const q = new URL(req.url, 'http://x').searchParams
  const hours = num(q.get('hours'), 1, 72, 24)
  const now = Date.now() / 1000
  const pts = await trailSince(now - hours * 3600)
  const png = renderPressure(pts, { w: num(q.get('w'), 40, 480, 220), h: num(q.get('h'), 16, 200, 44), hours, now })
  res.setHeader('Content-Type', 'image/png')
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).send(png)
}
