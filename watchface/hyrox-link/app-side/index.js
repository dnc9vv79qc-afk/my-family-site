// スマホ（Zepp アプリ）側: watch-server から最新データと地図を取り、地図は時計用に変換して転送する
import { BaseSideService, settingsLib, convertLib } from '@zeppos/zml/base-side'
import { DEFAULT_SERVER, MAP_W, MAP_H, FULL_MAP, FULL_ZOOM } from '../shared'

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
        // HUD（雨）と全画面地図は失敗しても同期全体は成功扱い
        await this.sendImage('hud', `${c.server}/api/hud?${q}`, state.now).catch(() => {})
        await this.sendImage('mapfull', `${c.server}/api/map?${q}&detail=${c.detail}&zoom=${FULL_ZOOM}&w=${FULL_MAP}&h=${FULL_MAP}&center=here`, state.now).catch(() => {})
      }
      return { state, map }
    },

    // PNG を取得 → 時計用に変換 → 転送（同じ種類の前回の転送が残っていれば取り消す）
    async sendImage(type, url, ts, name = type) {
      await downloadOnce(this, url, `${name}.png`)
      const dst = `data://download/${name}_watch.png`
      const conv = await convertLib.convert({ filePath: `data://download/${name}.png`, targetFilePath: dst })
      if (this.state.sending[type]) this.state.sending[type].cancel()
      this.state.sending[type] = this.sendFile(dst, { type, ts: String(ts) })
      return (conv && conv.size) || 0
    },

    // 地図画面: 指定した場所・ズームの地図を 1 枚送る（type 'view'）
    async mapView({ lat, lon, zoom }) {
      const c = config()
      if (!c.key) throw new Error('NO KEY')
      const q = `key=${encodeURIComponent(c.key)}`
      const z = Math.max(12, Math.min(18, Math.round(Number(zoom) || FULL_ZOOM)))
      const url = `${c.server}/api/map?${q}&detail=${c.detail}&zoom=${z}&w=${FULL_MAP}&h=${FULL_MAP}&lat=${Number(lat).toFixed(5)}&lon=${Number(lon).toFixed(5)}`
      // 同じ名前だと時計の画像が更新されないので 2 つの名前を交互に使う
      this.state.viewSlot = 1 - (this.state.viewSlot || 0)
      const size = await this.sendImage('view', url, Math.floor(Date.now() / 1000), `view${this.state.viewSlot}`)
      return { ok: true, size }
    },

    onRequest(req, res) {
      if (req.method === 'link.map') {
        this.mapView(req.params || {}).then(
          (data) => res(null, data),
          (e) => res(String((e && e.message) || e)),
        )
        return
      }
      if (req.method !== 'link.sync') return res('unknown method')
      this.sync().then(
        (data) => res(null, data),
        (e) => res(String((e && e.message) || e)),
      )
    },
  }),
)
