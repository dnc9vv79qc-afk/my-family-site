// 位置ログの保存先。Vercel の Upstash Redis（無料枠）を使い、
// 環境変数が無いとき（ローカル試験）はメモリに置く。
import { Redis } from '@upstash/redis'

const TRAIL_MAX = 720 // 軌跡として残す点の数（1 分おきなら半日分）

// Vercel で Upstash をつなぐと、Prefix の付け方によって環境変数名が変わる
// （KV_REST_API_URL / UPSTASH_REDIS_REST_URL / TEST_KV_REST_API_URL など）ので末尾で探す
function envBySuffix(...suffixes) {
  for (const suffix of suffixes) {
    if (process.env[suffix]) return process.env[suffix]
    const key = Object.keys(process.env).find((k) => k.toUpperCase().endsWith('_' + suffix))
    if (key && process.env[key]) return process.env[key]
  }
  return null
}

function redis() {
  const url = envBySuffix('KV_REST_API_URL', 'REDIS_REST_URL')
  const token = envBySuffix('KV_REST_API_TOKEN', 'REDIS_REST_TOKEN')
  return url && token ? new Redis({ url, token }) : null
}

const mem = { last: null, trail: [], view: null, cache: {} }

// OwnTracks は送れなかった古い位置を後からまとめて送ってくるので、「最新」は時刻が新しいときだけ更新する
export async function saveLocation(loc) {
  const r = redis()
  const last = r ? await r.get('last') : mem.last
  const newer = !last || loc.tst >= last.tst
  if (!r) {
    if (newer) mem.last = loc
    mem.trail = [...mem.trail, loc].sort((a, b) => a.tst - b.tst).slice(-TRAIL_MAX)
    return
  }
  await Promise.all([newer ? r.set('last', loc) : null, r.rpush('trail', loc)])
  await r.ltrim('trail', -TRAIL_MAX, -1)
}

export async function cacheGet(key) {
  const r = redis()
  return r ? r.get('cache:' + key) : mem.cache[key] ?? null
}

export async function cacheSet(key, value, ttlSec) {
  const r = redis()
  if (r) await r.set('cache:' + key, value, { ex: ttlSec })
  else mem.cache[key] = value
}

export async function lastLocation() {
  const r = redis()
  return r ? r.get('last') : mem.last
}

// 日付が変わった点は捨て、指定時刻以降の軌跡を返す
export async function trailSince(tst) {
  const r = redis()
  const all = r ? await r.lrange('trail', 0, -1) : mem.trail
  return all.filter((p) => p && p.tst >= tst).sort((a, b) => a.tst - b.tst)
}

// 地図の中心（現在地が大きくずれたときだけ動かす）
export async function getView() {
  const r = redis()
  return r ? r.get('view') : mem.view
}

export async function setView(v) {
  const r = redis()
  if (r) await r.set('view', v)
  else mem.view = v
}
