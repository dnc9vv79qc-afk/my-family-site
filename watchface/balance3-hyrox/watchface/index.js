import { createWidget, widget, align, prop, event, show_level, text_style, data_type, edit_type } from '@zos/ui'
import { Weather, Time, Distance } from '@zos/sensor'
import { log } from '@zos/utils'
import { LocalStorage, FileSystem } from '@zos/share-storage'
import { writeFileSync, rmSync } from '@zos/fs'
import { launchApp } from '@zos/router'
import { L } from './layout'
import { placeLabel } from './romaji'

const logger = log.getLogger('hyrox-face')

const NORMAL = show_level.ONLY_NORMAL
const AOD = show_level.ONAL_AOD
const EDIT = show_level.ONLY_EDIT

// ページ切り替え: pages[n] に入れたウィジェットだけを表示する（0 = CROSSFIT, 1 = データ + 地図, 2 = 全画面地図）
const pages = [[], [], []]
let page = 0
const pageListeners = []
const hiddenWidgets = new Set() // ページ内でも状況に応じて隠すもの（雨の弧など）

function mk(p, type, opts) {
  const w = createWidget(type, opts)
  pages[p].push(w)
  return w
}

function setPage(n) {
  page = n
  pages.forEach((ws, i) => ws.forEach((w) => w.setProperty(prop.VISIBLE, i === n && !hiddenWidgets.has(w))))
  pageListeners.forEach((fn) => fn())
}

function showOnPage(w, p, on) {
  if (on) hiddenWidgets.delete(w)
  else hiddenWidgets.add(w)
  w.setProperty(prop.VISIBLE, on && page === p)
}

// ---- 24 時間リング用: 時刻 → 角度（真上が 0 時、時計回りに 1 分 0.25°）
const HOME_LATLON = [34.677, 135.474]

function minutesOfDay(date) {
  return date.getHours() * 60 + date.getMinutes()
}

function ringDeg(min) {
  return (((min % 1440) + 1440) % 1440) * 0.25
}

// ARC は 3 時方向が 0°
function arcRange(m1, m2) {
  const a = ringDeg(m1) - 90
  let b = ringDeg(m2) - 90
  if (b <= a) b += 360
  return { start_angle: a, end_angle: b }
}

// 日の出・日の入り（その土地の時刻で、0 時からの分）。NOAA の簡易式
function sunTimes(lat, lon, date) {
  const rad = Math.PI / 180
  const start = new Date(date.getFullYear(), 0, 0)
  const day = Math.floor((date - start) / 86400000)
  const g = ((2 * Math.PI) / 365) * (day - 1)
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g))
  const decl =
    0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g)
  const ha = Math.acos(Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl)) / rad
  const tz = -date.getTimezoneOffset()
  const noon = 720 - 4 * lon - eq + tz
  return { rise: noon - 4 * ha, set: noon + 4 * ha }
}

// 時刻のあたりをタップでページを切り替える
function pageToggle(p, area) {
  const w = mk(p, widget.IMG, { x: area.x, y: area.y, w: area.w, h: area.h, src: L.blank, show_level: NORMAL })
  w.addEventListener(event.CLICK_UP, () => setPage(page === 0 ? 1 : 0))
}

// edit_type が無い環境では data_type と同じ値を使う（公式サンプルも両者を同一視している）
const ET = edit_type || data_type

// 機種・OS バージョンで使えないデータ種別は選択肢から外す
function supported(key) {
  return data_type[key] !== undefined && ET[key] !== undefined
}

// 円弧メーターで進み具合を出せるデータ（それ以外は溝だけ）
const GAUGE_PROGRESS = ['STEP', 'CAL', 'HEART', 'BATTERY', 'STRESS', 'PAI_DAILY', 'FAT_BURNING', 'STAND', 'SPO2', 'HUMIDITY', 'READINESS']

// 編集画面で枠の中に見せるプレビュー（マスクより上に描くため最後にまとめて作る）
const editPreviews = []

