// 時計側: 開くとすぐ同期。受け取ったデータと地図は共有ストレージに置き、ウォッチフェイスが読む
import { BasePage } from '@zeppos/zml/base-page'
import { createWidget, widget, prop, align } from '@zos/ui'
import { ShareLocalStorage } from '@zos/storage'
import { LINK_STORAGE, MAP_H } from '../shared'

const ORANGE = 0xff8c1a
const GRAY = 0x8c8c8c

let shared = null
function store() {
  if (!shared) shared = new ShareLocalStorage(LINK_STORAGE)
  return shared
}

function text(opts) {
  return createWidget(widget.TEXT, Object.assign({ x: 40, w: 400, h: 34, color: 0xffffff, text_size: 24, align_h: align.CENTER_H, align_v: align.CENTER_V, text: '' }, opts))
}

function ago(sec) {
  if (sec == null) return '--'
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m`
  return `${Math.floor(sec / 3600)}h`
}

Page(
  BasePage({
    state: { w: {} },

    build() {
      const w = this.state.w
      text({ y: 48, text: 'HYROX LINK', color: ORANGE, text_size: 22 })
      w.status = text({ y: 86, text: 'SYNC…', text_size: 30 })
      w.line1 = text({ y: 130, color: GRAY, text_size: 22 })
      w.line2 = text({ y: 162, color: GRAY, text_size: 22 })
      createWidget(widget.BUTTON, {
        x: 150,
        y: 206,
        w: 180,
        h: 64,
        radius: 32,
        normal_color: 0x2a2a2a,
        press_color: 0x444444,
        text: 'SYNC',
        text_size: 26,
        click_func: () => this.sync(),
      })
      w.map = createWidget(widget.IMG, { x: 0, y: 300, w: 480, h: MAP_H, src: '' })

      const saved = store().getItem('map')
      if (saved && saved.path) w.map.setProperty(prop.SRC, saved.path)
      this.sync()
    },

    sync() {
      const w = this.state.w
      w.status.setProperty(prop.TEXT, 'SYNC…')
      this.request({ method: 'link.sync', params: {} })
        .then(({ state }) => {
          const now = Math.floor(Date.now() / 1000)
          store().setItem('state', Object.assign({}, state, { synced: now }))
          w.status.setProperty(prop.TEXT, state.ok ? `LINK ${ago(state.age)}` : 'NO DATA')
          w.line1.setProperty(prop.TEXT, `${state.hpa != null ? state.hpa + ' hPa' : '-- hPa'}  ·  ${state.today_km} km`)
          w.line2.setProperty(prop.TEXT, state.lat != null ? `${state.lat.toFixed(4)}N ${state.lon.toFixed(4)}E` : '')
        })
        .catch((e) => {
          w.status.setProperty(prop.TEXT, 'ERROR')
          w.line1.setProperty(prop.TEXT, String(e).slice(0, 40))
        })
    },

    onReceivedFile(file) {
      file.on('change', (ev) => {
        if (ev.data.readyState !== 'transferred') return
        store().setItem('map', { path: file.filePath, ts: Math.floor(Date.now() / 1000) })
        this.state.w.map && this.state.w.map.setProperty(prop.SRC, file.filePath)
      })
    },
  }),
)
