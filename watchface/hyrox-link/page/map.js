// 地図画面（ウォッチフェイスの全画面地図から開く）。現在地が真ん中の地図をズーム 13〜17 で持っておき、
// リューズか ＋/－ ですぐ切り替える。Z14〜16 は同期で届いている。足りないズームは開いたときに裏で 1 枚ずつもらう
// （近いズームから順に）。現在地が変わって新しい版（map_sig）になったものだけ取り直す
import { BasePage } from '@zeppos/zml/base-page'
import { createWidget, widget, prop, align } from '@zos/ui'
import { onDigitalCrown, offDigitalCrown } from '@zos/interaction'
import { FULL_MAP, FULL_ZOOM } from '../shared'
import { store } from '../lib/store'

const ORANGE = 0xff8c1a
const ZOOMS = [13, 14, 15, 16, 17]

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
    state: { w: {}, zoom: FULL_ZOOM, maps: {}, crown: 0, busy: false },

    build() {
      const s = this.state
      const w = s.w
      const st = store().getItem('state')

      // 今の現在地の版（map_sig）のズーム違いだけ使う。Z15 は全画面地図
      const sig = st && st.map_sig
      ZOOMS.forEach((z) => {
        const e = store().getItem(z === FULL_ZOOM ? 'mapfull' : `zoom${z}`)
        // 同期の返事より先に届いた画像は古い版の印が付くことがあるので、同期の前後 5 分に届いたものも今の版とみなす
        const fresh = e && (!e.sig || e.sig === sig || (st && st.synced && e.ts >= st.synced - 300))
        if (e && e.path && fresh) s.maps[z] = e.path
      })

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
      this.request({ method: 'link.zooms', params: { zooms: need } }, { timeout: 120000 })
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
