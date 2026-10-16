// 時計側: 開くとすぐ同期。受け取ったデータと地図は共有ストレージに置き、ウォッチフェイスが読む。
// AUTO を ON にすると、画面を閉じても AUTO_MIN 分ごとに自動で同期する（app-service/sync）
import { BasePage } from '@zeppos/zml/base-page'
import { createWidget, widget, prop, align } from '@zos/ui'
import { queryPermission, requestPermission } from '@zos/app'
import * as appService from '@zos/app-service'
import { MAP_H, AUTO_SERVICE, AUTO_MIN } from '../shared'
import { store, saveState, nowSec } from '../lib/store'

const ORANGE = 0xff8c1a
const GRAY = 0x8c8c8c
const BG_PERM = ['device:os.bg_service']

function text(opts) {
  return createWidget(widget.TEXT, Object.assign({ x: 40, w: 400, h: 34, color: 0xffffff, text_size: 24, align_h: align.CENTER_H, align_v: align.CENTER_V, text: '' }, opts))
}

function ago(sec) {
  if (sec == null) return '--'
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m`
  return `${Math.floor(sec / 3600)}h`
}

function autoRunning() {
  try {
    return appService.getAllAppServices().indexOf(AUTO_SERVICE) >= 0
  } catch (e) {
    return false
  }
}

Page(
  BasePage({
    state: { w: {} },

    build() {
      const w = this.state.w
      text({ y: 40, text: 'HYROX LINK', color: ORANGE, text_size: 22 })
      w.status = text({ y: 74, text: 'SYNC…', text_size: 30 })
      w.line1 = text({ y: 114, color: GRAY, text_size: 20 })
      w.line2 = text({ y: 142, color: GRAY, text_size: 20 })
      createWidget(widget.BUTTON, {
        x: 70,
        y: 182,
        w: 160,
        h: 60,
        radius: 30,
        normal_color: 0x2a2a2a,
        press_color: 0x444444,
        text: 'SYNC',
        text_size: 24,
        click_func: () => this.sync(),
      })
      w.autoBtn = createWidget(widget.BUTTON, {
        x: 250,
        y: 182,
        w: 160,
        h: 60,
        radius: 30,
        normal_color: 0x2a2a2a,
        press_color: 0x444444,
        text: 'AUTO',
        text_size: 24,
        click_func: () => this.toggleAuto(),
      })
      w.auto = text({ y: 250, color: GRAY, text_size: 18, h: 26 })
      w.map = createWidget(widget.IMG, { x: 0, y: 480 - MAP_H, w: 480, h: MAP_H, src: '' })

      const saved = store().getItem('map')
      if (saved && saved.path) w.map.setProperty(prop.SRC, saved.path)
      getApp()._options.globalData.onFile = (type, path) => {
        if (type === 'map') w.map.setProperty(prop.SRC, path)
      }
      this.showAuto()
      this.sync()
    },

    onDestroy() {
      getApp()._options.globalData.onFile = null
    },

    sync() {
      const w = this.state.w
      w.status.setProperty(prop.TEXT, 'SYNC…')
      this.request({ method: 'link.sync', params: {} })
        .then(({ state }) => {
          saveState(state)
          w.status.setProperty(prop.TEXT, state.ok ? `LINK ${ago(state.age)}` : 'NO DATA')
          w.line1.setProperty(prop.TEXT, `${state.hpa != null ? state.hpa + ' hPa' : '-- hPa'}  ·  ${state.today_km} km`)
          w.line2.setProperty(prop.TEXT, state.place || (state.lat != null ? `${state.lat.toFixed(4)}N ${state.lon.toFixed(4)}E` : ''))
        })
        .catch((e) => {
          w.status.setProperty(prop.TEXT, 'ERROR')
          w.line1.setProperty(prop.TEXT, String(e).slice(0, 40))
        })
    },

    // 自動同期の状態: ON/OFF と前回の結果
    showAuto() {
      const w = this.state.w
      const on = autoRunning()
      w.autoBtn.setProperty(prop.TEXT, on ? 'AUTO ON' : 'AUTO OFF')
      let last = null
      try {
        last = store().getItem('auto')
      } catch (e) {
        last = null
      }
      const res = last ? `  ·  last ${ago(nowSec() - last.ts)} ${last.ok ? 'OK' : last.err || 'NG'}` : ''
      w.auto.setProperty(prop.TEXT, on ? `every ${AUTO_MIN} min${res}` : `tap AUTO to sync every ${AUTO_MIN} min${res}`)
    },

    toggleAuto() {
      if (autoRunning()) {
        appService.stop({ url: AUTO_SERVICE, complete_func: () => this.showAuto() })
        return
      }
      const start = () =>
        appService.start({ url: AUTO_SERVICE, param: 'action=start', complete_func: () => this.showAuto() })
      const [perm] = queryPermission({ permissions: BG_PERM })
      if (perm === 2) return start()
      requestPermission({
        permissions: BG_PERM,
        callback: ([r]) => {
          if (r === 2) start()
          else this.state.w.auto.setProperty(prop.TEXT, 'background permission denied')
        },
      })
    },
  }),
)
