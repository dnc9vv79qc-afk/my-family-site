// 地図画面（ウォッチフェイスの全画面地図から開く）。
// ズームごとに世界を TILE px 四方のタイルに区切り、画面のまわりのタイルだけをスマホ経由でもらう（真ん中に近い順）。
// 指でなぞるとタイルを並べ直すだけなので、その場でなめらかに動く。リューズか ＋/－ で拡大縮小、◎ で現在地へ
import { BasePage } from '@zeppos/zml/base-page'
import { createWidget, widget, prop, align, event } from '@zos/ui'
import { onGesture, offGesture, onDigitalCrown, offDigitalCrown } from '@zos/interaction'
import { FULL_MAP, FULL_ZOOM, TILE } from '../shared'
import { store } from '../lib/store'

const ORANGE = 0xff8c1a
const S = FULL_MAP // 画面
const Z_MIN = 13
const Z_MAX = 17
const POOL = 16 // 画面に並べる IMG の数（3×3 で足り、余りは動かし中の予備）
const SLOTS = 48 // 時計に置いておくタイル画像の数（古いものから上書き）
const IN_FLIGHT = 3 // 同時に頼むタイル数
const HOME = { lat: 34.677, lon: 135.474 }

function toPx(lat, lon, z) {
  const n = 256 * Math.pow(2, z)
  const s = Math.sin((lat * Math.PI) / 180)
  return [((lon + 180) / 360) * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n]
}

const keyOf = (z, tx, ty) => `${z}/${tx}/${ty}`

function button(x, y, text, onClick) {
  return createWidget(widget.BUTTON, {
    x,
    y,
    w: 56,
    h: 56,
    radius: 28,
    normal_color: 0x1e1e1e,
    press_color: 0x444444,
    color: 0xffffff,
    text,
    text_size: 30,
    click_func: onClick,
  })
}

