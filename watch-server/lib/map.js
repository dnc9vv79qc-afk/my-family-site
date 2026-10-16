// OpenStreetMap（OpenFreeMap のベクタータイル）から道路・鉄道・川を抜き出し、
// 時計用の暗い簡易地図 PNG を描く。地図データ © OpenStreetMap contributors。
import { VectorTile } from '@mapbox/vector-tile'
import Pbf from 'pbf'
import { Resvg } from '@resvg/resvg-js'
import UPNG from 'upng-js'

const TILEJSON = 'https://tiles.openfreemap.org/planet'
const TILE_ZOOM = 14 // OpenFreeMap の最大ズーム。これより細かい表示は拡大して描く

// 描画量（detail）ごとに描く道路の種類
const ROAD_CLASSES = {
  1: ['motorway', 'trunk', 'primary'],
  2: ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'],
  3: ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'],
}

// 道路は 3 段階: 幹線（明るく太い）/ 一般道（細いグレー）/ 細街路（ごく暗い）。
// オレンジは現在地と軌跡だけ。グリッド・方位・縮尺は時計側のオーバーレイが描く
export const STYLE = {
  bg: '#0a0c0e',
  water: '#0f3340',
  waterway: '#1a5c70',
  park: '#0d1a15',
  building: { fill: '#262c32', stroke: '#3a424a' },
  rail: '#6c7178',
  road: {
    motorway: { color: '#c8ccd0', width: 3.4 },
    trunk: { color: '#c8ccd0', width: 3.2 },
    primary: { color: '#c8ccd0', width: 2.8 },
    secondary: { color: '#6f767c', width: 1.6 },
    tertiary: { color: '#6f767c', width: 1.4 },
    minor: { color: '#30363b', width: 1.0 },
    service: { color: '#262b30', width: 0.8 },
  },
  accent: '#ff8c1a',
}

let tileTemplate = null
const tileCache = new Map()

async function template() {
  if (!tileTemplate) {
    const res = await fetch(TILEJSON)
    if (!res.ok) throw new Error(`tilejson ${res.status}`)
    tileTemplate = (await res.json()).tiles[0]
  }
  return tileTemplate
}

async function loadTile(x, y) {
  const key = `${x}/${y}`
  if (tileCache.has(key)) return tileCache.get(key)
  const url = (await template()).replace('{z}', TILE_ZOOM).replace('{x}', x).replace('{y}', y)
  const res = await fetch(url)
  const tile = res.ok ? new VectorTile(new Pbf(new Uint8Array(await res.arrayBuffer()))) : null
  if (tileCache.size > 200) tileCache.clear()
  tileCache.set(key, tile)
  return tile
}

// 緯度経度 → ズーム z の世界ピクセル座標（256px タイル）
export function project(lat, lon, z) {
  const n = 256 * 2 ** z
  const s = Math.sin((lat * Math.PI) / 180)
  return [((lon + 180) / 360) * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n]
}

export function metersPerPixel(lat, z) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z
}

