import { BaseApp } from '@zeppos/zml/base-app'
import { store, nowSec } from './lib/store'

// 地図・HUD の画像はページを開いていなくても（自動同期でも）ここで受け取って保存する
App(
  BaseApp({
    globalData: {},
    onCreate() {},
    onDestroy() {},
    onReceivedFile(file) {
      file.on('change', (ev) => {
        if (ev.data.readyState !== 'transferred') return
        const type = (file.params && file.params.type) || 'map'
        // ズーム違いの地図は zoom<z> に。どの地図の版か（map_sig）も付けておく
        const m = type === 'zoom' ? /zoom(\d+)_/.exec(String(file.filePath)) : null
        const key = m ? `zoom${m[1]}` : type
        let sig = null
        try {
          const st = store().getItem('state')
          sig = st && st.map_sig
          store().setItem(key, { path: file.filePath, ts: nowSec(), sig })
        } catch (e) {
          // 保存できなくても次の同期で届く
        }
        const cb = getApp()._options.globalData.onFile
        if (cb) cb(type, file.filePath, file.params || {})
      })
    },
  }),
)
