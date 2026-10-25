// TOUGH Ti: GA-2100 と GW-B5600 を混ぜたアナデジ文字盤。絵と座標は tools/gen.py が作る layout.js（L）にある。
// 針は TIME_POINTER。下の液晶に 時:分 と秒（IMG_TIME）、上の液晶に曜日（IMG_WEEK、月曜始まり）と 月-日（IMG_DATE）、
// 9 時の小さなダイヤルに電池の針（IMG_LEVEL、21 コマ）
import { createWidget, widget, show_level, data_type } from '@zos/ui'
import { L } from './layout'

const NORMAL = show_level.ONLY_NORMAL
const AOD = show_level.ONAL_AOD
const D = L.lcd

function lcdTime(big, sec, level) {
  const opts = {
    hour_zero: 1,
    hour_startX: D.time_x,
    hour_startY: D.time_y,
    hour_array: big,
    hour_space: D.big_space,
    minute_zero: 1,
    minute_startX: D.min_x,
    minute_startY: D.time_y,
    minute_array: big,
    minute_space: D.big_space,
    minute_follow: 0,
    show_level: level,
  }
  if (sec) {
    Object.assign(opts, { second_zero: 1, second_startX: D.sec_x, second_startY: D.sec_y, second_array: sec, second_space: 1, second_follow: 0 })
  }
  createWidget(widget.IMG_TIME, opts)
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
    lcdTime(D.big, D.sec, NORMAL)
    createWidget(widget.IMG_WEEK, { x: D.week_x, y: D.week_y, week_en: D.week, week_tc: D.week, week_sc: D.week, show_level: NORMAL })
    createWidget(widget.IMG_DATE, {
      month_startX: D.month_x,
      month_startY: D.date_y,
      month_zero: 1,
      month_follow: 0,
      month_space: 1,
      month_en_array: D.small,
      month_sc_array: D.small,
      month_tc_array: D.small,
      day_startX: D.day_x,
      day_startY: D.date_y,
      day_zero: 1,
      day_follow: 0,
      day_space: 1,
      day_en_array: D.small,
      day_sc_array: D.small,
      day_tc_array: D.small,
      show_level: NORMAL,
    })
    if (data_type.BATTERY !== undefined) {
      createWidget(widget.IMG_LEVEL, { x: L.bat.x, y: L.bat.y, image_array: L.bat.src, image_length: L.bat.src.length, type: data_type.BATTERY, show_level: NORMAL })
    }
    hands(L.hour, L.minute, L.second, L.cap, NORMAL)

    // 常時表示: インデックスの輪郭、液晶の 時:分、中抜きの時分針
    createWidget(widget.IMG, { x: 0, y: 0, src: L.aod_bg, show_level: AOD })
    lcdTime(D.big_aod, null, AOD)
    hands(L.hour_aod, L.minute_aod, null, L.cap_aod, AOD)
  },
})
