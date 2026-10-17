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

function msg(e) {
  return String((e && e.message) || e)
}

// convert が Promise を返さない場合でも待てるように Promise.resolve で包む
function withTimeout(p, ms, text) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(text)), ms)
    Promise.resolve(p).then(
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

// 転送中の画像・ズーム画像の名前の交互・画像を送っている最中か
const run = { sending: {}, zoomName: {}, imaging: false }

AppSideService(
  BaseSideService({
    onInit() {},
    onRun() {},
    onDestroy() {},

    // 時計への返事は最新データ（state）だけにしてすぐ返す。地図などの画像はそのあと裏で送る
    // （画像を待ってから返すと、どこか 1 つ失敗しただけで位置まで同期されなくなっていた）
    async sync() {
      const c = config()
      if (!c.key) throw new Error('NO KEY: Zepp アプリの設定で合言葉を入れてください')
      const q = `key=${encodeURIComponent(c.key)}`
      let res = null
      let state = null
      try {
        res = await fetch({ url: `${c.server}/api/state?${q}`, method: 'GET' })
        state = parse(res && res.body)
      } catch (e) {
        throw new Error(`STATE ${msg(e)}`)
      }
      if (!state || state.ok === undefined) throw new Error(`STATE ${res && res.status}`)
      const imgErr = String(settingsLib.getItem('img_err') || '')
      if (state.ok) this.images(c, q, state).catch(() => {})
      return { state, imgErr }
    },

    // 地図・全画面地図・両隣のズーム・雨の画像を 1 枚ずつ送る。失敗したら どの画像で 何が起きたか を残し、次の同期の返事で時計に見せる
    async images(c, q, state) {
      if (run.imaging) return
      run.imaging = true
      const errs = []
      const step = async (name, fn) => {
        try {
          await fn()
          return true
        } catch (e) {
          errs.push(`${name} ${msg(e)}`)
          return false
        }
      }
      try {
        // 地図の中身（現在地・軌跡・描き方）が前回送ったときと同じなら、地図は取り直さず送らない。
        // 届かなかった場合に備えて 2 時間たったら送り直す
        const sig = `${state.map_sig}|${c.detail}`
        const last = settingsLib.getItem('sent_sig')
        const lastAt = Number(settingsLib.getItem('sent_at') || 0)
        const same = state.map_sig && sig === last && Date.now() - lastAt < 2 * 3600 * 1000
        if (!same) {
          const ok = await step('MAP', () => this.sendImage('map', `${c.server}/api/map?${q}&detail=${c.detail}&w=${MAP_W}&h=${MAP_H}`, state.now))
          const full = await step('FULL', () => this.sendImage('mapfull', `${c.server}/api/map?${q}&detail=${c.detail}&zoom=${FULL_ZOOM}&w=${FULL_MAP}&h=${FULL_MAP}&center=here`, state.now))
          // 地図画面ですぐ切り替えられるよう両隣のズームも
          await step('ZOOM', () => this.mapZooms({ zooms: [FULL_ZOOM - 1, FULL_ZOOM + 1] }))
          if (ok && full) {
            settingsLib.setItem('sent_sig', sig)
            settingsLib.setItem('sent_at', String(Date.now()))
          }
        }
        // 雨は時間で変わるので毎回（小さい画像）
        await step('RAIN', () => this.sendImage('hud', `${c.server}/api/hud?${q}`, state.now))
      } catch (e) {
        errs.push(`IMG ${msg(e)}`)
      }
      try {
        settingsLib.setItem('img_err', errs.join(' / ').slice(0, 80))
      } catch (e) {
        // 記録できなくても画像の転送には関係ない
      } finally {
        run.imaging = false
      }
    },

    // PNG を取得 → 時計用に変換 → 転送（同じ種類の前回の転送が残っていれば取り消す）。
    // 256 色の PNG を変換できなかったとき・終わらないときはフルカラーで取り直す
    async sendImage(type, url, ts, name = type) {
      const dst = `data://download/${name}_watch.png`
      const prepare = async (u) => {
        try {
          await downloadOnce(this, u, `${name}.png`)
        } catch (e) {
          throw new Error(`DL ${msg(e)}`)
        }
        try {
          return await withTimeout(convertLib.convert({ filePath: `data://download/${name}.png`, targetFilePath: dst }), 15000, 'CONVERT TIMEOUT')
        } catch (e) {
          throw new Error(`CONV ${msg(e)}`)
        }
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
      try {
        const prev = run.sending[key]
        if (prev && prev.cancel) prev.cancel()
      } catch (e) {
        // 終わった転送は取り消せないことがある
      }
      try {
        run.sending[key] = this.sendFile(dst, { type, ts: String(ts) })
      } catch (e) {
        throw new Error(`SEND ${msg(e)}`)
      }
      return { size: (conv && conv.size) || 0, palette }
    },

    // 地図画面: 現在地が真ん中の全画面地図を、頼まれたズームの順に 1 枚ずつ送る（並べて送ると時計に届かなかった）
    async mapZooms({ zooms } = {}) {
      const c = config()
      if (!c.key) throw new Error('NO KEY')
      const q = `key=${encodeURIComponent(c.key)}`
      let sent = 0
      for (const z of zooms || []) {
        const zoom = Math.max(12, Math.min(18, Math.round(Number(z))))
        const url = `${c.server}/api/map?${q}&detail=${c.detail}&zoom=${zoom}&w=${FULL_MAP}&h=${FULL_MAP}&center=here`
        try {
          // ファイル名（zoom<z>_<n>）で時計側がどのズームか分かる。同じ名前だと画像が更新されないので n を交互に
          const n = run.zoomName
          n[zoom] = n[zoom] ? 0 : 1
          await this.sendImage('zoom', url, Math.floor(Date.now() / 1000), `zoom${zoom}_${n[zoom]}`)
          sent++
        } catch (e) {
          // 1 枚失敗しても残りは送る
        }
      }
      return { sent }
    },

    onRequest(req, res) {
      const method = req && req.method
      if (method === 'link.zooms') {
        this.mapZooms(req.params || {}).then(
          (data) => res(null, data),
          (e) => res(msg(e)),
        )
        return
      }
      if (method !== 'link.sync') return res('unknown method')
      this.sync().then(
        (data) => res(null, data),
        (e) => res(msg(e)),
      )
    },
  }),
)
