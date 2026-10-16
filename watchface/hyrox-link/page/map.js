// 地図画面（ウォッチフェイスの全画面地図から開く）。
// スワイプで半画面ずつ移動、リューズか ＋/－ で拡大縮小、◎ で現在地へ。動かすたびにスマホ経由で地図を 1 枚もらう
import { BasePage } from '@zeppos/zml/base-page'
import { createWidget, widget, prop, align } from '@zos/ui'
import { onGesture, offGesture, GESTURE_UP, GESTURE_DOWN, GESTURE_LEFT, GESTURE_RIGHT, onDigitalCrown, offDigitalCrown } from '@zos/interaction'
import { FULL_MAP, FULL_ZOOM } from '../shared'
import { store } from '../lib/store'

const ORANGE = 0xff8c1a
const Z_MIN = 13
const Z_MAX = 17
const HOME = { lat: 34.677, lon: 135.474 }

// 緯度経度 ⇔ ズーム z の世界ピクセル（256px タイル）
function toPx(lat, lon, z) {
  const n = 256 * Math.pow(2, z)
  const s = Math.sin((lat * Math.PI) / 180)
  return [((lon + 180) / 360) * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n]
}

function toLatLon(x, y, z) {
  const n = 256 * Math.pow(2, z)
  const lon = (x / n) * 360 - 180
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI
  return [lat, lon]
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
    state: { w: {}, lat: HOME.lat, lon: HOME.lon, zoom: FULL_ZOOM, crown: 0 },

    build() {
      const w = this.state.w
      const st = store().getItem('state')
      if (st && st.lat != null) {
        this.state.lat = st.lat
        this.state.lon = st.lon
      }
      w.map = createWidget(widget.IMG, { x: 0, y: 0, w: FULL_MAP, h: FULL_MAP, src: '' })
      const full = store().getItem('mapfull')
      if (full && full.path) w.map.setProperty(prop.SRC, full.path) // 届くまでは全画面地図を出しておく
      w.zoom = createWidget(widget.TEXT, { x: 190, y: 28, w: 100, h: 28, color: ORANGE, text_size: 20, align_h: align.CENTER_H, align_v: align.CENTER_V, text: '' })
      w.status = createWidget(widget.TEXT, { x: 140, y: 420, w: 200, h: 26, color: 0xd6d6d6, text_size: 18, align_h: align.CENTER_H, align_v: align.CENTER_V, text: '' })
      button(400, 180, '+', () => this.setZoom(this.state.zoom + 1))
      button(400, 244, '-', () => this.setZoom(this.state.zoom - 1))
      button(24, 212, '◎', () => this.recenter())

      getApp()._options.globalData.onFile = (type, path) => {
        if (type !== 'view') return
        w.map.setProperty(prop.SRC, path)
        this.state.arrived = true
        // 届くまでにかかった秒数（速さの目安）
        w.status.setProperty(prop.TEXT, `${Math.round((Date.now() - this.state.startedAt) / 1000)}s`)
      }
      onGesture({
        callback: (ev) => {
          // 指の動きに地図がついてくるように: 左へスワイプ → 東へ
          if (ev === GESTURE_LEFT) this.move(1, 0)
          else if (ev === GESTURE_RIGHT) this.move(-1, 0)
          else if (ev === GESTURE_UP) this.move(0, 1)
          else if (ev === GESTURE_DOWN) this.move(0, -1)
          return true
        },
      })
      onDigitalCrown({
        callback: (key, degree) => {
          this.state.crown += degree
          if (Math.abs(this.state.crown) >= 30) {
            this.setZoom(this.state.zoom + (this.state.crown > 0 ? 1 : -1))
            this.state.crown = 0
          }
        },
      })
      this.load()
    },

    onDestroy() {
      offGesture()
      offDigitalCrown()
      getApp()._options.globalData.onFile = null
    },

    // 半画面ずつ動かす
    move(dx, dy) {
      const s = this.state
      const [x, y] = toPx(s.lat, s.lon, s.zoom)
      const [lat, lon] = toLatLon(x + (dx * FULL_MAP) / 2, y + (dy * FULL_MAP) / 2, s.zoom)
      s.lat = lat
      s.lon = lon
      this.load()
    },

    setZoom(z) {
      const zoom = Math.max(Z_MIN, Math.min(Z_MAX, z))
      if (zoom === this.state.zoom) return
      this.state.zoom = zoom
      this.load()
    },

    recenter() {
      const st = store().getItem('state')
      if (st && st.lat != null) {
        this.state.lat = st.lat
        this.state.lon = st.lon
      }
      this.load()
    },

    load() {
      const s = this.state
      s.w.zoom.setProperty(prop.TEXT, `Z${s.zoom}`)
      s.w.status.setProperty(prop.TEXT, 'LOADING…')
      s.arrived = false
      s.startedAt = Date.now()
      this.request({ method: 'link.map', params: { lat: s.lat, lon: s.lon, zoom: s.zoom } })
        .then((r) => {
          // スマホで描き終わって転送中（画像が先に届いていれば何もしない）
          if (r && !s.arrived) s.w.status.setProperty(prop.TEXT, `SENDING${r.palette ? '' : ' RGB'}…`)
        })
        .catch((e) => s.w.status.setProperty(prop.TEXT, String(e).slice(0, 24)))
    },
  }),
)
