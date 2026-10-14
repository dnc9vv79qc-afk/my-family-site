// 2 ページ目上部の雨表示（傘 + 15 分刻み 8 本）。?full=1 で 5 アイコン版
import { renderHud, renderRain } from '../lib/hud.js'
import { pressureTrend } from '../lib/chart.js'
import { rainSoon } from '../lib/weather.js'
import { lastLocation, trailSince } from '../lib/store.js'
import { checkWatchKey } from '../lib/util.js'

export default async function handler(req, res) {
  if (!checkWatchKey(req)) return res.status(401).end()
  const now = Math.floor(Date.now() / 1000)
  const last = await lastLocation()
  const [rain, day] = await Promise.all([last ? rainSoon(last.lat, last.lon) : null, trailSince(now - 86400)])
  const full = new URL(req.url, 'http://x').searchParams.get('full') === '1'
  const png = full ? renderHud({ last, rain, trend: pressureTrend(day, now) }) : renderRain(rain)
  res.setHeader('Content-Type', 'image/png')
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).send(png)
}
