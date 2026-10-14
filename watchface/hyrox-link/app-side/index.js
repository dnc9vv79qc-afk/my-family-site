// スマホ（Zepp アプリ）側: watch-server から最新データと地図を取り、地図は時計用に変換して転送する
import { BaseSideService, settingsLib, convertLib } from '@zeppos/zml/base-side'
import { DEFAULT_SERVER, MAP_W, MAP_H } from '../shared'

function config() {
  const server = String(settingsLib.getItem('server') || DEFAULT_SERVER).trim().replace(/\/+$/, '')
  const key = String(settingsLib.getItem('key') || '').trim()
  const detail = String(settingsLib.getItem('detail') || '2')
  return { server, key, detail }
}

function parse(body) {
  return typeof body === 'string' ? JSON.parse(body) : body
}

function downloadOnce(svc, url, filePath) {
  return new Promise((resolve, reject) => {
    const task = svc.download(url, { timeout: 20000, filePath })
    task.onSuccess = (data) => resolve(data)
    task.onFail = (e) => reject(e)
  })
}

AppSideService(
  BaseSideService({
    state: { sending: null },

    onInit() {},
    onRun() {},
    onDestroy() {},

    async sync() {
      const c = config()
      if (!c.key) throw new Error('NO KEY: Zepp アプリの設定で合言葉を入れてください')
      const q = `key=${encodeURIComponent(c.key)}`
      const res = await fetch({ url: `${c.server}/api/state?${q}`, method: 'GET' })
      const state = parse(res.body)
      if (!state || state.ok === undefined) throw new Error(`state ${res.status}`)

      let map = false
      if (state.ok) {
        const url = `${c.server}/api/map?${q}&detail=${c.detail}&w=${MAP_W}&h=${MAP_H}`
        await downloadOnce(this, url, 'map.png')
        await convertLib.convert({ filePath: 'data://download/map.png', targetFilePath: 'data://download/map_watch.png' })
        if (this.state.sending) this.state.sending.cancel()
        this.state.sending = this.sendFile('data://download/map_watch.png', { type: 'map', ts: String(state.now) })
        map = true
      }
      return { state, map }
    },

    onRequest(req, res) {
      if (req.method !== 'link.sync') return res('unknown method')
      this.sync().then(
        (data) => res(null, data),
        (e) => res(String((e && e.message) || e)),
      )
    },
  }),
)
