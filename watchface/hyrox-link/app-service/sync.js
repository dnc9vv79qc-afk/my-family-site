// 自動同期（画面なしで動き続けるサービス）。AUTO_MIN 分ごとにスマホ側へ同期を頼む。
// 届いた地図は app.js が保存する。結果は 'auto' に書き、HYROX Link の画面に出す
import { Time } from '@zos/sensor'
import { AUTO_MIN } from '../shared'
import { saveState, saveAuto } from '../lib/store'

const time = new Time()
let busy = false
let waited = 0

function messaging() {
  try {
    return getApp()._options.globalData.messaging
  } catch (e) {
    return null
  }
}

function sync() {
  if (busy) return
  saveAuto({ ok: false, err: 'RUNNING' }) // 試した時刻を残す（結果で上書き）
  const m = messaging()
  if (!m) {
    saveAuto({ ok: false, err: 'NO LINK' })
    return
  }
  busy = true
  m.request({ method: 'link.sync', params: {} })
    .then((data) => {
      // サービスからの返事は包まれ方が違うことがあるので、state を探して取り出す
      const r = data && data.result !== undefined ? data.result : data
      const state = r && (r.state || (r.data && r.data.state))
      if (!state) {
        saveAuto({ ok: false, err: `EMPTY REPLY ${typeof data}` })
      } else {
        saveState(state)
        saveAuto({ ok: true })
      }
      busy = false
    })
    .catch((e) => {
      saveAuto({ ok: false, err: String((e && e.message) || e).slice(0, 24) })
      busy = false
    })
}

AppService({
  onInit() {
    time.onPerMinute(() => {
      waited += 1
      if (waited >= AUTO_MIN) {
        waited = 0
        sync()
      }
    })
    waited = 0
    sync()
  },
  onEvent() {},
  onDestroy() {},
})
