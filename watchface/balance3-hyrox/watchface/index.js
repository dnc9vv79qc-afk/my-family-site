import { createWidget, widget, align, prop, event, show_level, text_style, data_type, edit_type } from '@zos/ui'
import { Weather, Time } from '@zos/sensor'
import { log } from '@zos/utils'
import { LocalStorage, FileSystem } from '@zos/share-storage'
import { writeFileSync } from '@zos/fs'
import { L } from './layout'
import { placeLabel } from './romaji'

const logger = log.getLogger('hyrox-face')

const NORMAL = show_level.ONLY_NORMAL
const AOD = show_level.ONAL_AOD
const EDIT = show_level.ONLY_EDIT

// ページ切り替え: pages[n] に入れたウィジェットだけを表示する（0 = CROSSFIT, 1 = データ + 地図）
const pages = [[], []]
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

  if (GAUGE_PROGRESS.indexOf(key) >= 0) {
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
    roman.setProperty(prop.TEXT, label || '')
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
const linkFiles = {} // kind -> { ts, slot }

function readLink() {
  try {
    const s = new LocalStorage(LINK_APP_ID, 'link.json')
    if (!s.isExisted()) return null
    return { state: s.getItem('state', null), map: s.getItem('map', null), hud: s.getItem('hud', null) }
  } catch (e) {
    logger.log('link read failed')
    return null
  }
}

// 連携アプリのファイルを自分の data に写して IMG で使う。同じ名前だと表示が更新されないので 2 つを交互に使う
function copyLinkFile(kind, entry) {
  if (!entry || !entry.path) return null
  const cur = linkFiles[kind] || { ts: 0, slot: 0 }
  if (entry.ts === cur.ts) return `data://live_${kind}_${cur.slot}.png`
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
    const slot = 1 - cur.slot
    const dst = `data://live_${kind}_${slot}.png`
    writeFileSync({ path: dst, data: buf })
    linkFiles[kind] = { ts: entry.ts, slot }
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
  createWidget(
    widget.IMG_DATE,
    Object.assign({ show_level: AOD }, dateOpts, digits(P.date.aod), { month_unit_en: P.date.dot_aod, month_unit_sc: P.date.dot_aod, month_unit_tc: P.date.dot_aod }),
  )
  const weekOpts = { x: P.week.x, y: P.week.y, week_en: P.week.src, week_tc: P.week.src, week_sc: P.week.src }
  mk(0, widget.IMG_WEEK, Object.assign({ show_level: NORMAL }, weekOpts))
  createWidget(widget.IMG_WEEK, Object.assign({ show_level: AOD }, weekOpts))

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

  // 月の名前 + カレンダー（日曜始まり、今日に丸）
  mk(0, widget.IMG_DATE, {
    month_startX: P.month.x,
    month_startY: P.month.y,
    month_is_character: true,
    month_en_array: P.month.src,
    month_sc_array: P.month.src,
    month_tc_array: P.month.src,
    show_level: NORMAL,
  })
  const C = P.cal
  const ring = mk(0, widget.IMG, { x: 0, y: 0, src: C.ring, show_level: NORMAL })
  const cells = []
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
  let calKey = ''
  const updateCalendar = () => {
    const now = new Date()
    const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`
    if (key === calKey) return
    calKey = key
    const first = new Date(now.getFullYear(), now.getMonth(), 1).getDay() // 日曜始まり
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    cells.forEach((w, i) => {
      const day = i - first + 1
      const on = day >= 1 && day <= days
      w.setProperty(prop.TEXT, on ? String(day) : '')
      w.setProperty(prop.COLOR, day === now.getDate() ? C.today_color : C.color)
      if (day === now.getDate()) {
        ring.setProperty(prop.X, Math.round(C.x0 + (i % 7) * C.dx - 10))
        ring.setProperty(prop.Y, Math.round(C.y0 + Math.floor(i / 7) * C.dy - 10))
      }
    })
  }

  P.gauge.slots.forEach(gaugeSlot)
  pageToggle(0, P.toggle)

  let wxAt = 0
  const update = () => {
    const on = page === 0
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
    place1.setProperty(prop.TEXT, words[0] || '')
    place2.setProperty(prop.TEXT, words.slice(1).join(' '))
    placeRaw.setProperty(prop.TEXT, label ? '' : city || '')
    place1.setProperty(prop.VISIBLE, on && !!label)
    place2.setProperty(prop.VISIBLE, on && !!label)
    placeRaw.setProperty(prop.VISIBLE, on && !label)
    // 雨
    const r = rainStatus()
    if (r.min != null) rainMin.setProperty(prop.TEXT, `${r.min}u`)
    else rainWord.setProperty(prop.SRC, R.words[r.word])
    showOnPage(rainMin, 0, r.min != null)
    showOnPage(rainWord, 0, r.min == null)
  }
  try {
    new Time().onPerMinute(() => {
      if (page === 0) update()
    })
  } catch (e) {
    logger.log('time sensor unavailable')
  }
  return update
}

function buildPage2() {
  const P = L.p2
  mk(1, widget.IMG, { x: 0, y: 0, src: P.bg, show_level: NORMAL })
  const liveMap = mk(1, widget.IMG, { x: P.map.x, y: P.map.y, w: P.map.w, h: P.map.h, src: L.blank, show_level: NORMAL })
  mk(1, widget.IMG, { x: P.map.x, y: P.map.y, src: P.map.overlay, show_level: NORMAL })

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
  return placeWidgets(1, P.place, null)
}

WatchFace({
  build() {
    // 1 ページ目（CROSSFIT）
    pageListeners.push(buildPage1())

    // 2 ページ目（タップで切り替え）
    pageListeners.push(buildPage2())

    setPage(0)
    createWidget(widget.WIDGET_DELEGATE, { resume_call: () => pageListeners.forEach((fn) => fn()) })

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
