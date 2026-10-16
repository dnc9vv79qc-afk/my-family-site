// 地図画面（ウォッチフェイスの全画面地図から開く）。
// 画面の 2 倍四方の地図を 1 枚持ち、指でなぞるとその画像を動かす（その場で動くのでなめらか）。
// 端に近づいたら裏で次の地図をもらい、届いたら継ぎ目なく差し替える。リューズか ＋/－ で拡大縮小、◎ で現在地へ
import { BasePage } from '@zeppos/zml/base-page'
import { createWidget, widget, prop, align, event } from '@zos/ui'
import { onGesture, offGesture, onDigitalCrown, offDigitalCrown } from '@zos/interaction'
import { FULL_MAP, FULL_ZOOM, BIG_MAP } from '../shared'
import { store } from '../lib/store'

const ORANGE = 0xff8c1a
const S = FULL_MAP // 画面
const B = BIG_MAP // 持っておく地図
const Z_MIN = 14 // 13 は 960px を描くのに 9 秒ほどかかるので使わない
const Z_MAX = 17
const RECENTER = 120 // 地図の中心から画面の中心がこれだけずれたら次の地図をもらう
const HOME = { lat: 34.677, lon: 135.474 }

// 緯度経度 ⇔ ズーム z の世界ピクセル（256px タイル）
function toPx(lat, lon, z) {
  const n = 256 * Math.pow(2, z)
  const s = Math.sin((lat * Math.PI) / 180)
  return [((lon + 180) / 360) * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n]
}

