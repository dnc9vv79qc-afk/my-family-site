// TOUGH Ti: ミリタリー × シンプルのアナログ文字盤（黒 × オレンジ）。絵と座標は tools/gen.py が作る layout.js（L）にある。
// 時・分・秒のスケルトン針は TIME_POINTER。左の曜日は IMG_WEEK（月曜始まりの 7 コマ）、
// 右の窓にデジタル時刻（IMG_TIME）と日付（IMG_DATE）、下の電池はリング（IMG_LEVEL）と残量（TEXT_IMG）
import { createWidget, widget, show_level, data_type, align } from '@zos/ui'
import { L } from './layout'

const NORMAL = show_level.ONLY_NORMAL
const AOD = show_level.ONAL_AOD
const D = L.win
const B = L.bat

function winTime(digits, level) {
  createWidget(widget.IMG_TIME, {
    hour_zero: 1,
    hour_startX: D.time_x,
    hour_startY: D.time_y,
    hour_array: digits,
    hour_space: 0,
    minute_zero: 1,
    minute_startX: D.min_x,
    minute_startY: D.time_y,
    minute_array: digits,
    minute_space: 0,
    minute_follow: 0,
    show_level: level,
  })
}

function winDate(digits, level) {
  createWidget(widget.IMG_DATE, {
    month_startX: D.date_x,
    month_startY: D.date_y,
    month_zero: 1,
    month_follow: 0,
    month_space: 0,
    month_en_array: digits,
    month_sc_array: digits,
    month_tc_array: digits,
    day_startX: D.day_x,
    day_startY: D.date_y,
    day_zero: 1,
    day_follow: 0,
    day_space: 0,
    day_en_array: digits,
    day_sc_array: digits,
    day_tc_array: digits,
    show_level: level,
  })
}

function hands(h, m, s, cap, level) {
  const opts = {
    hour_centerX: 240,
    hour_centerY: 240,
    hour_posX: h.pos_x,
    hour_posY: h.pos_y,
    hour_path: h.path,
    minute_centerX: 240,
    minute_centerY: 240,
    minute_posX: m.pos_x,
    minute_posY: m.pos_y,
    minute_path: m.path,
    show_level: level,
  }
  if (s) {
    Object.assign(opts, { second_centerX: 240, second_centerY: 240, second_posX: s.pos_x, second_posY: s.pos_y, second_path: s.path })
    Object.assign(opts, { second_cover_path: cap.path, second_cover_x: cap.x, second_cover_y: cap.y })
  } else {
    Object.assign(opts, { minute_cover_path: cap.path, minute_cover_x: cap.x, minute_cover_y: cap.y })
  }
  createWidget(widget.TIME_POINTER, opts)
}

WatchFace({
  build() {
    createWidget(widget.IMG, { x: 0, y: 0, src: L.bg, show_level: NORMAL })
    createWidget(widget.IMG_WEEK, { x: L.week.x, y: L.week.y, week_en: L.week.src, week_tc: L.week.src, week_sc: L.week.src, show_level: NORMAL })

    // 右の窓: デジタル時刻と 月 / 日
    winTime(D.time, NORMAL)
    winDate(D.date, NORMAL)

    // 下の電池: オレンジのリング（21 コマ）と残量
    if (data_type.BATTERY !== undefined) {
      createWidget(widget.IMG_LEVEL, { x: B.x, y: B.y, image_array: B.src, image_length: B.src.length, type: data_type.BATTERY, show_level: NORMAL })
      createWidget(widget.TEXT_IMG, {
        x: B.num_x,
        y: B.num_y,
        w: B.num_w,
        h: B.num_h,
        type: data_type.BATTERY,
        font_array: B.num,
        unit_en: B.unit,
        unit_sc: B.unit,
        unit_tc: B.unit,
        h_space: 0,
        align_h: align.CENTER_H,
        show_level: NORMAL,
      })
    }

    hands(L.hour, L.minute, L.second, L.cap, NORMAL)

    // 常時表示: 黒地にインデックスの輪郭（12・3・6・9 はオレンジ）、窓の時刻と日付、中抜きの時分針
    createWidget(widget.IMG, { x: 0, y: 0, src: L.aod_bg, show_level: AOD })
    winTime(D.time_aod, AOD)
    winDate(D.date_aod, AOD)
    hands(L.hour_aod, L.minute_aod, null, L.cap_aod, AOD)
  },
})
