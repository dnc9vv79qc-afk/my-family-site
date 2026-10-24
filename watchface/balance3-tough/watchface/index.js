// TOUGH Ti: G-SHOCK（GA-2100）風の真っ黒なアナデジ文字盤。絵と座標は tools/gen.py が作る layout.js（L）にある。
// 時・分・秒の針は TIME_POINTER。9 時のサブダイヤルの曜日の針は IMG_WEEK（月曜始まりの 7 コマ）。
// 4 時の液晶窓に デジタル時刻（IMG_TIME）・日付（IMG_DATE）・電池（TEXT_IMG）
import { createWidget, widget, show_level, data_type, align } from '@zos/ui'
import { L } from './layout'

const NORMAL = show_level.ONLY_NORMAL
const AOD = show_level.ONAL_AOD
const D = L.lcd

function lcdTime(digits, level) {
  createWidget(widget.IMG_TIME, {
    hour_zero: 1,
    hour_startX: D.time_x,
    hour_startY: D.time_y,
    hour_array: digits,
    hour_space: D.space,
    minute_zero: 1,
    minute_startX: D.min_x,
    minute_startY: D.time_y,
    minute_array: digits,
    minute_space: D.space,
    minute_follow: 0,
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

    // 液晶窓: 上の段に日付と電池、下の段にデジタル時刻
    lcdTime(D.big, NORMAL)
    createWidget(widget.IMG_DATE, {
      day_startX: D.day_x,
      day_startY: D.day_y,
      day_zero: 1,
      day_follow: 0,
      day_space: 1,
      day_en_array: D.small,
      day_sc_array: D.small,
      day_tc_array: D.small,
      show_level: NORMAL,
    })
    if (data_type.BATTERY !== undefined) {
      createWidget(widget.TEXT_IMG, {
        x: D.bat_x,
        y: D.bat_y,
        w: D.bat_w,
        h: 14,
        type: data_type.BATTERY,
        font_array: D.small,
        h_space: 1,
        align_h: align.RIGHT,
        show_level: NORMAL,
      })
    }

    hands(L.hour, L.minute, L.second, L.cap, NORMAL)

    // 常時表示: 黒地にインデックスの輪郭・液晶の時刻・中抜きの時分針
    createWidget(widget.IMG, { x: 0, y: 0, src: L.aod_bg, show_level: AOD })
    lcdTime(D.big_aod, AOD)
    hands(L.hour_aod, L.minute_aod, null, L.cap_aod, AOD)
  },
})
