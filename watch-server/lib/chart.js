// iPhone の気圧（OwnTracks の p）を折れ線にした小さな PNG。文字は時計側で描く
import { Resvg } from '@resvg/resvg-js'
import { STYLE } from './map.js'

/**
 * @param {Array<{tst:number, hpa:number}>} points 古い順
 * @param {object} o
 */
export function renderPressure(points, { w = 220, h = 44, hours = 24, now = Date.now() / 1000 } = {}) {
  const pts = points.filter((p) => typeof p.hpa === 'number' && p.tst >= now - hours * 3600)
  const parts = []
  // 6 時間ごとの縦線
  for (let k = 1; k < hours / 6; k++) {
    const x = (w * k * 6) / hours
    parts.push(`<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="rgba(255,255,255,0.10)"/>`)
  }
  parts.push(`<line x1="0" y1="${h - 0.5}" x2="${w}" y2="${h - 0.5}" stroke="rgba(255,255,255,0.18)"/>`)

  if (pts.length >= 2) {
    let lo = Math.min(...pts.map((p) => p.hpa))
    let hi = Math.max(...pts.map((p) => p.hpa))
    if (hi - lo < 4) {
      const mid = (hi + lo) / 2
      lo = mid - 2
      hi = mid + 2
    }
    const X = (t) => w - ((now - t) / (hours * 3600)) * w
    const Y = (v) => 4 + (1 - (v - lo) / (hi - lo)) * (h - 8)
    const xy = pts.map((p) => [X(p.tst), Y(p.hpa)])
    const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
    const area = `M${xy[0][0].toFixed(1)},${h} L${line.replace(/ /g, ' L')} L${xy[xy.length - 1][0].toFixed(1)},${h} Z`
    parts.push(`<path d="${area}" fill="${STYLE.accent}" fill-opacity="0.15"/>`)
    parts.push(`<polyline points="${line}" fill="none" stroke="${STYLE.accent}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`)
    const [lx, ly] = xy[xy.length - 1]
    parts.push(`<circle cx="${lx}" cy="${ly}" r="3" fill="#fff"/>`)
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${parts.join('')}</svg>`
  return new Resvg(svg, { background: 'rgba(0,0,0,0)' }).render().asPng()
}

// 3 時間前との差（hPa）。下がり続けていれば天気が崩れる目安
export function pressureTrend(points, now = Date.now() / 1000) {
  const pts = points.filter((p) => typeof p.hpa === 'number')
  if (pts.length < 2) return null
  const last = pts[pts.length - 1]
  const past = pts.filter((p) => p.tst <= now - 3 * 3600).pop() || pts[0]
  if (last.tst - past.tst < 1800) return null
  return Math.round((last.hpa - past.hpa) * 10) / 10
}