// 円弧メーター: 編集グループを作り、ユーザーが選んだデータを描く
function gaugeSlot(slot) {
  const G = L.p1.gauge
  const keys = G.order.filter(supported)
  const defaultKey = supported(slot.default) ? slot.default : keys[0]

  const group = createWidget(widget.WATCHFACE_EDIT_GROUP, {
    edit_id: slot.edit_id,
    x: slot.x,
    y: slot.y,
    w: slot.w,
    h: slot.h,
    select_image: G.select,
    un_select_image: G.unselect,
    default_type: ET[defaultKey],
    optional_types: keys.map((k) => ({
      type: ET[k],
      preview: G.previews[k],
      title_en: G.types[k].title,
      title_sc: G.types[k].title,
      title_tc: G.types[k].title,
    })),
    count: keys.length,
    tips_BG: G.tips,
    tips_x: slot.tips_x,
    tips_y: slot.tips_y,
    tips_width: 132,
    tips_margin: 6,
  })

  const current = group.getProperty(prop.CURRENT_TYPE)
  let key = keys.find((k) => ET[k] === current || data_type[k] === current)
  if (!key) key = defaultKey
  const t = G.types[key]
  const f = G.font
  editPreviews.push({ x: slot.x, y: slot.y, src: G.previews[key] })

  if (key === 'DISTANCE') {
    // 距離は時計に目標が無いので、10 km で満タンとして自分で円弧を伸ばす
    const arcImg = mk(0, widget.IMG, { x: slot.x, y: slot.y, w: slot.w, h: slot.h, src: G.levels[0], show_level: NORMAL })
    try {
      const dist = new Distance()
      const show = () => {
        const n = G.levels.length - 1
        arcImg.setProperty(prop.SRC, G.levels[Math.max(0, Math.min(n, Math.round((dist.getCurrent() / 10000) * n)))])
      }
      show()
      dist.onChange(show)
      pageListeners.push(show)
    } catch (e) {
      logger.log('distance sensor unavailable')
    }
  } else if (GAUGE_PROGRESS.indexOf(key) >= 0) {
    mk(0, widget.IMG_LEVEL, {
      x: slot.x,
      y: slot.y,
      image_array: G.levels,
      image_length: G.levels.length,
      type: data_type[key],
      show_level: NORMAL,
    })
  } else {
    mk(0, widget.IMG, { x: slot.x, y: slot.y, src: G.levels[0], show_level: NORMAL })
  }
  mk(0, widget.IMG, { x: slot.icon.x, y: slot.icon.y, src: t.icon, show_level: NORMAL })
  mk(0, widget.IMG, { x: slot.label.x, y: Math.round(slot.label.cy - t.label_h / 2), src: t.label, show_level: NORMAL })

  const opts = {
    x: slot.value.x,
    y: slot.value.y,
    w: slot.value.w,
    h: slot.value.h,
    type: data_type[key],
    font_array: f.digits,
    h_space: 0,
    align_h: align.CENTER_H,
    invalid_image: f.invalid,
    show_level: NORMAL,
  }
  if (t.unit) {
    opts.unit_en = f.units[t.unit]
    opts.unit_sc = f.units[t.unit]
    opts.unit_tc = f.units[t.unit]
  }
  if (t.sep === 'dot') opts.dot_image = f.dot
  if (t.sep === 'colon') opts.dot_image = f.colon
  if (t.negative) opts.negative_image = f.negative
  mk(0, widget.TEXT_IMG, opts)

  // タップで対応する純正アプリを開く
  mk(0, widget.IMG_CLICK, { x: slot.x, y: slot.y, w: slot.w, h: slot.h, src: L.blank, type: data_type[key] })
}

// 今日の天気の index（0-28、Zepp の天気予報）
function readWeatherIndex() {
  const readers = [
    () => (typeof hmSensor !== 'undefined' ? hmSensor.createSensor(hmSensor.id.WEATHER).getForecastWeather() : null),
    () => new Weather().getForecastWeather(),
  ]
  for (const read of readers) {
    try {
      const f = read()
      const d = f && f.forecastData && f.forecastData.data && f.forecastData.data[0]
      if (d && d.index != null) return d.index
    } catch (e) {
      logger.log('weather unavailable')
    }
  }
  return 25 // Unknown
}

// Zepp アプリの天気の地名（現在地）
function readCityName() {
  const readers = [
    // ウォッチフェイス用の旧 API（ウォッチフェイスでは今も有効）
    () => (typeof hmSensor !== 'undefined' ? hmSensor.createSensor(hmSensor.id.WEATHER).getForecastWeather() : null),
    () => new Weather().getForecastWeather(),
  ]
  for (const read of readers) {
    try {
      const f = read()
      if (f && f.cityName) return f.cityName
    } catch (e) {
      logger.log('weather unavailable')
    }
  }
  return ''
}

// 現在地: ローマ字にできれば Rubik、できなければ元の表記をシステムフォントで。取れなければ brand（あれば）
function placeWidgets(p, P, brandCfg) {
  const base = {
    x: P.x,
    y: P.y,
    w: P.w,
    h: P.h,
    color: P.color,
    text_size: P.size,
    char_space: P.space,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V,
    text_style: text_style.ELLIPSIS,
    text: '',
    show_level: NORMAL,
  }
  const brand = brandCfg
    ? createWidget(widget.IMG, { x: brandCfg.x, y: brandCfg.y, src: brandCfg.src, show_level: NORMAL })
    : null
  const roman = createWidget(widget.TEXT, Object.assign({}, base, { font: L.place_font }))
  const raw = createWidget(widget.TEXT, Object.assign({}, base, { char_space: 0, text_size: P.size - 2 }))

  return function update() {
    const fromLink = linkPlace()
    const city = fromLink || readCityName()
    const label = fromLink || placeLabel(city)
    const on = page === p
    // 長い地名は小さく・字間を詰めて枠に収める
    const n = (label || '').length
    roman.setProperty(prop.MORE, n > 14 ? { text_size: P.size - 5, char_space: 1 } : n > 11 ? { text_size: P.size - 2, char_space: P.space } : { text_size: P.size, char_space: P.space })
    roman.setProperty(prop.TEXT, label || '')
    roman.setProperty(prop.COLOR, fromLink && staleness() ? 0x6b6b6b : P.color) // 古い地名は暗く
    raw.setProperty(prop.TEXT, label ? '' : city || (brand ? '' : '--'))
    roman.setProperty(prop.VISIBLE, on && !!label)
    raw.setProperty(prop.VISIBLE, on && !label)
    if (brand) brand.setProperty(prop.VISIBLE, on && !city)
  }
}

