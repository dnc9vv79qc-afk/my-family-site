// 地図画面（ウォッチフェイスの全画面地図から開く）。現在地が真ん中の地図をズーム 13〜17 で持っておき、
// リューズか ＋/－ ですぐ切り替える。Z15 は同期で届いている全画面地図、ほかは開いたときに裏で 1 枚ずつもらう
// （近いズームから順に）。30 分以内で現在地が変わっていなければ、次に開いたときもそのまま使う
import { BasePage } from '@zeppos/zml/base-page'
import { createWidget, widget, prop, align } from '@zos/ui'
import { onDigitalCrown, offDigitalCrown } from '@zos/interaction'
import { FULL_MAP, FULL_ZOOM } from '../shared'
import { store } from '../lib/store'

const ORANGE = 0xff8c1a
const ZOOMS = [13, 14, 15, 16, 17]
const KEEP_MS = 30 * 60 * 1000

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

// 現在地がほぼ同じか（約 50m 以内）
function samePlace(a, b) {
  return a && b && Math.abs(a.lat - b.lat) < 0.0005 && Math.abs(a.lon - b.lon) < 0.0006
}

Page(
  BasePage({
    state: { w: {}, zoom: FULL_ZOOM, maps: {}, here: null, crown: 0, busy: false, round: 0 },

    build() {
      const s = this.state
      const w = s.w
      const st = store().getItem('state')
      s.here = st && st.lat != null ? { lat: st.lat, lon: st.lon } : null

      const cache = store().getItem('zoommaps')
      if (cache && cache.maps && Date.now() - (cache.ts || 0) < KEEP_MS && samePlace(cache.here, s.here)) {
        s.maps = cache.maps
        s.round = cache.round || 0
      }
      const full = store().getItem('mapfull')
      if (full && full.path) s.maps[FULL_ZOOM] = full.path

      w.map = createWidget(widget.IMG, { x: 0, y: 0, w: FULL_MAP, h: FULL_MAP, src: s.maps[s.zoom] || '' })
      w.zoom = createWidget(widget.TEXT, { x: 190, y: 28, w: 100, h: 28, color: ORANGE, text_size: 20, align_h: align.CENTER_H, align_v: align.CENTER_V, text: '' })
      w.status = createWidget(widget.TEXT, { x: 90, y: 420, w: 300, h: 26, color: 0xd6d6d6, text_size: 18, align_h: align.CENTER_H, align_v: align.CENTER_V, text: '' })
      button(400, 180, '+', () => this.setZoom(s.zoom + 1))
      button(400, 244, '-', () => this.setZoom(s.zoom - 1))

      getApp()._options.globalData.onFile = (type, path) => {
        if (type !== 'zoom') return
        const m = /zoom(\d+)_/.exec(String(path))
        if (!m) return
        s.maps[Number(m[1])] = path
        this.save()
        this.show()
      }
      onDigitalCrown({
        callback: (key, degree) => {
          s.crown += degree
          if (Math.abs(s.crown) >= 30) {
            this.setZoom(s.zoom + (s.crown > 0 ? 1 : -1))
            s.crown = 0
          }
        },
      })
      this.show()
      this.fetch()
    },

    onDestroy() {
      offDigitalCrown()
      getApp()._options.globalData.onFile = null
    },

    save() {
      const s = this.state
      try {
        store().setItem('zoommaps', { maps: s.maps, here: s.here, ts: Date.now(), round: s.round })
      } catch (e) {
        // 残せなくても次に開いたとき取り直すだけ
      }
    },

    show() {
      const s = this.state
      s.w.zoom.setProperty(prop.TEXT, `Z${s.zoom}`)
      if (s.maps[s.zoom]) s.w.map.setProperty(prop.SRC, s.maps[s.zoom])
      const have = ZOOMS.filter((z) => s.maps[z]).length
      s.w.status.setProperty(prop.TEXT, s.maps[s.zoom] ? (have < ZOOMS.length ? `${have}/${ZOOMS.length}` : '') : 'LOADING…')
    },

    setZoom(z) {
      const s = this.state
      const zoom = Math.max(ZOOMS[0], Math.min(ZOOMS[ZOOMS.length - 1], z))
      if (zoom === s.zoom) return
      s.zoom = zoom
      this.show()
    },

    // まだ無いズームを、今のズームに近い順にまとめて頼む（スマホが 1 枚ずつ順に送る）
    fetch() {
      const s = this.state
      if (s.busy) return
      const need = ZOOMS.filter((z) => !s.maps[z]).sort((a, b) => Math.abs(a - s.zoom) - Math.abs(b - s.zoom))
      if (!need.length) return
      s.busy = true
      s.round = 1 - s.round // 同じ名前だと画像が更新されないので 2 組の名前を交互に使う
      this.request({ method: 'link.zooms', params: { zooms: need, round: s.round } }, { timeout: 120000 })
        .then(() => {
          s.busy = false
        })
        .catch((e) => {
          s.busy = false
          s.w.status.setProperty(prop.TEXT, String((e && e.message) || e).slice(0, 24))
        })
    },
  }),
)
