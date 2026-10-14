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
    state: { sending: {} },

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
        await this.sendImage('map', `${c.server}/api/map?${q}&detail=${c.detail}&w=${MAP_W}&h=${MAP_H}`, state.now)
        map = true
        // HUD（アイコン列）は失敗しても同期全体は成功扱い
        await this.sendImage('hud', `${c.server}/api/hud?${q}`, state.now).catch(() => {})
      }
      return { state, map }
    },

    // PNG を取得 → 時計用に変換 → 転送（同じ種類の前回の転送が残っていれば取り消す）
    async sendImage(type, url, ts) {
      await downloadOnce(this, url, `${type}.png`)
      const dst = `data://download/${type}_watch.png`
      await convertLib.convert({ filePath: `data://download/${type}.png`, targetFilePath: dst })
      if (this.state.sending[type]) this.state.sending[type].cancel()
      this.state.sending[type] = this.sendFile(dst, { type, ts: String(ts) })
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
