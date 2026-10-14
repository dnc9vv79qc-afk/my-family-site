import { createWidget, widget, align, prop, event, show_level, text_style, data_type, edit_type } from '@zos/ui'
import { Weather } from '@zos/sensor'
import { log } from '@zos/utils'
import { LocalStorage, FileSystem } from '@zos/share-storage'
import { writeFileSync } from '@zos/fs'
import { L } from './layout'
import { placeLabel } from './romaji'

const logger = log.getLogger('hyrox-face')

const NORMAL = show_level.ONLY_NORMAL
const AOD = show_level.ONAL_AOD
const EDIT = show_level.ONLY_EDIT

// ページ切り替え: pages[n] に入れたウィジェットだけを表示する（0 = HYROX, 1 = データ + 地図）
const pages = [[], []]
let page = 0
const pageListeners = []

function mk(p, type, opts) {
  const w = createWidget(type, opts)
  pages[p].push(w)
  return w
}

function setPage(n) {
  page = n
  pages.forEach((ws, i) => ws.forEach((w) => w.setProperty(prop.VISIBLE, i === n)))
  pageListeners.forEach((fn) => fn())
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

function arc(cfg) {
  const type = data_type[cfg.kind]
  if (type === undefined) {
    mk(0, widget.IMG, { x: cfg.x, y: cfg.y, src: cfg.src[0], show_level: NORMAL })
    return
  }
  mk(0, widget.IMG_LEVEL, {
    x: cfg.x,
    y: cfg.y,
    image_array: cfg.src,
    image_length: cfg.src.length,
    type,
    show_level: NORMAL,
  })
}

// 編集画面で枠の中に見せるプレビュー（マスクより上に描くため最後にまとめて作る）
const editPreviews = []

// 表示枠: 編集グループを作り、ユーザーが選んだデータを描く
function complication(slot) {
  const keys = L.order.filter(supported)
  const style = L.edit_styles[slot.style]
  const defaultKey = supported(slot.default) ? slot.default : keys[0]

  const group = createWidget(widget.WATCHFACE_EDIT_GROUP, {
    edit_id: slot.edit_id,
    x: slot.x,
    y: slot.y,
    w: slot.w,
    h: slot.h,
    select_image: style.select,
    un_select_image: style.unselect,
    default_type: ET[defaultKey],
    optional_types: keys.map((k) => ({
      type: ET[k],
      preview: style.preview[k],
      title_en: L.types[k].title,
      title_sc: L.types[k].title,
      title_tc: L.types[k].title,
    })),
    count: keys.length,
    tips_BG: L.tips,
    tips_x: slot.tips_x,
    tips_y: slot.tips_y,
    tips_width: 132,
    tips_margin: 6,
  })

  const current = group.getProperty(prop.CURRENT_TYPE)
  let key = keys.find((k) => ET[k] === current || data_type[k] === current)
  if (!key) key = defaultKey
  const t = L.types[key]
  const f = L.fonts[slot.font]
  editPreviews.push({ x: slot.x, y: slot.y, src: style.preview[key] })

  if (slot.style === 'mid') {
    mk(0, widget.IMG, {
      x: slot.label.x,
      y: Math.round(slot.label.cy - t.label_h / 2),
      src: t.label,
      show_level: NORMAL,
    })
  } else {
    mk(0, widget.IMG, { x: slot.icon.x, y: slot.icon.y, src: t.icon, show_level: NORMAL })
  }

  const opts = {
    x: slot.value.x - 10,
    y: slot.value.y,
    w: slot.value.w + 20,
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
  mk(0, widget.IMG_CLICK, {
    x: slot.x,
    y: slot.y,
    w: slot.w,
    h: slot.h,
    src: L.blank,
    type: data_type[key],
  })
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
  const roman = createWidget(widget.TEXT, Object.assign({}, base, { font: L.place.font }))
  const raw = createWidget(widget.TEXT, Object.assign({}, base, { char_space: 0, text_size: P.size - 2 }))

  return function update() {
    const city = readCityName()
    const label = placeLabel(city)
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
let linkMapTs = 0
let linkMapSlot = 0

function readLink() {
  try {
    const s = new LocalStorage(LINK_APP_ID, 'link.json')
    if (!s.isExisted()) return null
    return { state: s.getItem('state', null), map: s.getItem('map', null) }
  } catch (e) {
    logger.log('link read failed')
    return null
  }
}

// 連携アプリの地図ファイルを自分の data に写して IMG で使う。同じ名前だと表示が更新されないので 2 つを交互に使う
function copyLinkMap(map) {
  if (!map || !map.path) return null
  if (map.ts === linkMapTs) return `data://live_map_${linkMapSlot}.png`
  try {
    const fs = new FileSystem(LINK_APP_ID)
    let buf = null
    for (const p of [map.path, map.path.replace(/^data:\/\//, '')]) {
      try {
        buf = fs.readFileSync({ path: p })
      } catch (e) {
        buf = null
      }
      if (buf) break
    }
    if (!buf) return null
    linkMapSlot = 1 - linkMapSlot
    const dst = `data://live_map_${linkMapSlot}.png`
    writeFileSync({ path: dst, data: buf })
    linkMapTs = map.ts
    return dst
  } catch (e) {
    logger.log('link map copy failed')
    return null
  }
}

function ago(sec) {
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`
  return `${Math.floor(sec / 86400)}d`
}

function buildPage2() {
  const P = L.p2
  mk(1, widget.IMG, { x: 0, y: 0, src: P.bg, show_level: NORMAL })
  const liveMap = mk(1, widget.IMG, { x: P.map.x, y: P.map.y, w: P.map.w, h: P.map.h, src: L.blank, show_level: NORMAL })
  mk(1, widget.IMG, { x: P.map.x, y: P.map.y, src: P.map.overlay, show_level: NORMAL })
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
    const src = link && copyLinkMap(link.map)
    if (src) liveMap.setProperty(prop.SRC, src)
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
  pageToggle(1, { x: 140, y: 240, w: 330, h: 80 })
  return placeWidgets(1, P.place, null)
}

WatchFace({
  build() {
    mk(0, widget.IMG, { x: 0, y: 0, src: L.bg, show_level: NORMAL })

    Object.keys(L.arcs).forEach((k) => arc(L.arcs[k]))

    // 日付（月 + 日）
    const dateOpts = {
      month_startX: L.date.month_x,
      month_startY: L.date.month_y,
      month_is_character: true,
      month_en_array: L.date.month,
      month_sc_array: L.date.month,
      month_tc_array: L.date.month,
      day_startX: L.date.day_x,
      day_startY: L.date.day_y,
      day_zero: 1,
      day_follow: 0,
      day_space: 0,
      day_en_array: L.date.day,
      day_sc_array: L.date.day,
      day_tc_array: L.date.day,
    }
    mk(0, widget.IMG_DATE, Object.assign({ show_level: NORMAL }, dateOpts))
    createWidget(widget.IMG_DATE, Object.assign({ show_level: AOD }, dateOpts))

    L.slots.forEach(complication)

    pageListeners.push(placeWidgets(0, L.place, L.brand))

    // 時刻（通常表示）
    mk(0, widget.IMG_TIME, {
      hour_zero: 1,
      hour_startX: L.time.hour_x,
      hour_startY: L.time.y,
      hour_array: L.time.hour,
      hour_space: 0,
      minute_zero: 1,
      minute_startX: L.time.minute_x,
      minute_startY: L.time.y,
      minute_array: L.time.hour,
      minute_space: 0,
      minute_follow: 0,
      second_zero: 1,
      second_startX: L.sec.x,
      second_startY: L.sec.y,
      second_array: L.sec.digits,
      second_space: 0,
      second_follow: 0,
      am_x: L.ampm.am_x,
      am_y: L.ampm.am_y,
      am_sc_path: L.ampm.am,
      am_en_path: L.ampm.am,
      pm_x: L.ampm.pm_x,
      pm_y: L.ampm.pm_y,
      pm_sc_path: L.ampm.pm,
      pm_en_path: L.ampm.pm,
      show_level: NORMAL,
    })

    // 時刻（常時表示 AOD: 秒なし・グレー）
    createWidget(widget.IMG_TIME, {
      hour_zero: 1,
      hour_startX: L.time.hour_x,
      hour_startY: L.time.y,
      hour_array: L.time.aod,
      hour_space: 0,
      minute_zero: 1,
      minute_startX: L.time.minute_x,
      minute_startY: L.time.y,
      minute_array: L.time.aod,
      minute_space: 0,
      minute_follow: 0,
      show_level: AOD,
    })
    createWidget(widget.IMG, { x: L.colon_aod.x, y: L.colon_aod.y, src: L.colon_aod.src, show_level: AOD })

    // 曜日（その日がハイライトされた行画像を切り替える）
    const weekOpts = { x: L.week.x, y: L.week.y, week_en: L.week.src, week_tc: L.week.src, week_sc: L.week.src }
    mk(0, widget.IMG_WEEK, Object.assign({ show_level: NORMAL }, weekOpts))
    createWidget(widget.IMG_WEEK, Object.assign({ show_level: AOD }, weekOpts))

    pageToggle(0, { x: 88, y: 204, w: 300, h: 100 })

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
