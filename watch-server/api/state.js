// 時計（サイドサービス）向けの最新データ
import { lastLocation, trailSince, getView } from '../lib/store.js'
import { checkWatchKey, startOfTodayJst, trailMeters } from '../lib/util.js'
import { placeName } from '../lib/place.js'
import { pressureTrend } from '../lib/chart.js'
import { rainSoon } from '../lib/weather.js'
import { buildTicker } from '../lib/ticker.js'

export default async function handler(req, res) {
  if (!checkWatchKey(req)) return res.status(401).end()
  const last = await lastLocation()
  const now = Math.floor(Date.now() / 1000)
  const today = await trailSince(startOfTodayJst())
  const day = await trailSince(now - 86400)
  const [place, rain] = last ? await Promise.all([placeName(last.lat, last.lon), rainSoon(last.lat, last.lon)]) : [null, null]
  const trend = pressureTrend(day, now)
  const todayKm = Math.round(trailMeters(today) / 10) / 100
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({
    now,
    ok: !!last,
    age: last ? now - last.tst : null,
    lat: last?.lat ?? null,
    lon: last?.lon ?? null,
    alt: last?.alt ?? null,
    hpa: last?.hpa ?? null,
    hpa_trend_3h: trend,
    ticker: buildTicker({ last, rain, trend, todayKm, now }),
    place,
    rain: rain ? { start: rain.start, slots: rain.slots } : null,
    batt: last?.batt ?? null,
    vel: last?.vel ?? null,
    ssid: last?.ssid ?? null,
    today_km: todayKm,
    view: await getView(),
  })
}
