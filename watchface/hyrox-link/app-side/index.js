// スマホ（Zepp アプリ）側: watch-server から最新データと地図を取り、地図は時計用に変換して転送する
import { BaseSideService, settingsLib, convertLib } from '@zeppos/zml/base-side'
import { DEFAULT_SERVER, MAP_W, MAP_H, FULL_MAP, FULL_ZOOM, TILE } from '../shared'

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
    async sendImage(type, url, ts, name = type, extra = {}) {
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
      // タイルは何枚も続けて送るので取り消さない（同じ名前の前回分だけ取り消す）
      const key = type === 'tile' ? name : type
      if (this.state.sending[key]) this.state.sending[key].cancel()
      this.state.sending[key] = this.sendFile(dst, Object.assign({ type, ts: String(ts) }, extra))
      return { size: (conv && conv.size) || 0, palette }
    },

    // 地図画面: タイル 1 枚を送る（type 'tile'。どのタイルかは params の z/tx/ty）
    async mapTile({ z, tx, ty, slot }) {
      const c = config()
      if (!c.key) throw new Error('NO KEY')
      const q = `key=${encodeURIComponent(c.key)}`
      const url = `${c.server}/api/map?${q}&detail=${c.detail}&zoom=${z}&tile=${TILE}&tx=${tx}&ty=${ty}`
      return this.sendImage('tile', url, Math.floor(Date.now() / 1000), `tile${slot}`, { z, tx, ty })
    },

    onRequest(req, res) {
      if (req.method === 'link.tile') {
        this.mapTile(req.params || {}).then(
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
