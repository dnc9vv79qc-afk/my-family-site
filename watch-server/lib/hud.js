// 2 ページ目上部の HUD（アイコン 5 つ）。状況に応じて形・色が変わる絵として描く
//   雨（2 時間先までの 15 分刻み）/ 家の方向と距離 / 移動手段 / iPhone（電池・Wi-Fi・充電）/ 気圧の傾向
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import { distance } from './util.js'
import { STYLE } from './map.js'

const FONT = fileURLToPath(new URL('./fonts/hud.ttf', import.meta.url))
const FAMILY = 'Rubik Medium'

export const HUD_W = 240
export const HUD_H = 56
const SLOT = HUD_W / 5

const C = {
  dim: '#3a3f44',
  mid: '#8c8c8c',
  white: '#ffffff',
  accent: STYLE.accent,
  rain: '#3fa9f5',
  green: '#4cd97b',
  red: '#ff4b3e',
}

const HOME = {
  lat: Number(process.env.HOME_LAT || 34.677),
  lon: Number(process.env.HOME_LON || 135.474),
}

function label(x, y, text, color = C.mid, size = 10) {
  return `<text x="${x}" y="${y}" font-family="${FAMILY}" font-size="${size}" fill="${color}" text-anchor="middle">${text}</text>`
}

function bearing(a, b) {
  const r = Math.PI / 180
  const y = Math.sin((b.lon - a.lon) * r) * Math.cos(b.lat * r)
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r)
  return (Math.atan2(y, x) / r + 360) % 360
}

function shortKm(m) {
  if (m < 1000) return `${Math.round(m / 10) * 10}M`
  return m < 10000 ? `${(m / 1000).toFixed(1)}KM` : `${Math.round(m / 1000)}KM`
}

// 雨: 傘 + 15 分刻み 8 マスのバー（降る時間帯が青く光る）
function rainSlot(cx, rain) {
  const mm = (rain && rain.slots) || []
  const wet = mm.some((v) => v >= 0.1)
  const col = wet ? C.rain : C.mid
  const s = [
    `<path d="M${cx - 11},${16} A11,11 0 0 1 ${cx + 11},${16} Z" fill="${col}"/>`,
    `<path d="M${cx},16 L${cx},26 A3,3 0 0 1 ${cx - 6},26" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round"/>`,
  ]
  const bw = 4
  const x0 = cx - (8 * bw + 7) / 2
  for (let i = 0; i < 8; i++) {
    const v = mm[i] || 0
    const h = v >= 0.1 ? Math.min(14, 4 + v * 6) : 2
    s.push(`<rect x="${x0 + i * (bw + 1)}" y="${48 - h}" width="${bw}" height="${h}" rx="1" fill="${v >= 0.1 ? C.rain : C.dim}"/>`)
  }
  return s.join('')
}

// 家: 家の方向を指す矢印（北が上）+ 距離。家にいれば家アイコン
function homeSlot(cx, last) {
  const d = distance(last, HOME)
  if (d < 150) {
    return (
      `<path d="M${cx - 11},${20} L${cx},${9} L${cx + 11},${20} L${cx + 8},${20} L${cx + 8},${32} L${cx - 8},${32} L${cx - 8},${20} Z" fill="${C.green}"/>` +
      label(cx, 48, 'HOME', C.green)
    )
  }
  const a = bearing(last, HOME)
  return (
    `<g transform="rotate(${a.toFixed(0)} ${cx} 20)"><path d="M${cx},${7} L${cx + 8},${30} L${cx},${25} L${cx - 8},${30} Z" fill="${C.accent}"/></g>` +
    label(cx, 48, shortKm(d), C.white)
  )
}

