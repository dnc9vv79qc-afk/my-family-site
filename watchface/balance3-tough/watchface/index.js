// TOUGH Ti: G-SHOCK 風のアナログ文字盤。絵と座標は tools/gen.py が作る layout.js（L）にある。
// 時・分・秒の針は TIME_POINTER。サブダイヤルの針は角度ごとのコマを差し替える:
//   曜日（左下）= IMG_WEEK / 電池（右下）= IMG_LEVEL（電池残量）/ 24 時間計（右上）= 毎分 JS で差し替え
import { createWidget, widget, show_level, data_type, prop } from '@zos/ui'
import { Time } from '@zos/sensor'
import { L } from './layout'

const NORMAL = show_level.ONLY_NORMAL
const AOD = show_level.ONAL_AOD

function dateOpts(src, level) {
  return {
    day_startX: L.date.x,
    day_startY: L.date.y,
    day_zero: 1,
    day_follow: 0,
    day_space: 0,
    day_en_array: src,
    day_sc_array: src,
    day_tc_array: src,
    show_level: level,
  }
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
    createWidget(widget.IMG_DATE, dateOpts(L.date.src, NORMAL))

    // 曜日: 月曜始まりの 7 コマ
    createWidget(widget.IMG_WEEK, { x: L.week.x, y: L.week.y, week_en: L.week.src, week_tc: L.week.src, week_sc: L.week.src, show_level: NORMAL })

    // 電池: 0〜100% を 21 コマ
    if (data_type.BATTERY !== undefined) {
      createWidget(widget.IMG_LEVEL, { x: L.bat.x, y: L.bat.y, image_array: L.bat.src, image_length: L.bat.src.length, type: data_type.BATTERY, show_level: NORMAL })
    }

    // 24 時間計: 30 分ごとのコマ
    const time = new Time()
    const h24 = createWidget(widget.IMG, { x: L.h24.x, y: L.h24.y, w: L.h24.w, h: L.h24.h, src: L.h24.src[0], show_level: NORMAL })
    const update24 = () => {
      const i = Math.floor((time.getHours() * 60 + time.getMinutes()) / 30) % L.h24.src.length
      h24.setProperty(prop.SRC, L.h24.src[i])
    }
    update24()
    time.onPerMinute(update24)
    createWidget(widget.WIDGET_DELEGATE, { resume_call: update24 })

    hands(L.hour, L.minute, L.second, L.cap, NORMAL)

    // 常時表示: 黒地に目盛りの輪郭・日付・中抜きの時分針
    createWidget(widget.IMG, { x: 0, y: 0, src: L.aod_bg, show_level: AOD })
    createWidget(widget.IMG_DATE, dateOpts(L.aod_date.src, AOD))
    hands(L.hour_aod, L.minute_aod, null, L.cap_aod, AOD)
  },
})
