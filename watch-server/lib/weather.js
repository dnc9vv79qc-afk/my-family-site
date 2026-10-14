// 現在地の雨予報（Open-Meteo、無料・キー不要）。約 5km 単位で 10 分キャッシュ
import { cacheGet, cacheSet } from './store.js'

export async function rainSoon(lat, lon) {
  const la = lat.toFixed(2)
  const lo = lon.toFixed(2)
  const key = `rain:${la},${lo}`
  const hit = await cacheGet(key)
  if (hit) return hit
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}` +
      '&current=temperature_2m,precipitation&minutely_15=precipitation&forecast_minutely_15=8' +
      '&hourly=precipitation_probability&forecast_hours=3&timezone=Asia%2FTokyo'
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return null
    const j = await res.json()
    const mm = j.minutely_15?.precipitation || []
    const first = mm.findIndex((v) => v >= 0.1) // 15 分ごと、2 時間先まで
    const out = {
      now_mm: j.current?.precipitation ?? null,
      temp: j.current?.temperature_2m ?? null,
      rain_in_min: first < 0 ? null : first * 15,
      sum_2h: Math.round(mm.reduce((a, b) => a + b, 0) * 10) / 10,
      prob: Math.max(0, ...(j.hourly?.precipitation_probability || [0])),
      slots: mm.slice(0, 8), // 15 分ごとの降水量（mm）
    }
    await cacheSet(key, out, 600)
    return out
  } catch {
    return null
  }
}
