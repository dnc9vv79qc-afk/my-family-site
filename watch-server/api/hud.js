// 2 ページ目上部の HUD 画像（雨・家・移動・iPhone・気圧のアイコン）
import { renderHud } from '../lib/hud.js'
import { pressureTrend } from '../lib/chart.js'
import { rainSoon } from '../lib/weather.js'
import { lastLocation, trailSince } from '../lib/store.js'
import { checkWatchKey } from '../lib/util.js'

export default async function handler(req, res) {
  if (!checkWatchKey(req)) return res.status(401).end()
  const now = Math.floor(Date.now() / 1000)
  const last = await lastLocation()
  const [rain, day] = await Promise.all([last ? rainSoon(last.lat, last.lon) : null, trailSince(now - 86400)])
  const png = renderHud({ last, rain, trend: pressureTrend(day, now) })
  res.setHeader('Content-Type', 'image/png')
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).send(png)
}
