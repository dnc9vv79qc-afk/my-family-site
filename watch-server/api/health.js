// 動作確認用: 固定の座標（大阪駅）で地名検索の各サービスが使えるか、位置が届いているか（最後に届いてから何分か）を返す。座標は含まない
import { PROVIDERS } from '../lib/place.js'
import { lastLocation, trailSince } from '../lib/store.js'
import { startOfTodayJst } from '../lib/util.js'

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
  // 位置が届いているか（座標は出さない。最後に届いてから何分か・今日の点の数だけ）
  let location = null
  try {
    const last = await lastLocation()
    const today = await trailSince(startOfTodayJst())
    location = {
      last_fix_min: last ? Math.round((Date.now() / 1000 - last.tst) / 60) : null,
      today_points: today.length,
    }
  } catch (e) {
    location = { error: String(e.message || e) }
  }
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({ ok: true, location, place })
}
