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

function withTimeout(p, ms, msg) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(msg)), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
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

    // PNG を取得 → 時計用に変換 → 転送（同じ種類の前回の転送が残っていれば取り消す）。
    // 256 色の PNG を変換できなかったとき・終わらないときはフルカラーで取り直す
    async sendImage(type, url, ts, name = type) {
      const dst = `data://download/${name}_watch.png`
      const prepare = async (u) => {
        await downloadOnce(this, u, `${name}.png`)
        return withTimeout(convertLib.convert({ filePath: `data://download/${name}.png`, targetFilePath: dst }), 15000, 'CONVERT TIMEOUT')
      }
      let conv = null
      let palette = !url.includes('/api/hud')
      try {
        conv = await prepare(url)
      } catch (e) {
        if (!palette) throw e
        palette = false
        conv = await prepare(`${url}&palette=0`)
      }
      // 地図画面のズーム違いは続けて送るので取り消さない（同じ名前の前回分だけ取り消す）
      const key = type === 'zoom' ? name : type
      if (this.state.sending[key]) this.state.sending[key].cancel()
      this.state.sending[key] = this.sendFile(dst, { type, ts: String(ts) })
      return { size: (conv && conv.size) || 0, palette }
    },

    // 地図画面: 現在地が真ん中の全画面地図を、頼まれたズームの順に 1 枚ずつ送る（並べて送ると時計に届かなかった）
    async mapZooms({ zooms, round }) {
      const c = config()
      if (!c.key) throw new Error('NO KEY')
      const q = `key=${encodeURIComponent(c.key)}`
      let sent = 0
      for (const z of zooms || []) {
        const zoom = Math.max(12, Math.min(18, Math.round(Number(z))))
        const url = `${c.server}/api/map?${q}&detail=${c.detail}&zoom=${zoom}&w=${FULL_MAP}&h=${FULL_MAP}&center=here`
        try {
          // ファイル名（zoom<z>_<round>）で時計側がどのズームか分かる
          await this.sendImage('zoom', url, Math.floor(Date.now() / 1000), `zoom${zoom}_${round ? 1 : 0}`)
          sent++
        } catch (e) {
          // 1 枚失敗しても残りは送る
        }
      }
      return { sent }
    },

    onRequest(req, res) {
      if (req.method === 'link.zooms') {
        this.mapZooms(req.params || {}).then(
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