// 2 ページ目の数値（データ種別が無ければ "--" 画像）
function p2value(c) {
  const type = data_type[c.kind]
  if (type === undefined) {
    mk(1, widget.IMG, { x: c.x, y: c.y, src: c.invalid, show_level: NORMAL })
    return
  }
  const opts = {
    x: c.x,
    y: c.y,
    w: c.w + 30,
    h: c.h,
    type,
    font_array: c.font,
    h_space: 0,
    align_h: c.align === 'l' ? align.LEFT : align.CENTER_H,
    invalid_image: c.invalid,
    show_level: NORMAL,
  }
  if (c.align !== 'l') opts.x = c.x - 15
  if (c.unit) {
    opts.unit_en = c.unit
    opts.unit_sc = c.unit
    opts.unit_tc = c.unit
  }
  if (c.dot) opts.dot_image = c.dot
  if (c.negative) opts.negative_image = c.negative
  mk(1, widget.TEXT_IMG, opts)
}

// ---- 連携アプリ（HYROX Link）が共有するデータと地図
const LINK_APP_ID = 1131196
const linkFiles = {} // kind -> { ts, path }

function readLink() {
  try {
    const s = new LocalStorage(LINK_APP_ID, 'link.json')
    if (!s.isExisted()) return null
    return { state: s.getItem('state', null), map: s.getItem('map', null), hud: s.getItem('hud', null), mapfull: s.getItem('mapfull', null) }
  } catch (e) {
    logger.log('link read failed')
    return null
  }
}

