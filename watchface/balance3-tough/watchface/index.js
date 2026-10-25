// TOUGH Ti: G-SHOCK（GW-B5600 / GA-2100）風のデジタル文字盤。絵と座標は tools/gen.py が作る layout.js（L）にある。
// 真ん中の液晶に 時:分（IMG_TIME）と秒、曜日（IMG_WEEK、月曜始まり）、月-日（IMG_DATE）、電池（TEXT_IMG）
import { createWidget, widget, show_level, data_type, align } from '@zos/ui'
import { L } from './layout'

const NORMAL = show_level.ONLY_NORMAL
const AOD = show_level.ONAL_AOD
const D = L.lcd

function time(big, sec, level) {
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
    Object.assign(opts, { second_zero: 1, second_startX: D.sec_x, second_startY: D.sec_y, second_array: sec, second_space: 2, second_follow: 0 })
  }
  createWidget(widget.IMG_TIME, opts)
}

WatchFace({
  build() {
    createWidget(widget.IMG, { x: 0, y: 0, src: L.bg, show_level: NORMAL })
    time(D.big, D.sec, NORMAL)
    createWidget(widget.IMG_WEEK, { x: D.week_x, y: D.week_y, week_en: D.week, week_tc: D.week, week_sc: D.week, show_level: NORMAL })
    createWidget(widget.IMG_DATE, {
      month_startX: D.month_x,
      month_startY: D.date_y,
      month_zero: 1,
      month_follow: 0,
      month_space: 2,
      month_en_array: D.small,
      month_sc_array: D.small,
      month_tc_array: D.small,
      day_startX: D.day_x,
      day_startY: D.date_y,
      day_zero: 1,
      day_follow: 0,
      day_space: 2,
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
        h: D.small_h + 2,
        type: data_type.BATTERY,
        font_array: D.small,
        h_space: 1,
        align_h: align.RIGHT,
        show_level: NORMAL,
      })
    }

    // 常時表示: 黒地に液晶の枠と 時:分 だけ
    createWidget(widget.IMG, { x: 0, y: 0, src: L.aod_bg, show_level: AOD })
    time(D.big_aod, null, AOD)
  },
})
