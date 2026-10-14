import { createWidget, widget, align, prop, show_level, text_style, data_type, edit_type } from '@zos/ui'
import { Weather } from '@zos/sensor'
import { log } from '@zos/utils'
import { L } from './layout'
import { placeLabel } from './romaji'

const logger = log.getLogger('hyrox-face')

const NORMAL = show_level.ONLY_NORMAL
const AOD = show_level.ONAL_AOD
const EDIT = show_level.ONLY_EDIT

// edit_type が無い環境では data_type と同じ値を使う（公式サンプルも両者を同一視している）
const ET = edit_type || data_type

// 機種・OS バージョンで使えないデータ種別は選択肢から外す
function supported(key) {
  return data_type[key] !== undefined && ET[key] !== undefined
}

function arc(cfg) {
  const type = data_type[cfg.kind]
  if (type === undefined) {
    createWidget(widget.IMG, { x: cfg.x, y: cfg.y, src: cfg.src[0], show_level: NORMAL })
    return
  }
  createWidget(widget.IMG_LEVEL, {
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
    createWidget(widget.IMG, {
      x: slot.label.x,
      y: Math.round(slot.label.cy - t.label_h / 2),
      src: t.label,
      show_level: NORMAL,
    })
  } else {
    createWidget(widget.IMG, { x: slot.icon.x, y: slot.icon.y, src: t.icon, show_level: NORMAL })
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
  createWidget(widget.TEXT_IMG, opts)

  // タップで対応する純正アプリを開く
  createWidget(widget.IMG_CLICK, {
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
  try {
    const f = new Weather().getForecastWeather()
    if (f && f.cityName) return f.cityName
  } catch (e) {
    logger.log('weather unavailable')
  }
  return ''
}

// 現在地: ローマ字にできれば Rubik、できなければ元の表記をシステムフォントで。取れなければ amazfit ロゴ
function placeWidgets() {
  const P = L.place
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
  const brand = createWidget(widget.IMG, { x: L.brand.x, y: L.brand.y, src: L.brand.src, show_level: NORMAL })
  const roman = createWidget(widget.TEXT, Object.assign({}, base, { font: P.font }))
  const raw = createWidget(widget.TEXT, Object.assign({}, base, { char_space: 0, text_size: P.size - 2 }))

  return function update() {
    const city = readCityName()
    const label = placeLabel(city)
    roman.setProperty(prop.TEXT, label || '')
    raw.setProperty(prop.TEXT, label ? '' : city)
    roman.setProperty(prop.VISIBLE, !!label)
    raw.setProperty(prop.VISIBLE, !label && !!city)
    brand.setProperty(prop.VISIBLE, !city)
  }
}

WatchFace({
  build() {
    createWidget(widget.IMG, { x: 0, y: 0, src: L.bg, show_level: NORMAL })

    Object.keys(L.arcs).forEach((k) => arc(L.arcs[k]))

    // 日付（月 + 日）
    createWidget(widget.IMG_DATE, {
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
      show_level: NORMAL | AOD,
    })

    L.slots.forEach(complication)

    const updatePlace = placeWidgets()
    updatePlace()
    createWidget(widget.WIDGET_DELEGATE, { resume_call: updatePlace })

    // 時刻（通常表示）
    createWidget(widget.IMG_TIME, {
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
    createWidget(widget.IMG_WEEK, {
      x: L.week.x,
      y: L.week.y,
      week_en: L.week.src,
      week_tc: L.week.src,
      week_sc: L.week.src,
      show_level: NORMAL | AOD,
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