// 移動手段: 速さから推定
function moveSlot(cx, last) {
  const v = last.vel ?? 0
  const y = 20
  if (v < 2) return `<circle cx="${cx}" cy="${y}" r="5" fill="${C.mid}"/><circle cx="${cx}" cy="${y}" r="10" fill="none" stroke="${C.dim}" stroke-width="2"/>` + label(cx, 48, 'STILL')
  if (v < 8) {
    return (
      `<circle cx="${cx + 1}" cy="${y - 10}" r="3" fill="${C.green}"/>` +
      `<path d="M${cx + 1},${y - 5} L${cx - 1},${y + 4} L${cx - 6},${y + 12} M${cx - 1},${y + 4} L${cx + 5},${y + 12} M${cx - 6},${y - 1} L${cx},${y - 4} L${cx + 6},${y}" fill="none" stroke="${C.green}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>` +
      label(cx, 48, `${v}KMH`, C.white)
    )
  }
  if (v < 25) {
    return (
      `<circle cx="${cx - 8}" cy="${y + 6}" r="6" fill="none" stroke="#ffd23f" stroke-width="2"/><circle cx="${cx + 8}" cy="${y + 6}" r="6" fill="none" stroke="#ffd23f" stroke-width="2"/>` +
      `<path d="M${cx - 8},${y + 6} L${cx - 2},${y - 4} L${cx + 6},${y - 4} L${cx + 8},${y + 6} M${cx - 2},${y - 4} L${cx},${y + 6} L${cx + 6},${y - 4}" fill="none" stroke="#ffd23f" stroke-width="2" stroke-linejoin="round"/>` +
      label(cx, 48, `${v}KMH`, C.white)
    )
  }
  return (
    `<rect x="${cx - 10}" y="${y - 12}" width="20" height="22" rx="5" fill="${C.rain}"/>` +
    `<rect x="${cx - 7}" y="${y - 8}" width="14" height="7" rx="1" fill="#0a0c0e"/>` +
    `<circle cx="${cx - 5}" cy="${y + 4}" r="1.8" fill="#0a0c0e"/><circle cx="${cx + 5}" cy="${y + 4}" r="1.8" fill="#0a0c0e"/>` +
    `<path d="M${cx - 8},${y + 14} L${cx - 11},${y + 17} M${cx + 8},${y + 14} L${cx + 11},${y + 17}" stroke="${C.rain}" stroke-width="2" stroke-linecap="round"/>` +
    label(cx, 48, `${v}KMH`, C.white)
  )
}

// iPhone: 本体の中に電池残量、Wi-Fi なら電波、充電中は稲妻
function phoneSlot(cx, last) {
  const b = Math.max(0, Math.min(100, last.batt ?? 0))
  const col = b <= 15 ? C.red : b <= 35 ? '#ffb02e' : C.green
  const top = 9
  const h = 26
  const fill = Math.round((h - 4) * (b / 100))
  const s = [
    `<rect x="${cx - 7}" y="${top}" width="14" height="${h}" rx="3" fill="none" stroke="${C.mid}" stroke-width="1.6"/>`,
    `<rect x="${cx - 5}" y="${top + h - 2 - fill}" width="10" height="${fill}" rx="1" fill="${col}"/>`,
  ]
  if (last.bs === 2 || last.bs === 3) s.push(`<path d="M${cx + 1},${top + 5} L${cx - 3},${top + 14} L${cx + 1},${top + 14} L${cx - 1},${top + 21} L${cx + 4},${top + 11} L${cx},${top + 11} Z" fill="${C.white}"/>`)
  if (last.conn === 'w') {
    for (const r of [5, 9, 13]) s.push(`<path d="M${cx + 10 - r * 0.7},${top + 6 - r * 0.7 + 6} A${r},${r} 0 0 1 ${cx + 10 + r * 0.7},${top + 6 - r * 0.7 + 6}" fill="none" stroke="${C.rain}" stroke-width="1.6" stroke-linecap="round" transform="translate(4 -2)"/>`)
  } else if (last.conn === 'o') {
    s.push(`<path d="M${cx + 10},${top - 2} L${cx + 18},${top + 6} M${cx + 18},${top - 2} L${cx + 10},${top + 6}" stroke="${C.red}" stroke-width="2" stroke-linecap="round"/>`)
  }
  s.push(label(cx, 48, `${b}`, C.white))
  return s.join('')
}

// 気圧: 3 時間の変化を傾いた矢印で（急降下は赤）
function pressureSlot(cx, trend) {
  if (typeof trend !== 'number') return `<path d="M${cx - 12},20 L${cx + 12},20" stroke="${C.dim}" stroke-width="3" stroke-linecap="round"/>` + label(cx, 48, 'HPA')
  const ang = Math.max(-60, Math.min(60, -trend * 25)) // 下がると右下がり
  const col = trend <= -2 ? C.red : trend <= -0.8 ? '#ffb02e' : trend >= 0.8 ? C.green : C.mid
  return (
    `<g transform="rotate(${ang.toFixed(0)} ${cx} 20)"><path d="M${cx - 13},20 L${cx + 7},20" stroke="${col}" stroke-width="3" stroke-linecap="round"/><path d="M${cx + 13},20 L${cx + 4},13 L${cx + 4},27 Z" fill="${col}"/></g>` +
    label(cx, 48, `${trend > 0 ? '+' : ''}${trend}`, col === C.mid ? C.white : col)
  )
}

export function renderHud({ last, rain, trend }) {
  const parts = []
  if (last) {
    const cx = (i) => SLOT * i + SLOT / 2
    parts.push(rainSlot(cx(0), rain), homeSlot(cx(1), last), moveSlot(cx(2), last), phoneSlot(cx(3), last), pressureSlot(cx(4), trend))
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${HUD_W}" height="${HUD_H}">${parts.join('')}</svg>`
  return new Resvg(svg, {
    background: 'rgba(0,0,0,0)',
    font: { fontFiles: [FONT], loadSystemFonts: false, defaultFontFamily: FAMILY },
  })
    .render()
    .asPng()
}