// 連携アプリのファイルを自分の data に写して IMG で使う。画像は一度読んだ名前だと中身を替えても前の絵のまま
// （2 つの名前を交互に使うと 3 回目から古い絵に戻った）ので、届いた時刻で毎回別の名前にし、前のファイルは消す
function copyLinkFile(kind, entry) {
  if (!entry || !entry.path) return null
  const cur = linkFiles[kind]
  if (cur && entry.ts === cur.ts) return cur.path
  try {
    const fs = new FileSystem(LINK_APP_ID)
    let buf = null
    for (const p of [entry.path, entry.path.replace(/^data:\/\//, '')]) {
      try {
        buf = fs.readFileSync({ path: p })
      } catch (e) {
        buf = null
      }
      if (buf) break
    }
    if (!buf) return null
    const dst = `data://live_${kind}_${entry.ts}.png`
    writeFileSync({ path: dst, data: buf })
    if (cur && cur.path !== dst) {
      try {
        rmSync({ path: cur.path })
      } catch (e) {
        // 消せなくても表示には関係ない
      }
    }
    linkFiles[kind] = { ts: entry.ts, path: dst }
    return dst
  } catch (e) {
    logger.log('link file copy failed')
    return null
  }
}

// 同期した地名（6 時間以内のものだけ使う）
function linkPlace() {
  const link = readLink()
  const st = link && link.state
  if (!st || !st.place || !st.synced) return null
  return Math.floor(Date.now() / 1000) - st.synced < 6 * 3600 ? st.place : null
}

// データの古さ。同期が止まっている（sync）か、同期はできているが位置が古い（pos）かを分けて返す。2 時間を超えたら目印を出す
const STALE_SEC = 2 * 3600
function staleness() {
  const link = readLink()
  const st = link && link.state
  if (!st || !st.ok || st.now == null) return null
  const now = Math.floor(Date.now() / 1000)
  const sync = st.synced ? Math.max(0, now - st.synced) : 0
  const fix = Math.max(0, now - (st.now - (st.age || 0)))
  if (sync > STALE_SEC) return { kind: 'SYNC', sec: sync }
  if (fix > STALE_SEC) return { kind: 'POS', sec: fix }
  return null
}

function staleText(s) {
  const t = s.sec >= 86400 ? `${Math.floor(s.sec / 86400)}D` : `${Math.floor(s.sec / 3600)}H`
  return s.kind === 'SYNC' ? `SYNC ${t}` : `POS OLD ${t}`
}

function ago(sec) {
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`
  return `${Math.floor(sec / 86400)}d`
}

// 雨: 同期した 2 時間先までの 15 分枠から「今降っている / 何分後 / 降らない」
function rainStatus() {
  const link = readLink()
  const st = link && link.state
  const now = Math.floor(Date.now() / 1000)
  if (!st || !st.synced || now - st.synced > 3 * 3600 || !st.rain || !st.rain.slots) return { word: '--' }
  const { start, slots } = st.rain
  for (let i = 0; i < slots.length; i++) {
    const s0 = start + i * 900
    if ((slots[i] || 0) < 0.1 || s0 + 900 <= now) continue
    if (s0 <= now) return { word: 'NOW' }
    return { min: Math.round((s0 - now) / 60) }
  }
  return { word: 'DRY' }
}

// 日本の祝日（y 年 m 月、m は 0 始まり）→ { 日: true }。振替休日・国民の休日・春分/秋分を含む
function japaneseHolidays(y, m) {
  const nthMonday = (month, n) => {
    const first = new Date(y, month, 1).getDay()
    return 1 + ((8 - first) % 7) + (n - 1) * 7
  }
  const base = Math.floor((y - 1980) / 4)
  const spring = Math.floor(20.8431 + 0.242194 * (y - 1980) - base)
  const autumn = Math.floor(23.2488 + 0.242194 * (y - 1980) - base)
  const list = [
    [0, 1], [0, nthMonday(0, 2)], [1, 11], [1, 23], [2, spring], [3, 29], [4, 3], [4, 4], [4, 5],
    [6, nthMonday(6, 3)], [7, 11], [8, nthMonday(8, 3)], [8, autumn], [9, nthMonday(9, 2)], [10, 3], [10, 23],
  ]
  const isHol = {}
  list.forEach(([mm, dd]) => {
    isHol[`${mm}-${dd}`] = true
  })
  const key = (d) => `${d.getMonth()}-${d.getDate()}`
  // 国民の休日（祝日に挟まれた平日。9 月の敬老の日と秋分の日の間など）
  list.forEach(([mm, dd]) => {
    const next = new Date(y, mm, dd + 2)
    const mid = new Date(y, mm, dd + 1)
    if (isHol[key(next)] && !isHol[key(mid)] && mid.getDay() !== 0) isHol[key(mid)] = true
  })
  // 振替休日（祝日が日曜なら、その後の最初の祝日でない日）
  Object.keys(isHol).forEach((k) => {
    const [mm, dd] = k.split('-').map(Number)
    const d = new Date(y, mm, dd)
    if (d.getDay() !== 0) return
    const sub = new Date(y, mm, dd + 1)
    while (isHol[key(sub)]) sub.setDate(sub.getDate() + 1)
    isHol[key(sub)] = true
  })
  const out = {}
  Object.keys(isHol).forEach((k) => {
    const [mm, dd] = k.split('-').map(Number)
    if (mm === m) out[dd] = true
  })
  return out
}

function buildPage1() {
  const P = L.p1
  mk(0, widget.IMG, { x: 0, y: 0, src: P.bg, show_level: NORMAL })

  // 天気: アイコンと名前は天気のデータ種別（0-28）で時計が選ぶ。無い機種では予報の index を読む
  const WX = P.weather
  let wxIcon = null
  let wxText = null
  if (data_type.WEATHER !== undefined) {
    ;[WX.icon, WX.text].forEach((c) =>
      mk(0, widget.IMG_LEVEL, { x: c.x, y: c.y, w: c.w, h: c.h, image_array: c.src, image_length: c.src.length, type: data_type.WEATHER, show_level: NORMAL }),
    )
  } else {
    wxIcon = mk(0, widget.IMG, { x: WX.icon.x, y: WX.icon.y, w: WX.icon.w, h: WX.icon.h, src: WX.icon.src[25], show_level: NORMAL })
    wxText = mk(0, widget.IMG, { x: WX.text.x, y: WX.text.y, w: WX.text.w, h: WX.text.h, src: WX.text.src[25], show_level: NORMAL })
  }
  if (data_type.WEATHER_CURRENT !== undefined) {
    mk(0, widget.TEXT_IMG, {
      x: P.temp.x,
      y: P.temp.y,
      w: P.temp.w,
      h: P.temp.h,
      type: data_type.WEATHER_CURRENT,
      font_array: P.temp.font,
      h_space: 0,
      align_h: align.LEFT,
      unit_en: P.temp.unit,
      unit_sc: P.temp.unit,
      unit_tc: P.temp.unit,
      negative_image: P.temp.negative,
      invalid_image: P.temp.invalid,
      show_level: NORMAL,
    })
  }

  // 日付 10.17 と曜日（常時表示でも出す）
  const dateOpts = {
    month_startX: P.date.x,
    month_startY: P.date.y,
    month_zero: 1,
    month_space: 0,
    month_unit_en: P.date.dot,
    month_unit_sc: P.date.dot,
    month_unit_tc: P.date.dot,
    day_zero: 1,
    day_space: 0,
    day_follow: 1,
  }
  const digits = (arr) => ({ month_en_array: arr, month_sc_array: arr, month_tc_array: arr, day_en_array: arr, day_sc_array: arr, day_tc_array: arr })
  mk(0, widget.IMG_DATE, Object.assign({ show_level: NORMAL }, dateOpts, digits(P.date.digits)))
  const weekOpts = { x: P.week.x, y: P.week.y, week_en: P.week.src, week_tc: P.week.src, week_sc: P.week.src }
  mk(0, widget.IMG_WEEK, Object.assign({ show_level: NORMAL }, weekOpts))

  // 常時表示（AOD）: 左の列に曜日（オレンジ）・日付・電池。時刻は普段と同じ位置
  const A = P.aod
  createWidget(widget.IMG_WEEK, { x: A.week.x, y: A.week.y, week_en: A.week.src, week_tc: A.week.src, week_sc: A.week.src, show_level: AOD })
  createWidget(
    widget.IMG_DATE,
    Object.assign({}, dateOpts, digits(A.date.digits), {
      month_startX: A.date.x,
      month_startY: A.date.y,
      month_unit_en: A.date.dot,
      month_unit_sc: A.date.dot,
      month_unit_tc: A.date.dot,
      show_level: AOD,
    }),
  )
  createWidget(widget.IMG, { x: A.label.x, y: A.label.y, src: A.label.src, show_level: AOD })
  if (data_type.BATTERY !== undefined) {
    createWidget(widget.TEXT_IMG, {
      x: A.bat.x,
      y: A.bat.y,
      w: A.bat.w,
      h: A.bat.h,
      type: data_type.BATTERY,
      font_array: A.bat.font,
      h_space: 0,
      align_h: align.LEFT,
      unit_en: A.bat.unit,
      unit_sc: A.bat.unit,
      unit_tc: A.bat.unit,
      invalid_image: A.bat.invalid,
      show_level: AOD,
    })
  }

  // 現在地（2 行。ローマ字にできなければ元の表記を 1 行で）
  const pl = P.place
  const line = (i, font) =>
    createWidget(
      widget.TEXT,
      Object.assign(
        { x: pl.x, y: pl.y + i * pl.line_h, w: pl.w, h: pl.line_h, color: pl.color, text_size: pl.size, char_space: pl.space, align_h: align.LEFT, align_v: align.CENTER_V, text_style: text_style.ELLIPSIS, text: '', show_level: NORMAL },
        font ? { font } : { char_space: 0 },
      ),
    )
  const place1 = line(0, L.place_font)
  const place2 = line(1, L.place_font)
  const placeRaw = line(0, null)
  // 位置が古いときの目印（地名の下に OLD 4H）
  const placeOld = createWidget(widget.TEXT, {
    x: pl.x,
    y: pl.y + pl.line_h * 2 - 2,
    w: pl.w,
    h: 14,
    color: 0xff8c1a,
    text_size: 11,
    char_space: 1,
    font: L.place_font,
    align_h: align.LEFT,
    align_v: align.CENTER_V,
    text: '',
    show_level: NORMAL,
  })

  // 電池
  if (data_type.BATTERY !== undefined) {
    mk(0, widget.TEXT_IMG, {
      x: P.bat.x,
      y: P.bat.y,
      w: P.bat.w,
      h: P.bat.h,
      type: data_type.BATTERY,
      font_array: P.bat.font,
      h_space: 0,
      align_h: align.LEFT,
      unit_en: P.bat.unit,
      unit_sc: P.bat.unit,
      unit_tc: P.bat.unit,
      invalid_image: P.bat.invalid,
      show_level: NORMAL,
    })
  }

  // 雨（HYROX Link の同期データ）: 何分後なら数字 + MIN、それ以外は NOW / DRY / --
  const R = P.rain
  const rainMin = mk(0, widget.TEXT_IMG, {
    x: R.x,
    y: R.y,
    w: R.w,
    h: R.h,
    font_array: R.font,
    h_space: 0,
    align_h: align.LEFT,
    unit_en: R.unit,
    unit_sc: R.unit,
    unit_tc: R.unit,
    text: '',
    show_level: NORMAL,
  })
  const rainWord = mk(0, widget.IMG, { x: R.x, y: R.y, w: R.word_w, h: R.word_h, src: R.words['--'], show_level: NORMAL })

  // 時刻: 時の下に分、秒はオレンジ
  const T = P.time
  mk(0, widget.IMG_TIME, {
    hour_zero: 1,
    hour_startX: T.x,
    hour_startY: T.hour_y,
    hour_array: T.digits,
    hour_space: 0,
    minute_zero: 1,
    minute_startX: T.x,
    minute_startY: T.minute_y,
    minute_array: T.digits,
    minute_space: 0,
    minute_follow: 0,
    second_zero: 1,
    second_startX: T.sec_x,
    second_startY: T.sec_y,
    second_array: T.sec,
    second_space: 0,
    second_follow: 0,
    show_level: NORMAL,
  })
  createWidget(widget.IMG_TIME, {
    hour_zero: 1,
    hour_startX: T.x,
    hour_startY: T.hour_y,
    hour_array: T.aod,
    hour_space: 0,
    minute_zero: 1,
    minute_startX: T.x,
    minute_startY: T.minute_y,
    minute_array: T.aod,
    minute_space: 0,
    minute_follow: 0,
    show_level: AOD,
  })

  // 月の名前 + カレンダー（日曜始まり、今日に丸、今週の行に薄い帯、土日・祝日の色、祝日に点）。タップで来月 ⇔ 今月
  const monthImg = mk(0, widget.IMG, { x: P.month.x, y: P.month.y, src: P.month.src[new Date().getMonth()], show_level: NORMAL })
  const C = P.cal
  const band = mk(0, widget.IMG, { x: 0, y: 0, w: C.band.w, h: C.band.h, src: C.band.src, show_level: NORMAL })
  const ring = mk(0, widget.IMG, { x: 0, y: 0, src: C.ring, show_level: NORMAL })
  const cells = []
  const dots = []
  for (let i = 0; i < 42; i++) {
    const cx = C.x0 + (i % 7) * C.dx
    const cy = C.y0 + Math.floor(i / 7) * C.dy
    cells.push(
      mk(0, widget.TEXT, {
        x: Math.round(cx - C.cell_w / 2),
        y: Math.round(cy - C.cell_h / 2),
        w: C.cell_w,
        h: C.cell_h,
        color: C.color,
        text_size: C.size,
        font: L.place_font,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text: '',
        show_level: NORMAL,
      }),
    )
  }
  for (let i = 0; i < 5; i++) {
    const d = mk(0, widget.IMG, { x: 0, y: 0, src: C.dot, show_level: NORMAL })
    hiddenWidgets.add(d)
    dots.push(d)
  }
  let calMonth = 0 // 0 = 今月, 1 = 来月
  let calKey = ''
  const updateCalendar = (force) => {
    const now = new Date()
    const view = new Date(now.getFullYear(), now.getMonth() + calMonth, 1)
    const y = view.getFullYear()
    const m = view.getMonth()
    const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${calMonth}`
    if (key === calKey && !force) return
    calKey = key
    const first = view.getDay() // 日曜始まり
    const days = new Date(y, m + 1, 0).getDate()
    const hol = japaneseHolidays(y, m)
    const today = calMonth === 0 ? now.getDate() : -1
    monthImg.setProperty(prop.SRC, P.month.src[m])
    let dotN = 0
    cells.forEach((w, i) => {
      const day = i - first + 1
      const on = day >= 1 && day <= days
      const col = i % 7
      w.setProperty(prop.TEXT, on ? String(day) : '')
      let color = C.color
      if (col === 0 || hol[day]) color = C.sun_color
      else if (col === 6) color = C.sat_color
      if (calMonth === 1) color = color === C.color ? C.other_color : color
      if (day === today) color = C.today_color
      w.setProperty(prop.COLOR, color)
      const cx = C.x0 + col * C.dx
      const cy = C.y0 + Math.floor(i / 7) * C.dy
      if (on && hol[day] && dotN < dots.length) {
        dots[dotN].setProperty(prop.X, Math.round(cx - 2))
        dots[dotN].setProperty(prop.Y, Math.round(cy + 7))
        showOnPage(dots[dotN], 0, true)
        dotN++
      }
      if (day === today) {
        ring.setProperty(prop.X, Math.round(cx - 10))
        ring.setProperty(prop.Y, Math.round(cy - 10))
        band.setProperty(prop.X, Math.round(C.x0 - C.dx / 2 - 2))
        band.setProperty(prop.Y, Math.round(cy - C.band.h / 2))
      }
    })
    for (let i = dotN; i < dots.length; i++) showOnPage(dots[i], 0, false)
    showOnPage(ring, 0, today > 0)
    showOnPage(band, 0, today > 0)
  }
  const calTap = mk(0, widget.IMG, { x: C.area.x, y: C.area.y, w: C.area.w, h: C.area.h, src: L.blank, show_level: NORMAL })
  calTap.addEventListener(event.CLICK_UP, () => {
    calMonth = calMonth ? 0 : 1
    updateCalendar(true)
  })

  P.gauge.slots.forEach(gaugeSlot)
  pageToggle(0, P.toggle)

  let wxAt = 0
  const update = (fromTimer) => {
    const on = page === 0
    if (fromTimer !== true && calMonth) calMonth = 0 // 画面を付け直したら今月に戻す
    updateCalendar()
    const nowMs = Date.now()
    if (wxIcon && nowMs - wxAt > 10 * 60 * 1000) {
      wxAt = nowMs
      const idx = readWeatherIndex()
      const k = idx >= 0 && idx < WX.icon.src.length ? idx : 25
      wxIcon.setProperty(prop.SRC, WX.icon.src[k])
      wxText.setProperty(prop.SRC, WX.text.src[k])
    }
    // 現在地
    const fromLink = linkPlace()
    const city = fromLink || readCityName()
    const label = fromLink || placeLabel(city)
    const words = label ? label.split(' ') : []
    const line2 = words.slice(1).join(' ')
    // 長い地名は文字を小さくして時刻にかからないように
    const fit = (t) => (t.length <= 9 ? pl.size : t.length <= 11 ? pl.size - 2 : pl.size - 3)
    place1.setProperty(prop.MORE, { text_size: fit(words[0] || '') })
    place2.setProperty(prop.MORE, { text_size: fit(line2) })
    place1.setProperty(prop.TEXT, words[0] || '')
    place2.setProperty(prop.TEXT, line2)
    placeRaw.setProperty(prop.TEXT, label ? '' : city || '')
    place1.setProperty(prop.VISIBLE, on && !!label)
    place2.setProperty(prop.VISIBLE, on && !!label)
    placeRaw.setProperty(prop.VISIBLE, on && !label)
    // 古い位置なら地名を暗くして、何時間前かを出す
    const stale = fromLink ? staleness() : null
    place1.setProperty(prop.COLOR, stale ? 0x6b6b6b : pl.color)
    place2.setProperty(prop.COLOR, stale ? 0x6b6b6b : pl.color)
    placeOld.setProperty(prop.TEXT, stale ? staleText(stale) : '')
    placeOld.setProperty(prop.VISIBLE, on && !!stale)
    // 雨
    const r = rainStatus()
    if (r.min != null) rainMin.setProperty(prop.TEXT, `${r.min}u`)
    else rainWord.setProperty(prop.SRC, R.words[r.word])
    showOnPage(rainMin, 0, r.min != null)
    showOnPage(rainWord, 0, r.min == null)
  }
  try {
    new Time().onPerMinute(() => {
      if (page === 0) update(true)
    })
  } catch (e) {
    logger.log('time sensor unavailable')
  }
  return update
}

// 全画面地図（2 ページ目の地図をタップ）。どこかをタップで 2 ページ目に戻る
function buildPage3() {
  const F = L.p2.full
  const map = mk(2, widget.IMG, { x: 0, y: 0, w: 480, h: 480, src: L.blank, show_level: NORMAL })
  mk(2, widget.IMG, { x: 0, y: 0, src: F.overlay, show_level: NORMAL })
  const text = (c) =>
    mk(2, widget.TEXT, { x: c.x, y: c.y, w: c.w, h: c.h, color: c.color, text_size: c.size, align_h: align.CENTER_H, align_v: align.CENTER_V, text: c.text || '', show_level: NORMAL })
  const empty = text(F.empty)
  const link = text(F.link)
  // 真ん中をタップ → HYROX Link の地図画面（スクロール・拡大）、まわりをタップ → 2 ページ目へ
  const close = mk(2, widget.IMG, { x: 0, y: 0, w: 480, h: 480, src: L.blank, show_level: NORMAL })
  close.addEventListener(event.CLICK_UP, () => setPage(1))
  const open = mk(2, widget.IMG, { x: 110, y: 110, w: 260, h: 260, src: L.blank, show_level: NORMAL })
  open.addEventListener(event.CLICK_UP, () => {
    try {
      launchApp({ appId: LINK_APP_ID, url: 'page/map' })
    } catch (e) {
      logger.log('launchApp failed')
      setPage(1)
    }
  })

  return function update() {
    if (page !== 2) return
    const l = readLink()
    const src = l && copyLinkFile('mapfull', l.mapfull)
    if (src) map.setProperty(prop.SRC, src)
    // 届いていない / 届いたが読めない を分けて出す
    empty.setProperty(prop.TEXT, l && l.mapfull && l.mapfull.path ? 'FULL MAP LOAD ERROR' : F.empty.text)
    showOnPage(empty, 2, !src)
    const st = l && l.state
    if (st && st.ok) {
      const sec = Math.max(0, Math.floor(Date.now() / 1000) - (st.now - (st.age || 0)))
      link.setProperty(prop.TEXT, `LINK ${ago(sec)}`)
    }
  }
}

function buildPage2() {
  const P = L.p2
  mk(1, widget.IMG, { x: 0, y: 0, src: P.bg, show_level: NORMAL })
  const liveMap = mk(1, widget.IMG, { x: P.map.x, y: P.map.y, w: P.map.w, h: P.map.h, src: L.blank, show_level: NORMAL })
  mk(1, widget.IMG, { x: P.map.x, y: P.map.y, src: P.map.overlay, show_level: NORMAL })
  // 地図が古い位置のときの目印
  const mapOld = mk(1, widget.TEXT, {
    x: 130,
    y: P.map.y + 34,
    w: 220,
    h: 20,
    color: 0xff8c1a,
    text_size: 14,
    char_space: 1,
    font: L.place_font,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V,
    text: '',
    show_level: NORMAL,
  })
  hiddenWidgets.add(mapOld)

  // 縁の 24 時間リング: 固定の目盛り + 日の出〜日の入りの弧 + 雨の弧 + 日の出入りと今の時刻の印
  const R = P.ring
  mk(1, widget.IMG, { x: 0, y: 0, src: R.src, show_level: NORMAL })
  // ARC は w×h の枠の内側に描かれる（radius は効かない）ので、線の中心が radius に来るよう枠を決める
  const arcOpts = (a) => {
    const R = Math.round(a.radius + a.width / 2)
    return { x: 240 - R, y: 240 - R, w: 2 * R, h: 2 * R, radius: R, line_width: a.width, color: a.color, start_angle: -90, end_angle: -89, show_level: NORMAL }
  }
  const dayArc = mk(1, widget.ARC, arcOpts(R.day_arc))
  const rainArcs = [0, 1, 2, 3, 4, 5, 6, 7].map(() => {
    const w = mk(1, widget.ARC, arcOpts(R.rain_arc))
    hiddenWidgets.add(w)
    return w
  })
  const marker = (m) => ({ x: 0, y: 0, w: 480, h: 480, pos_x: m.pos_x, pos_y: m.pos_y, center_x: 240, center_y: 240, angle: 0, src: m.src, show_level: NORMAL })
  const sunRise = mk(1, widget.IMG, marker(R.sun))
  const sunSet = mk(1, widget.IMG, marker(R.sun))
  const nowMark = mk(1, widget.IMG, marker(R.now))

  const updateNow = () => nowMark.setProperty(prop.ANGLE, ringDeg(minutesOfDay(new Date())))
  try {
    new Time().onPerMinute(updateNow)
  } catch (e) {
    logger.log('time sensor unavailable')
  }
  pageListeners.push(function updateRing() {
    updateNow()
    const link = readLink()
    const st = link && link.state
    const lat = st && st.lat != null ? st.lat : HOME_LATLON[0]
    const lon = st && st.lon != null ? st.lon : HOME_LATLON[1]
    const t = sunTimes(lat, lon, new Date())
    if (isFinite(t.rise) && isFinite(t.set)) {
      dayArc.setProperty(prop.MORE, arcRange(t.rise, t.set))
      sunRise.setProperty(prop.ANGLE, ringDeg(t.rise))
      sunSet.setProperty(prop.ANGLE, ringDeg(t.set))
    }
    // 雨: 2 時間先までの 15 分枠のうち降る枠を縁に青く
    const rain = st && st.rain
    const nowSec = Math.floor(Date.now() / 1000)
    rainArcs.forEach((w, i) => {
      const v = rain && rain.slots ? rain.slots[i] || 0 : 0
      const s0 = rain && rain.start ? rain.start + i * 900 : 0
      const s1 = s0 + 900
      const on = v >= 0.1 && s1 > nowSec && s0 < nowSec + 3 * 3600
      if (on) {
        const from = minutesOfDay(new Date(Math.max(s0, nowSec) * 1000))
        w.setProperty(prop.MORE, arcRange(from, minutesOfDay(new Date(s1 * 1000))))
      }
      showOnPage(w, 1, on)
    })
  })
  const hud = mk(1, widget.IMG, { x: P.hud.x, y: P.hud.y, w: P.hud.w, h: P.hud.h, src: L.blank, show_level: NORMAL })
  const coords = mk(1, widget.TEXT, {
    x: P.coords.x,
    y: P.coords.y,
    w: P.coords.w,
    h: P.coords.h,
    color: P.coords.color,
    text_size: P.coords.size,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V,
    text: P.coords.text,
    show_level: NORMAL,
  })
  pageListeners.push(function updateLink() {
    const link = readLink()
    const st = link && link.state
    if (st && st.ok && st.lat != null) {
      const tst = st.now - (st.age || 0)
      const sec = Math.max(0, Math.floor(Date.now() / 1000) - tst)
      coords.setProperty(prop.TEXT, `${st.lat.toFixed(3)}°N ${st.lon.toFixed(3)}°E · LINK ${ago(sec)}`)
    }
    const src = link && copyLinkFile('map', link.map)
    if (src) liveMap.setProperty(prop.SRC, src)
    const stale = staleness()
    if (stale) mapOld.setProperty(prop.TEXT, staleText(stale))
    showOnPage(mapOld, 1, !!stale)
    const hsrc = link && copyLinkFile('hud', link.hud)
    if (hsrc) hud.setProperty(prop.SRC, hsrc)
  })
  ;['pres', 'alt', 'temp', 'high', 'low', 'sunset', 'bat', 'steps', 'trail'].forEach((k) => p2value(P[k]))
  if (data_type.BATTERY !== undefined) {
    mk(1, widget.IMG_LEVEL, {
      x: P.bat_bars.x,
      y: P.bat_bars.y,
      image_array: P.bat_bars.src,
      image_length: P.bat_bars.src.length,
      type: data_type.BATTERY,
      show_level: NORMAL,
    })
  }
  mk(1, widget.IMG_WEEK, {
    x: P.week.x,
    y: P.week.y,
    week_en: P.week.src,
    week_tc: P.week.src,
    week_sc: P.week.src,
    show_level: NORMAL,
  })
  mk(1, widget.IMG_DATE, {
    day_startX: P.date.day_x,
    day_startY: P.date.day_y,
    day_zero: 1,
    day_follow: 0,
    day_space: 0,
    day_en_array: P.date.day,
    day_sc_array: P.date.day,
    day_tc_array: P.date.day,
    month_startX: P.date.month_x,
    month_startY: P.date.month_y,
    month_is_character: true,
    month_en_array: P.date.month,
    month_sc_array: P.date.month,
    month_tc_array: P.date.month,
    show_level: NORMAL,
  })
  mk(1, widget.IMG_TIME, {
    hour_zero: 1,
    hour_startX: P.time.hour_x,
    hour_startY: P.time.y,
    hour_array: P.time.digits,
    hour_space: 0,
    minute_zero: 1,
    minute_startX: P.time.minute_x,
    minute_startY: P.time.y,
    minute_array: P.time.digits,
    minute_space: 0,
    minute_follow: 0,
    second_zero: 1,
    second_startX: P.time.sec_x,
    second_startY: P.time.sec_y,
    second_array: P.time.sec,
    second_space: 0,
    second_follow: 0,
    show_level: NORMAL,
  })
  pageToggle(1, { x: 140, y: 224, w: 320, h: 70 })
  // 地図をタップで全画面地図へ
  const toFull = mk(1, widget.IMG, { x: 40, y: P.map.y + 8, w: 400, h: 120, src: L.blank, show_level: NORMAL })
  toFull.addEventListener(event.CLICK_UP, () => setPage(2))
  return placeWidgets(1, P.place, null)
}

WatchFace({
  build() {
    // 1 ページ目（CROSSFIT）
    pageListeners.push(buildPage1())

    // 2 ページ目（タップで切り替え）と全画面地図
    pageListeners.push(buildPage2())
    pageListeners.push(buildPage3())

    setPage(0)
    createWidget(widget.WIDGET_DELEGATE, {
      resume_call: () => {
        if (page === 2) setPage(1) // 地図アプリから戻ったら 2 ページ目
        else pageListeners.forEach((fn) => fn())
      },
    })

    // 編集モードの背景マスク
    createWidget(widget.WATCHFACE_EDIT_MASK, { x: 0, y: 0, w: 480, h: 480, src: L.mask100, show_level: EDIT })
    createWidget(widget.WATCHFACE_EDIT_FG_MASK, { x: 0, y: 0, w: 480, h: 480, src: L.mask70, show_level: EDIT })
    editPreviews.forEach((p) => createWidget(widget.IMG, { x: p.x, y: p.y, src: p.src, show_level: EDIT }))
  },

  onInit() {
    logger.log('watchface init')
  },

  onDestroy() {
    logger.log('watchface destroy')
  },
})
