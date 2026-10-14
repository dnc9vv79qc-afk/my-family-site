// 座標 → 「NISHIKU KUJO」のような大文字ローマ字の地名（OpenStreetMap の Nominatim、英語表記）
// Nominatim の利用規約に合わせ、約 100m 単位で 30 日キャッシュして問い合わせを最小限にする
import { cacheGet, cacheSet } from './store.js'

const UA = 'family-watchface/1.0 (github.com/dnc9vv79qc-afk/my-family-site)'

function clean(s) {
  if (!s || /[^\x20-\x7e]/.test(s)) return null // ローマ字表記が無いものは使わない
  return s
    .replace(/\s+\d+-chome$/i, '') // 九条 1 丁目 → 九条
    .replace(/-chome$/i, '')
    .replace(/\s+Ward$/i, 'ku') // Nishi Ward → Nishiku
    .replace(/-ku$/i, 'ku')
    .replace(/\s+(City|Town|Village)$/i, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .trim()
    .toUpperCase()
}

export function formatPlace(address) {
  if (!address) return null
  const small = clean(address.neighbourhood) || clean(address.quarter) || clean(address.hamlet)
  const mid = clean(address.suburb) || clean(address.city_district) || clean(address.town) || clean(address.city)
  const words = [mid, small].filter(Boolean)
  return words.length ? [...new Set(words)].join(' ') : null
}

export async function placeName(lat, lon) {
  const key = `place:${lat.toFixed(3)},${lon.toFixed(3)}`
  const hit = await cacheGet(key)
  if (hit) return hit.name
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&addressdetails=1&accept-language=en&lat=${lat}&lon=${lon}`
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!res.ok) return null
    const name = formatPlace((await res.json()).address)
    await cacheSet(key, { name }, 30 * 86400)
    return name
  } catch {
    return null
  }
}
