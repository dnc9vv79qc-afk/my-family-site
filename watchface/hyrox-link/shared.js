// ウォッチフェイス（HYROX Face）と共有するデータの置き場所。
// ウォッチフェイス側は @zos/share-storage の LocalStorage(LINK_APP_ID, LINK_STORAGE) で読む。
export const LINK_APP_ID = 1131196
export const LINK_STORAGE = 'link.json'
export const DEFAULT_SERVER = 'https://my-family-site-six.vercel.app'
export const MAP_W = 480
export const MAP_H = 160
// 全画面地図（2 ページ目の地図をタップで表示）。広めのズームで現在地を真ん中に
export const FULL_MAP = 480
export const FULL_ZOOM = 15
export const HUD_W = 240
export const HUD_H = 56
// 自動同期（時計のバックグラウンドサービス）
export const AUTO_SERVICE = 'app-service/sync'
export const AUTO_MIN = 15
