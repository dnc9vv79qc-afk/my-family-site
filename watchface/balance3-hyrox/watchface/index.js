import { createWidget, widget, align, show_level, data_type } from '@zos/ui'
import { log } from '@zos/utils'
import { L } from './layout'

const logger = log.getLogger('hyrox-face')

const NORMAL = show_level.ONLY_NORMAL
const AOD = show_level.ONAL_AOD

// 機種・OS バージョンによって無いデータ種別もあるので、存在しなければ "--" を出す
function dataType(kind) {
  const t = data_type[kind]
  if (t === undefined) logger.log(`data_type.${kind} is not supported`)
  return t
}

function value(cfg) {
  const type = dataType(cfg.kind)
  if (type === undefined) {
    createWidget(widget.IMG, { x: cfg.x + cfg.w / 2 - 12, y: cfg.y, src: cfg.invalid, show_level: NORMAL })
    return
  }
  const opts = {
    x: cfg.x,
    y: cfg.y,
    w: cfg.w,
    h: cfg.h,
    type,
    font_array: cfg.font,
    h_space: 0,
    align_h: align.CENTER_H,
    invalid_image: cfg.invalid,
    show_level: NORMAL,
  }
  if (cfg.unit) {
    opts.unit_en = cfg.unit
    opts.unit_sc = cfg.unit
    opts.unit_tc = cfg.unit
  }
  createWidget(widget.TEXT_IMG, opts)
}

function arc(cfg) {
  const type = dataType(cfg.kind)
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

    ;['stress', 'battery', 'epoc', 'steps', 'vo2max', 'heart', 'cal'].forEach((k) => value(L[k]))

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
  },

  onInit() {
    logger.log('watchface init')
  },

  onDestroy() {
    logger.log('watchface destroy')
  },
})
