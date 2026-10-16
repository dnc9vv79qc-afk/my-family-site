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
        try {
          store().setItem(type, { path: file.filePath, ts: nowSec() })
        } catch (e) {
          // 保存できなくても次の同期で届く
        }
        const cb = getApp()._options.globalData.onFile
        if (cb) cb(type, file.filePath)
      })
    },
  }),
)
