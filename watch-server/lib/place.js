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

// zoom によっては県名しか返らないことがあるので、細かい順に試して町名まで取れた結果を使う
async function fromNominatim(lat, lon) {
  let best = null
  for (const zoom of [18, 16]) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=${zoom}&addressdetails=1&accept-language=en&lat=${lat}&lon=${lon}`
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) })
    if (!res.ok) throw new Error(`nominatim ${res.status}`)
    const name = formatPlace((await res.json()).address)
    if (name && name.includes(' ')) return name // 区 + 町名
    best = best || name
  }
  return best
}

// 予備: 区・市までしか分からないが、キー不要で落ちにくい
async function fromBigDataCloud(lat, lon) {
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error(`bigdatacloud ${res.status}`)
  const j = await res.json()
  return clean(j.locality) || clean(j.city)
}

export async function placeName(lat, lon) {
  const key = `place:${lat.toFixed(3)},${lon.toFixed(3)}`
  const hit = await cacheGet(key)
  if (hit && hit.name) return hit.name
  if (hit && hit.miss) return null
  for (const lookup of [fromNominatim, fromBigDataCloud]) {
    try {
      const name = await lookup(lat, lon)
      if (name) {
        await cacheSet(key, { name }, 30 * 86400)
        return name
      }
    } catch (e) {
      console.error('place lookup failed', String(e))
    }
  }
  await cacheSet(key, { miss: true }, 600) // 取れなかったときは 10 分後に再挑戦
  return null
}