function toLatLon(x, y, z) {
  const n = 256 * Math.pow(2, z)
  return [(Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI, (x / n) * 360 - 180]
}

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
      // 画面の中心（世界ピクセル、zoom 基準）
      vx: 0,
      vy: 0,
      // 表示中の大きな地図の中心（null = まだ無い）と、頼んでいる地図
      img: null,
      pending: null,
      queued: false,
      drag: null,
      crown: 0,
      startedAt: 0,
    },

    build() {
      const s = this.state
      const w = s.w
      const st = store().getItem('state')
      const here = st && st.lat != null ? st : HOME
      ;[s.vx, s.vy] = toPx(here.lat, here.lon, s.zoom)

      // 届くまでは全画面地図（同じズーム・現在地が中心）を出しておく
      w.placeholder = createWidget(widget.IMG, { x: 0, y: 0, w: S, h: S, src: '' })
      const full = store().getItem('mapfull')
      if (full && full.path) w.placeholder.setProperty(prop.SRC, full.path)
      w.big = createWidget(widget.IMG, { x: -(B - S) / 2, y: -(B - S) / 2, w: B, h: B, src: '' })

      // 指でなぞる面（ボタンより下に置く）
      const touch = createWidget(widget.IMG, { x: 0, y: 0, w: S, h: S, src: 'blank.png' })
      touch.addEventListener(event.CLICK_DOWN, (e) => {
        s.drag = { x: e.x, y: e.y }
      })
      touch.addEventListener(event.MOVE, (e) => {
        if (!s.drag || !s.img) return
        s.vx -= e.x - s.drag.x
        s.vy -= e.y - s.drag.y
        s.drag = { x: e.x, y: e.y }
        this.place()
      })
      touch.addEventListener(event.CLICK_UP, () => {
        s.drag = null
        this.maybeRecenter()
      })

      w.zoom = createWidget(widget.TEXT, { x: 190, y: 28, w: 100, h: 28, color: ORANGE, text_size: 20, align_h: align.CENTER_H, align_v: align.CENTER_V, text: `Z${s.zoom}` })
      w.status = createWidget(widget.TEXT, { x: 140, y: 420, w: 200, h: 26, color: 0xd6d6d6, text_size: 18, align_h: align.CENTER_H, align_v: align.CENTER_V, text: '' })
      button(400, 180, '+', () => this.setZoom(s.zoom + 1))
      button(400, 244, '-', () => this.setZoom(s.zoom - 1))
      button(24, 212, '◎', () => this.recenter())

      getApp()._options.globalData.onFile = (type, path) => {
        if (type === 'view') this.arrived(path)
      }
      // スワイプで画面が戻らないように（地図を動かす操作に使う）
      onGesture({ callback: () => true })
      onDigitalCrown({
        callback: (key, degree) => {
          s.crown += degree
          if (Math.abs(s.crown) >= 30) {
            this.setZoom(s.zoom + (s.crown > 0 ? 1 : -1))
            s.crown = 0
          }
        },
      })
      this.request_(true)
    },

    onDestroy() {
      offGesture()
      offDigitalCrown()
      getApp()._options.globalData.onFile = null
    },

    // 画面の中心が地図のどこかに合わせて大きな地図を置く（画面からはみ出さない範囲で）
    place() {
      const s = this.state
      const lim = (B - S) / 2
      s.vx = Math.max(s.img.x - lim, Math.min(s.img.x + lim, s.vx))
      s.vy = Math.max(s.img.y - lim, Math.min(s.img.y + lim, s.vy))
      s.w.big.setProperty(prop.X, Math.round(S / 2 - B / 2 - (s.vx - s.img.x)))
      s.w.big.setProperty(prop.Y, Math.round(S / 2 - B / 2 - (s.vy - s.img.y)))
    },

    maybeRecenter() {
      const s = this.state
      if (s.img && (Math.abs(s.vx - s.img.x) > RECENTER || Math.abs(s.vy - s.img.y) > RECENTER)) this.request_(false)
    },

    // 今の画面の中心で地図を頼む（1 枚ずつ。頼んでいる間に動いたら届いてからもう一度）
    request_(showLoading) {
      const s = this.state
      if (s.pending) {
        s.queued = true
        return
      }
      const [lat, lon] = toLatLon(s.vx, s.vy, s.zoom)
      s.pending = { x: s.vx, y: s.vy, zoom: s.zoom }
      s.startedAt = Date.now()
      if (showLoading) s.w.status.setProperty(prop.TEXT, 'LOADING…')
      this.request({ method: 'link.map', params: { lat, lon, zoom: s.zoom, size: B } }).catch((e) => {
        s.pending = null
        s.w.status.setProperty(prop.TEXT, String(e).slice(0, 24))
      })
    },

    arrived(path) {
      const s = this.state
      if (!s.pending) return
      const p = s.pending
      s.pending = null
      if (p.zoom === s.zoom) {
        s.img = { x: p.x, y: p.y }
        s.w.big.setProperty(prop.SRC, path)
        s.w.placeholder.setProperty(prop.VISIBLE, false)
        this.place()
        s.w.status.setProperty(prop.TEXT, '')
      }
      if (s.queued || p.zoom !== s.zoom) {
        s.queued = false
        this.request_(p.zoom !== s.zoom)
      } else {
        this.maybeRecenter()
      }
    },

    setZoom(z) {
      const s = this.state
      const zoom = Math.max(Z_MIN, Math.min(Z_MAX, z))
      if (zoom === s.zoom) return
      const k = Math.pow(2, zoom - s.zoom)
      s.vx *= k
      s.vy *= k
      s.img = null // 新しいズームの地図が届くまで今の絵のまま（指では動かさない）
      s.zoom = zoom
      s.w.zoom.setProperty(prop.TEXT, `Z${zoom}`)
      this.request_(true)
    },

    recenter() {
      const s = this.state
      const st = store().getItem('state')
      if (!st || st.lat == null) return
      ;[s.vx, s.vy] = toPx(st.lat, st.lon, s.zoom)
      if (s.img && Math.abs(s.vx - s.img.x) <= (B - S) / 2 && Math.abs(s.vy - s.img.y) <= (B - S) / 2) this.place()
      this.request_(true)
    },
  }),
)