function pathD(rings, close) {
  return rings
    .map((ring) => 'M' + ring.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L') + (close ? 'Z' : ''))
    .join('')
}

/**
 * @param {object} o
 * @param {number} o.lat 地図の中心
 * @param {number} o.lon
 * @param {number} [o.w=480] 画像サイズ
 * @param {number} [o.h=160]
 * @param {number} [o.zoom=16] 表示ズーム（16 で 1px ≒ 2m）
 * @param {1|2|3} [o.detail=2] 道路の描画量
 * @param {Array<[number,number]>} [o.trail] 軌跡 [lat, lon][]
 * @param {[number,number]} [o.here] 現在地 [lat, lon]（中心とずれていてもよい）
 * @param {boolean} [o.palette=true] 256 色のパレット PNG にする（false でフルカラー）
 */
export async function renderMap({ lat, lon, w = 480, h = 160, zoom = 16, detail = 2, trail = [], here = null, palette = true }) {
  const [cx, cy] = project(lat, lon, zoom)
  const left = cx - w / 2
  const top = cy - h / 2
  const scale = 2 ** (zoom - TILE_ZOOM) // タイル座標 → 表示座標

  const t0x = Math.floor(left / 256 / scale)
  const t1x = Math.floor((left + w) / 256 / scale)
  const t0y = Math.floor(top / 256 / scale)
  const t1y = Math.floor((top + h) / 256 / scale)

  const layers = { water: [], park: [], building: [], waterway: [], rail: [], road: {} }
  const roadClasses = ROAD_CLASSES[detail] || ROAD_CLASSES[2]

  const jobs = []
  for (let tx = t0x; tx <= t1x; tx++) for (let ty = t0y; ty <= t1y; ty++) jobs.push([tx, ty])
  const tiles = await Promise.all(jobs.map(([tx, ty]) => loadTile(tx, ty)))

  tiles.forEach((tile, i) => {
    if (!tile) return
    const [tx, ty] = jobs[i]
    const toScreen = (extent) => (p) => [
      (tx + p.x / extent) * 256 * scale - left,
      (ty + p.y / extent) * 256 * scale - top,
    ]
    const each = (name, fn) => {
      const layer = tile.layers[name]
      if (!layer) return
      const conv = toScreen(layer.extent)
      for (let k = 0; k < layer.length; k++) {
        const f = layer.feature(k)
        fn(f, f.loadGeometry().map((ring) => ring.map(conv)))
      }
    }
    each('water', (f, rings) => layers.water.push(pathD(rings, true)))
    each('park', (f, rings) => layers.park.push(pathD(rings, true)))
    if (detail >= 2) each('building', (f, rings) => layers.building.push(pathD(rings, true)))
    each('waterway', (f, rings) => layers.waterway.push(pathD(rings, false)))
    each('transportation', (f, rings) => {
      const c = f.properties.class
      if (f.properties.brunnel === 'tunnel') return // 地下は描かない
      if (c === 'rail' || c === 'transit') {
        if (detail >= 1) layers.rail.push(pathD(rings, false))
        return
      }
      if (!roadClasses.includes(c)) return
      ;(layers.road[c] = layers.road[c] || []).push(pathD(rings, false))
    })
  })

  const S = STYLE
  const parts = [`<rect width="${w}" height="${h}" fill="${S.bg}"/>`]
  if (layers.park.length) parts.push(`<path d="${layers.park.join('')}" fill="${S.park}"/>`)
  if (layers.water.length) parts.push(`<path d="${layers.water.join('')}" fill="${S.water}"/>`)
  if (layers.building.length)
    parts.push(
      `<path d="${layers.building.join('')}" fill="${S.building.fill}" stroke="${S.building.stroke}" stroke-width="0.6" fill-rule="nonzero"/>`,
    )
  if (layers.waterway.length)
    parts.push(`<path d="${layers.waterway.join('')}" fill="none" stroke="${S.waterway}" stroke-width="2"/>`)
  for (const c of ['service', 'minor', 'tertiary', 'secondary', 'primary', 'trunk', 'motorway']) {
    if (!layers.road[c]) continue
    const st = S.road[c]
    parts.push(
      `<path d="${layers.road[c].join('')}" fill="none" stroke="${st.color}" stroke-width="${st.width}" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
  }
  if (layers.rail.length) {
    const d = layers.rail.join('')
    parts.push(`<path d="${d}" fill="none" stroke="${S.rail}" stroke-width="2.4"/>`)
    parts.push(`<path d="${d}" fill="none" stroke="${S.bg}" stroke-width="1.2" stroke-dasharray="6 6"/>`)
  }

  const toPx = ([la, lo]) => {
    const [x, y] = project(la, lo, zoom)
    return [x - left, y - top]
  }
  if (trail.length > 1) {
    const pts = trail.map(toPx).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
    parts.push(`<polyline points="${pts}" fill="none" stroke="#000" stroke-opacity="0.6" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>`)
    parts.push(`<polyline points="${pts}" fill="none" stroke="${S.accent}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`)
  }
  if (here) {
    const [x, y] = toPx(here)
    parts.push(`<circle cx="${x}" cy="${y}" r="16" fill="${S.accent}" fill-opacity="0.2" stroke="${S.accent}" stroke-opacity="0.65" stroke-width="1"/>`)
    parts.push(`<circle cx="${x}" cy="${y}" r="7.5" fill="#000"/>`)
    parts.push(`<circle cx="${x}" cy="${y}" r="6.5" fill="${S.accent}"/>`)
    parts.push(`<circle cx="${x}" cy="${y}" r="2.5" fill="#fff"/>`)
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${parts.join('')}</svg>`
  // 256 色のパレット PNG にする（時計用に変換したときに 1 画素 1 バイトになり、転送が約 1/4 になる）
  const img = new Resvg(svg, { background: S.bg }).render()
  if (!palette) return img.asPng()
  const px = img.pixels
  const rgba = px.buffer.slice(px.byteOffset, px.byteOffset + px.byteLength)
  return Buffer.from(UPNG.encode([rgba], img.width, img.height, 256))
}
