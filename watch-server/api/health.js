// 動作確認用: 固定の座標（大阪駅）で地名検索の各サービスが使えるかを返す。個人のデータは含まない
import { PROVIDERS } from '../lib/place.js'

export default async function handler(req, res) {
  const lat = 34.7025
  const lon = 135.4959
  const place = {}
  await Promise.all(
    Object.entries(PROVIDERS).map(async ([name, fn]) => {
      try {
        place[name] = (await fn(lat, lon)) || null
      } catch (e) {
        place[name] = `error: ${String(e.message || e)}`
      }
    }),
  )
  res.setHeader('Cache-Control', 's-maxage=300')
  res.status(200).json({ ok: true, place })
}
