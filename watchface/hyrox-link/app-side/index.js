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
const run = { sending: {}, zoomName: {}, imaging: false, sendErr: [] }

AppSideService(
  BaseSideService({
    onInit() {},
    onRun() {},
    onDestroy() {},

    // 時計への返事は最新データ（state）だけにしてすぐ返す。地図などの画像はそのあと裏で送る
    // （画像を待ってから返すと、どこか 1 つ失敗しただけで位置まで同期されなくなっていた）
    async sync({ have } = {}) {
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
      if (state.ok) this.images(c, q, state, have || {}).catch(() => {})
      return { state, imgErr }
    },

    // 地図・全画面地図・両隣のズーム・雨の画像を 1 枚ずつ送る。失敗したら どの画像で 何が起きたか を残し、次の同期の返事で時計に見せる
    async images(c, q, state, have) {
      if (run.imaging) return
      run.imaging = true
      const errs = []
      try {
        // 時計が今の版（map_sig）の地図を 2 枚とも持っていて、描き方（detail）も前回送ったときと同じなら送らない。
        // 送ったかどうかではなく時計が持っているかで決めるので、届かなかった・入れ直した ときも次の同期で送り直す
        const sig = `${state.map_sig}|${c.detail}`
        const last = settingsLib.getItem('sent_sig')
        const same = state.map_sig && have.map === state.map_sig && have.full === state.map_sig && sig === last
        const map = `${c.server}/api/map?${q}&detail=${c.detail}`
        const items = []
        if (!same) {
          items.push({ label: 'MAP', type: 'map', url: `${map}&w=${MAP_W}&h=${MAP_H}` })
          items.push({ label: 'FULL', type: 'mapfull', url: `${map}&zoom=${FULL_ZOOM}&w=${FULL_MAP}&h=${FULL_MAP}&center=here` })
          // 地図画面ですぐ切り替えられるよう両隣のズームも
          ;[FULL_ZOOM - 1, FULL_ZOOM + 1].forEach((z) => items.push(this.zoomItem(c, q, z)))
        }
        // 雨は時間で変わるので毎回（小さい画像）
        items.push({ label: 'RAIN', type: 'hud', url: `${c.server}/api/hud?${q}` })
        const ok = await this.sendAll(items, state.now, errs)
        if (!same && ok.MAP && ok.FULL) settingsLib.setItem('sent_sig', sig)
      } catch (e) {
        errs.push(`IMG ${msg(e)}`)
      }
      // 前回までの転送で時計に届かなかったもの
      if (run.sendErr.length) errs.push(`SEND ${run.sendErr.splice(0).join(',')}`)
      try {
        settingsLib.setItem('img_err', errs.join(' / ').slice(0, 80))
      } catch (e) {
        // 記録できなくても画像の転送には関係ない
      } finally {
        run.imaging = false
      }
    },

    // 何枚かの画像を送る。サーバーの描画・取得・変換は前の画像の転送を待たずに先へ進め（3 枚まで同時）、
    // 時計への転送だけは並べた順に 1 枚ずつ（並べて送ると時計に届かなかった）。label ごとの成否を返す
    async sendAll(items, ts, errs = []) {
      // 同時に取りに行くのは 3 枚まで
      let slots = 3
      const waiting = []
      const limit = (fn) =>
        new Promise((resolve) => {
          const go = () => {
            slots--
            fn().then(
              (r) => resolve(r),
              (e) => resolve({ err: e }),
            ).then(() => {
              slots++
              if (waiting.length) waiting.shift()()
            })
          }
          if (slots > 0) go()
          else waiting.push(go)
        })
      const jobs = items.map((it) => {
        const name = it.name || it.type
        return Object.assign({ name, ready: limit(() => this.prepareImage(it.url, name)) }, it)
      })
      const ok = {}
      for (const j of jobs) {
        const r = await j.ready
        try {
          if (r.err) throw r.err
          this.queueFile(j.type, j.name, r.dst, ts)
          ok[j.label] = ok[j.label] !== false
        } catch (e) {
          ok[j.label] = false
          errs.push(`${j.label} ${msg(e)}`)
        }
      }
      return ok
    },

    // PNG を取得 → 時計用に変換。256 色の PNG を変換できなかったとき・終わらないときはフルカラーで取り直す
    async prepareImage(url, name) {
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
      const palette = !url.includes('/api/hud')
      try {
        await prepare(url)
      } catch (e) {
        if (!palette) throw e
        await prepare(`${url}&palette=0`)
      }
      return { dst }
    },

    // 変換済みの画像を時計へ送る（同じ種類の前回の転送が残っていれば取り消す。ズーム違いは同じ名前の前回分だけ）
    queueFile(type, name, dst, ts) {
      const key = type === 'zoom' ? name : type
      try {
        const prev = run.sending[key]
        if (prev && prev.cancel) prev.cancel()
      } catch (e) {
        // 終わった転送は取り消せないことがある
      }
      try {
        const file = this.sendFile(dst, { type, ts: String(ts) })
        run.sending[key] = file
        // 転送の結果は後から分かる。失敗したら次の同期の返事で時計に見せる
        if (file && file.on) {
          file.on('change', (ev) => {
            const r = ev && ev.data && ev.data.readyState
            if (r === 'error' && run.sendErr.indexOf(key) < 0) run.sendErr.push(key)
          })
        }
      } catch (e) {
        throw new Error(`SEND ${msg(e)}`)
      }
    },

    // 地図画面用: 現在地が真ん中の全画面地図（ズーム z）。ファイル名 zoom<z>_<n> で時計側がどのズームか分かる。
    // 同じ名前だと画像が更新されないので n を交互に
    zoomItem(c, q, z) {
      const zoom = Math.max(12, Math.min(18, Math.round(Number(z))))
      const n = run.zoomName
      n[zoom] = n[zoom] ? 0 : 1
      return {
        label: 'ZOOM',
        type: 'zoom',
        name: `zoom${zoom}_${n[zoom]}`,
        url: `${c.server}/api/map?${q}&detail=${c.detail}&zoom=${zoom}&w=${FULL_MAP}&h=${FULL_MAP}&center=here`,
      }
    },

    // 地図画面: 頼まれたズームを、頼まれた順に届ける
    async mapZooms({ zooms } = {}) {
      const c = config()
      if (!c.key) throw new Error('NO KEY')
      const q = `key=${encodeURIComponent(c.key)}`
      const items = (zooms || []).map((z) => this.zoomItem(c, q, z))
      const errs = []
      await this.sendAll(items, Math.floor(Date.now() / 1000), errs)
      return { sent: items.length - errs.length }
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
      this.sync(req.params || {}).then(
        (data) => res(null, data),
        (e) => res(msg(e)),
      )
    },
  }),
)
