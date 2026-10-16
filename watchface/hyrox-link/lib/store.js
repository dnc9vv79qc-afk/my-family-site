// 時計側の共有ストレージ（ウォッチフェイスが LocalStorage(LINK_APP_ID, LINK_STORAGE) で読む）
import { ShareLocalStorage } from '@zos/storage'
import { LINK_STORAGE } from '../shared'

let shared = null

export function store() {
  if (!shared) shared = new ShareLocalStorage(LINK_STORAGE)
  return shared
}

export function nowSec() {
  return Math.floor(Date.now() / 1000)
}

export function saveState(state) {
  store().setItem('state', Object.assign({}, state, { synced: nowSec() }))
}

// 自動同期の結果（ページに表示する）
export function saveAuto(result) {
  try {
    store().setItem('auto', Object.assign({ ts: nowSec() }, result))
  } catch (e) {
    // 画面点灯中は書き込めないことがある
  }
}