Page(
  BasePage({
    state: {
      w: {},
      zoom: FULL_ZOOM,
      vx: 0, // 画面の中心（世界ピクセル）
      vy: 0,
      tiles: {}, // key -> { path, slot }
      slotKey: [], // slot -> key
      nextSlot: 0,
      asked: {}, // key -> 頼んだ時刻（30 秒届かなければ頼み直す）
      inFlight: 0,
      pool: [], // { img, key }
      drag: null,
      crown: 0,
      base: null,
    },

    build() {
      const s = this.state
      const w = s.w
      const st = store().getItem('state')
      const here = st && st.lat != null ? st : HOME
      ;[s.vx, s.vy] = toPx(here.lat, here.lon, s.zoom)
      // 全画面地図はこのズームで現在地が真ん中。タイルの下に敷き、指の動きに合わせて一緒に動かす
      s.base = { x: s.vx, y: s.vy, zoom: s.zoom }

      // タイルが届くまでの下敷き
      w.placeholder = createWidget(widget.IMG, { x: 0, y: 0, w: S, h: S, src: '' })
      const full = store().getItem('mapfull')
      if (full && full.path) w.placeholder.setProperty(prop.SRC, full.path)
      for (let i = 0; i < POOL; i++) {
        const img = createWidget(widget.IMG, { x: -TILE, y: -TILE, w: TILE, h: TILE, src: '' })
        img.setProperty(prop.VISIBLE, false)
        s.pool.push({ img, key: null })
      }

      // 指でなぞる面（ボタンより下）
      const touch = createWidget(widget.IMG, { x: 0, y: 0, w: S, h: S, src: 'blank.png' })
      touch.addEventListener(event.CLICK_DOWN, (e) => {
        s.drag = { x: e.x, y: e.y }
      })
      touch.addEventListener(event.MOVE, (e) => {
        if (!s.drag) return
        s.vx -= e.x - s.drag.x
        s.vy -= e.y - s.drag.y
        s.drag = { x: e.x, y: e.y }
        this.place()
      })
      touch.addEventListener(event.CLICK_UP, () => {
        s.drag = null
        this.fetch()
      })

      w.zoom = createWidget(widget.TEXT, { x: 190, y: 28, w: 100, h: 28, color: ORANGE, text_size: 20, align_h: align.CENTER_H, align_v: align.CENTER_V, text: `Z${s.zoom}` })
      w.status = createWidget(widget.TEXT, { x: 140, y: 420, w: 200, h: 26, color: 0xd6d6d6, text_size: 18, align_h: align.CENTER_H, align_v: align.CENTER_V, text: '' })
      button(400, 180, '+', () => this.setZoom(s.zoom + 1))
      button(400, 244, '-', () => this.setZoom(s.zoom - 1))
      button(24, 212, '◎', () => this.recenter())

      getApp()._options.globalData.onFile = (type, path, params) => {
        if (type === 'tile') this.arrived(path, params)
      }
      onGesture({ callback: () => true }) // スワイプで画面が戻らないように
      onDigitalCrown({
        callback: (key, degree) => {
          s.crown += degree
          if (Math.abs(s.crown) >= 30) {
            this.setZoom(s.zoom + (s.crown > 0 ? 1 : -1))
            s.crown = 0
          }
        },
      })
      this.place()
      this.fetch()
    },

    onDestroy() {
      offGesture()
      offDigitalCrown()
      getApp()._options.globalData.onFile = null
    },

    // 画面にかかるタイルを並べる（届いているものだけ）
    place() {
      const s = this.state
      const left = s.vx - S / 2
      const top = s.vy - S / 2
      // 下敷き（全画面地図）は同じズームのときだけ、ずらして出す
      const b = s.base
      const ph = s.w.placeholder
      if (b.zoom === s.zoom && Math.abs(s.vx - b.x) < S && Math.abs(s.vy - b.y) < S) {
        ph.setProperty(prop.X, Math.round(b.x - s.vx))
        ph.setProperty(prop.Y, Math.round(b.y - s.vy))
        ph.setProperty(prop.VISIBLE, true)
      } else {
        ph.setProperty(prop.VISIBLE, false)
      }
      const want = {}
      for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + S - 1) / TILE); tx++) {
        for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + S - 1) / TILE); ty++) {
          const k = keyOf(s.zoom, tx, ty)
          if (s.tiles[k]) want[k] = [tx, ty]
        }
      }
      // 使い続ける IMG はそのまま、空いた IMG に新しいタイルを
      const free = []
      s.pool.forEach((p) => {
        if (p.key && want[p.key]) return
        p.key = null
        free.push(p)
      })
      Object.keys(want).forEach((k) => {
        if (s.pool.some((p) => p.key === k)) return
        const p = free.pop()
        if (!p) return
        p.key = k
        p.img.setProperty(prop.SRC, s.tiles[k].path)
      })
      s.pool.forEach((p) => {
        if (!p.key) {
          p.img.setProperty(prop.VISIBLE, false)
          return
        }
        const [tx, ty] = want[p.key]
        p.img.setProperty(prop.X, Math.round(tx * TILE - left))
        p.img.setProperty(prop.Y, Math.round(ty * TILE - top))
        p.img.setProperty(prop.VISIBLE, true)
      })
    },

    // 画面とそのまわり 1 枚ぶんで、まだ無いタイルを真ん中に近い順に頼む
    fetch() {
      const s = this.state
      const cx = Math.floor(s.vx / TILE)
      const cy = Math.floor(s.vy / TILE)
      const need = []
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
          const k = keyOf(s.zoom, cx + dx, cy + dy)
          if (!s.tiles[k] && !(s.asked[k] && Date.now() - s.asked[k] < 30000)) need.push({ k, tx: cx + dx, ty: cy + dy, d: dx * dx + dy * dy })
        }
      }
      need.sort((a, b) => a.d - b.d)
      while (s.inFlight < IN_FLIGHT && need.length) {
        const t = need.shift()
        this.ask(t.k, t.tx, t.ty)
      }
      this.showStatus()
    },

    // 画面とまわりのタイルが何枚届いているか（届いていないときだけ出す）
    showStatus() {
      const s = this.state
      const cx = Math.floor(s.vx / TILE)
      const cy = Math.floor(s.vy / TILE)
      let have = 0
      let all = 0
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
          all++
          if (s.tiles[keyOf(s.zoom, cx + dx, cy + dy)]) have++
        }
      }
      const asking = Object.keys(s.asked).length
      s.w.status.setProperty(prop.TEXT, have < all ? `TILES ${have}/${all}${asking ? ` · ${asking}…` : ''}` : '')
    },

    ask(k, tx, ty) {
      const s = this.state
      // 時計に置く画像は SLOTS 枚まで。古いものを上書きする
      const slot = s.nextSlot
      s.nextSlot = (s.nextSlot + 1) % SLOTS
      const old = s.slotKey[slot]
      if (old) delete s.tiles[old]
      s.slotKey[slot] = k
      s.asked[k] = Date.now()
      s.inFlight++
      // スマホが描いて転送を始めたら次を頼む（届くのは onFile）
      this.request({ method: 'link.tile', params: { z: s.zoom, tx, ty, slot } })
        .then(() => {
          s.inFlight = Math.max(0, s.inFlight - 1)
          s.sent = (s.sent || 0) + 1
          this.fetch()
        })
        .catch(() => {
          delete s.asked[k]
          s.inFlight = Math.max(0, s.inFlight - 1)
          s.w.status.setProperty(prop.TEXT, 'ERROR')
        })
    },

    arrived(path, params) {
      const s = this.state
      // どのタイルか: params（z/tx/ty）か、無ければファイル名の tile<slot> から
      let k = params && params.z != null && params.tx != null ? keyOf(params.z, params.tx, params.ty) : null
      if (!k) {
        const m = /tile(\d+)/.exec(String(path))
        k = m ? s.slotKey[Number(m[1])] : null
      }
      if (!k) return
      const z = Number(k.split('/')[0])
      if (!s.asked[k] || s.slotKey.indexOf(k) < 0) return
      delete s.asked[k]
      s.tiles[k] = { path }
      if (z === s.zoom) {
        this.place()
      }
      this.fetch()
    },

    setZoom(z) {
      const s = this.state
      const zoom = Math.max(Z_MIN, Math.min(Z_MAX, z))
      if (zoom === s.zoom) return
      const k = Math.pow(2, zoom - s.zoom)
      s.vx *= k
      s.vy *= k
      s.zoom = zoom
      s.w.zoom.setProperty(prop.TEXT, `Z${zoom}`)
      this.place()
      this.fetch()
    },

    recenter() {
      const s = this.state
      const st = store().getItem('state')
      if (!st || st.lat == null) return
      ;[s.vx, s.vy] = toPx(st.lat, st.lon, s.zoom)
      this.place()
      this.fetch()
    },
  }),
)
