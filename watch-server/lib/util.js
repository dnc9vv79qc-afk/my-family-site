import { metersPerPixel, project } from './map.js'

// 時計・サイドサービスからの読み取り用キー（?key= または X-Watch-Key）
export function checkWatchKey(req) {
  const want = process.env.WATCH_KEY
  if (!want) return false
  const url = new URL(req.url, 'http://x')
  return url.searchParams.get('key') === want || req.headers['x-watch-key'] === want
}

// OwnTracks からの送信は HTTP Basic 認証
export function checkOwnTracks(req) {
  const user = process.env.OWNTRACKS_USER
  const pass = process.env.OWNTRACKS_PASS
  if (!user || !pass) return false
  const h = req.headers.authorization || ''
  if (!h.startsWith('Basic ')) return false
  const [u, p] = Buffer.from(h.slice(6), 'base64').toString().split(':')
  return u === user && p === pass
}

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body
  const chunks = []
  for await (const c of req) chunks.push(c)
  const text = Buffer.concat(chunks).toString()
  return text ? JSON.parse(text) : null
}

// 2 点間の距離（m）
export function distance(a, b) {
  const R = 6371000
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

export function trailMeters(points) {
  let m = 0
  for (let i = 1; i < points.length; i++) m += distance(points[i - 1], points[i])
  return m
}

// 今日 0 時（日本時間）の UNIX 秒
export function startOfTodayJst(now = Date.now()) {
  const jst = now + 9 * 3600 * 1000
  return Math.floor((jst - (jst % 86400000) - 9 * 3600 * 1000) / 1000)
}

/**
 * 現在地が地図の端に寄ったら中心を移す。中心付近にいる間は地図を動かさない。
 * @returns {{lat:number, lon:number, moved:boolean}}
 */
export function nextCenter(view, here, { w, h, zoom, margin = 0.3 }) {
  if (!view) return { lat: here.lat, lon: here.lon, moved: true }
  const [cx, cy] = project(view.lat, view.lon, zoom)
  const [hx, hy] = project(here.lat, here.lon, zoom)
  if (Math.abs(hx - cx) > w * (0.5 - margin) || Math.abs(hy - cy) > h * (0.5 - margin)) {
    return { lat: here.lat, lon: here.lon, moved: true }
  }
  return { lat: view.lat, lon: view.lon, moved: false }
}

export { metersPerPixel }
