// 時計の 2 ページ目上部に並べる短い情報。状況に応じて中身が変わる。
// 1 行は 30 文字程度まで。時計側は受け取った行をそのまま表示するだけなので、ここを変えれば表示も変わる
import { distance } from './util.js'

const HOME = {
  lat: Number(process.env.HOME_LAT || 34.677),
  lon: Number(process.env.HOME_LON || 135.474),
}

function km(m) {
  return m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(1)}km`
}

export function buildTicker({ last, rain, trend, todayKm, now }) {
  const lines = []
  if (!last) return ['NO DATA FROM OWNTRACKS']

  // 1 行目: つながり方と iPhone の状態
  const conn = last.conn === 'w' ? `WIFI ${last.ssid || ''}`.trim() : last.conn === 'm' ? 'MOBILE' : last.conn === 'o' ? 'OFFLINE' : null
  const batt = last.batt != null ? `iPh ${last.batt}%${last.bs === 2 || last.bs === 3 ? '+' : ''}` : null
  lines.push([conn, batt].filter(Boolean).join(' · '))

  // 2 行目: 動き（速さ・家からの距離・今日の移動）
  const fromHome = distance(HOME, last)
  const moving = last.vel != null && last.vel >= 3 ? `${last.vel} km/h` : 'STILL'
  lines.push([fromHome < 150 ? 'AT HOME' : `HOME ${km(fromHome)}`, moving, todayKm ? `TODAY ${todayKm}km` : null].filter(Boolean).join(' · '))

  // 3 行目: 天気の変化（雨が近いときは最優先）
  const w = []
  if (rain) {
    if (rain.now_mm >= 0.1) w.push(`RAIN NOW ${rain.now_mm}mm`)
    else if (rain.rain_in_min != null) w.push(`RAIN IN ${rain.rain_in_min || 15}m`)
    else w.push(rain.prob >= 30 ? `RAIN ${rain.prob}%` : 'DRY 2h')
  }
  if (typeof trend === 'number' && Math.abs(trend) >= 0.5) w.push(`${trend > 0 ? '▲' : '▼'}${Math.abs(trend)}hPa/3h`)
  if (rain && rain.temp != null) w.push(`${Math.round(rain.temp)}°`)
  if (w.length) lines.push(w.join(' · '))

  // 古いデータは目立たせる
  const age = now - last.tst
  if (age > 3600) lines[0] = `STALE ${Math.floor(age / 3600)}h · ` + lines[0]
  return lines.filter(Boolean).slice(0, 3)
}
