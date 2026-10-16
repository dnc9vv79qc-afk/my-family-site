import { BaseApp } from '@zeppos/zml/base-app'
import { store, nowSec } from './lib/store'

// 地図・HUD の画像はページを開いていなくても（自動同期でも）ここで受け取って保存する
App(
  BaseApp({
    globalData: {},
    onCreate() {},
    onDestroy() {},
    onReceivedFile(file) {
      // 受け取りの進み具合（地図画面の診断表示用）
      const g = getApp()._options.globalData
      g.rx = g.rx || { files: 0, done: 0, state: '' }
      g.rx.files++
      file.on('change', (ev) => {
        g.rx.state = String(ev.data.readyState)
        if (ev.data.readyState !== 'transferred') return
        g.rx.done++
        const type = (file.params && file.params.type) || 'map'
        if (type !== 'tile') {
          try {
            store().setItem(type, { path: file.filePath, ts: nowSec() })
          } catch (e) {
            // 保存できなくても次の同期で届く
          }
        }
        const cb = getApp()._options.globalData.onFile
        if (cb) cb(type, file.filePath, file.params || {})
      })
    },
  }),
)
